import api from '../../../api/axios';
import { createMatch, searchMatchFacilities, getMatchDetail, modifyMatch, joinMatch, leaveMatch, deleteMatch, waitForMatchRequest, REQUEST_POLL_DELAYS, updateAttendance } from './matchApi';

jest.mock('../../../api/axios', () => ({ post: jest.fn(), get: jest.fn(), put: jest.fn(), delete: jest.fn(), patch: jest.fn() }));
afterEach(() => jest.clearAllMocks());

test('leaves only the current users participation and accepts an empty 204', async () => {
  api.delete.mockResolvedValue({ status: 204, data: '' });
  await expect(leaveMatch(101)).resolves.toBeUndefined();
  expect(api.delete).toHaveBeenCalledWith('/api/matches/101/participants/me');
});

test('does not report leave success for an unexpected 200 response', async () => {
  api.delete.mockResolvedValue({ status: 200, data: '<html>frontend fallback</html>' });
  await expect(leaveMatch(101)).rejects.toThrow('탈퇴 결과');
});

test.each([401, 403, 404])('preserves leave error %s for the page to handle', async status => {
  const error = { response: { status } };
  api.delete.mockRejectedValue(error);
  await expect(leaveMatch(101)).rejects.toBe(error);
});

test('posts participation and requires HTTP 201 or 202', async () => {
  api.post.mockResolvedValue({ status: 201, data: { matchId: 101, role: 'PARTICIPANT' } });
  await expect(joinMatch(101)).resolves.toEqual({ matchId: 101, role: 'PARTICIPANT' });
  expect(api.post).toHaveBeenCalledWith('/api/matches/101/participants');
  api.post.mockResolvedValue({ status: 200 });
  await expect(joinMatch(101)).rejects.toThrow('참가 결과');
});

test('waits for an accepted participation to be confirmed', async () => {
  const id = '5f1e2d3c-4b5a-4968-8776-655443322110';
  api.post.mockResolvedValue({ status: 202, data: { requestId: id, matchId: 101, status: 'PENDING' } });
  api.get.mockResolvedValue({ data: { requestId: id, matchId: 101, requestType: 'JOIN', status: 'CONFIRMED', refundStatus: 'NOT_REQUIRED' } });
  await expect(joinMatch(101, { delays: [0] })).resolves.toEqual({ requestId: id, matchId: 101, status: 'PENDING' });
  expect(api.get).toHaveBeenCalledWith(`/api/matches/requests/${id}`, { signal: undefined });
});

test('deletes the match and requires HTTP 204', async () => {
  api.delete.mockResolvedValue({ status: 204 });
  await expect(deleteMatch(101)).resolves.toBeUndefined();
  expect(api.delete).toHaveBeenCalledWith('/api/matches/101');
  api.delete.mockRejectedValue({ response: { status: 403 } });
  await expect(deleteMatch(101)).rejects.toEqual({ response: { status: 403 } });
  api.delete.mockResolvedValue({ status: 200 });
  await expect(deleteMatch(101)).rejects.toThrow('삭제 결과');
});

test('updates through the shared authenticated client with only DTO fields', async () => {
  const payload = { title: '수정', description: '', startAt: '2026-10-01T19:00', endAt: '2026-10-01T21:00', maxParticipant: 4, skillLevel: 'BEGINNER', genderGroup: 'MIXED' };
  api.put.mockResolvedValue({ data: { matchId: 42, ...payload } });
  await expect(modifyMatch('42', { ...payload, serviceId: 7, sportType: 'TENNIS' })).resolves.toEqual({ matchId: 42, ...payload });
  expect(api.put).toHaveBeenCalledWith('/api/matches/42', payload);
});

test('loads the detail endpoint and forwards cancellation', async () => {
  const signal = new AbortController().signal;
  const match = { matchId: 101, title: '풋살', isOwner: true };
  api.get.mockResolvedValue({ data: match });
  await expect(getMatchDetail('101', signal)).resolves.toEqual(match);
  expect(api.get).toHaveBeenCalledWith('/api/matches/101', { signal });
});

test.each(['<html>frontend fallback</html>', { matchId: 2 }, null])('rejects unexpected detail responses', async data => {
  api.get.mockResolvedValue({ data });
  await expect(getMatchDetail('101')).rejects.toThrow('응답 형식');
});

test.each([17, { matchId: 17 }])('reads the created match ID from %p', async data => {
  api.post.mockResolvedValue({ status: 201, data });
  await expect(createMatch({ title: '풋살' })).resolves.toBe(17);
  expect(api.post).toHaveBeenCalledWith('/api/matches', { title: '풋살' });
});

test('does not navigate to an invalid ID after an unexpected success response', async () => {
  api.post.mockResolvedValue({ status: 201, data: {} });
  await expect(createMatch({})).rejects.toThrow('매치 번호');
});

const requestId = '0b8f2c1e-6a43-4d5e-9b1a-2f3c4d5e6f70';
const pending = { requestId, matchId: 17, requestType: 'CREATE', status: 'PENDING', refundStatus: 'NOT_REQUIRED', failureCode: null };

