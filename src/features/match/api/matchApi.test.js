import api from '../../../api/axios';
import { createMatch, searchMatchFacilities, getMatchDetail, modifyMatch, joinMatch, leaveMatch, deleteMatch } from './matchApi';

jest.mock('../../../api/axios', () => ({ post: jest.fn(), get: jest.fn(), put: jest.fn(), delete: jest.fn() }));
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

test('posts participation and requires HTTP 201', async () => {
  api.post.mockResolvedValue({ status: 201, data: { matchId: 101, role: 'PARTICIPANT' } });
  await expect(joinMatch(101)).resolves.toEqual({ matchId: 101, role: 'PARTICIPANT' });
  expect(api.post).toHaveBeenCalledWith('/api/matches/101/participants');
  api.post.mockResolvedValue({ status: 200 });
  await expect(joinMatch(101)).rejects.toThrow('참가 결과');
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
  api.post.mockResolvedValue({ data });
  await expect(createMatch({ title: '풋살' })).resolves.toBe(17);
  expect(api.post).toHaveBeenCalledWith('/api/matches', { title: '풋살' });
});

test('does not navigate to an invalid ID after an unexpected success response', async () => {
  api.post.mockResolvedValue({ data: {} });
  await expect(createMatch({})).rejects.toThrow('매치 번호');
});

test('sends documented facility filters and normalizes the response', async () => {
  api.get.mockResolvedValue({ data: [{ serviceId: 1, serviceName: '서초 풋살장', region: '서초구', locationName: '서초종합체육관' }] });
  await expect(searchMatchFacilities({ query: '풋살', region: '서초구' })).resolves.toEqual([{ serviceId: 1, name: '서초 풋살장', region: '서초구', locationName: '서초종합체육관' }]);
  expect(api.get).toHaveBeenCalledWith('/api/services', { params: { serviceName: '풋살', region: '서초구' } });
});