test('waits for a 202 creation request until it is confirmed', async () => {
  const onPending = jest.fn();
  api.post.mockResolvedValue({ status: 202, data: { requestId, matchId: 17, status: 'PENDING' } });
  api.get.mockResolvedValueOnce({ data: pending }).mockResolvedValueOnce({ data: { ...pending, status: 'CONFIRMED' } });
  await expect(createMatch({ title: '풋살' }, { onPending, delays: [0, 0, 0] })).resolves.toBe(17);
  expect(onPending).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(api.get).toHaveBeenCalledWith(`/api/matches/requests/${requestId}`, { signal: undefined });
});

test('rejects a 202 response without a request ID', async () => {
  api.post.mockResolvedValue({ status: 202, data: { matchId: 17, status: 'PENDING' } });
  await expect(createMatch({})).rejects.toThrow('매치 번호');
  expect(api.get).not.toHaveBeenCalled();
});

test.each([
  [{ status: 'FAILED', failureCode: 'INSUFFICIENT_POINTS', refundStatus: 'NOT_REQUIRED' }, '보증 포인트가 부족해요. 10점 이상 있어야 신청할 수 있어요.'],
  [{ status: 'FAILED', failureCode: 'PARTICIPATION_SUSPENDED', refundStatus: 'NOT_REQUIRED' }, '노쇼로 참여가 정지된 상태예요. 정지 기간이 끝난 뒤 다시 신청해 주세요.'],
  [{ status: 'CANCELLED', failureCode: 'CONFIRMATION_FAILED', refundStatus: 'PENDING' }, '모집이 마감되었거나 정원이 차서 확정하지 못했어요. 차감된 보증 포인트는 반환 처리 중이에요.'],
  [{ status: 'CANCELLED', failureCode: null, refundStatus: 'COMPLETED' }, '요청이 확정되지 않았어요. 차감된 보증 포인트는 반환됐어요.'],
  [{ status: 'CANCELLED', failureCode: 'PARTICIPANT_CANCELLED', refundStatus: 'PENDING' }, '참가를 취소한 요청이에요. 차감된 보증 포인트는 반환 처리 중이에요.'],
  [{ status: 'CANCELLED', failureCode: 'MATCH_CANCELLED', refundStatus: 'COMPLETED' }, '매치가 취소됐어요. 차감된 보증 포인트는 반환됐어요.'],
  [{ status: 'CANCELLED', failureCode: 'MATCH_CANCELLED', refundStatus: 'NOT_REQUIRED' }, '매치가 취소됐어요.'],
])('explains a finished request %p with its refund state', async (result, message) => {
  api.get.mockResolvedValue({ data: { ...pending, requestType: 'JOIN', ...result } });
  const error = await waitForMatchRequest(requestId, { delays: [0] }).catch(caught => caught);
  expect(error.message).toBe(message);
  expect(error.depositRequest).toMatchObject(result);
});

test('stops after the last delay and reports a request that is still pending', async () => {
  api.get.mockResolvedValue({ data: pending });
  await expect(waitForMatchRequest(requestId, { delays: [0, 0] })).rejects.toThrow('아직 요청을 처리하고 있어요');
  expect(api.get).toHaveBeenCalledTimes(2);
});

test('turns a status lookup failure into a guidance error but keeps aborts', async () => {
  api.get.mockRejectedValue({ response: { status: 404 } });
  const error = await waitForMatchRequest(requestId, { delays: [0] }).catch(caught => caught);
  expect(error.response).toBeUndefined();
  expect(error.message).toContain('처리 결과를 확인하지 못했어요');
  const controller = new AbortController();
  controller.abort();
  await expect(waitForMatchRequest(requestId, { signal: controller.signal, delays: [0] })).rejects.toBe(controller.signal.reason);
});

test('uses about one minute of polling by default', () => {
  expect(REQUEST_POLL_DELAYS[0]).toBe(1000);
  expect(REQUEST_POLL_DELAYS.reduce((sum, delay) => sum + delay, 0)).toBe(59000);
});

test('sends documented facility filters and normalizes the response', async () => {
  api.get.mockResolvedValue({ data: [{ serviceId: 1, serviceName: '서초 풋살장', region: '서초구', locationName: '서초종합체육관' }] });
  await expect(searchMatchFacilities({ query: '풋살', region: '서초구' })).resolves.toEqual([{ serviceId: 1, name: '서초 풋살장', region: '서초구', locationName: '서초종합체육관' }]);
  expect(api.get).toHaveBeenCalledWith('/api/services', { params: { serviceName: '풋살', region: '서초구' } });
});

test('patches one participant status and requires an empty 204', async () => {
  api.patch.mockResolvedValue({ status: 204, data: '' });
  await expect(updateAttendance(101, 5, 'NO_SHOW')).resolves.toBeUndefined();
  expect(api.patch).toHaveBeenCalledWith('/api/matches/101/participants/5/attendance', { matchParticipantStatus: 'NO_SHOW' });
  api.patch.mockResolvedValue({ status: 200, data: '<html>frontend fallback</html>' });
  await expect(updateAttendance(101, 5, 'NO_SHOW')).rejects.toThrow('출석 변경 결과');
});
