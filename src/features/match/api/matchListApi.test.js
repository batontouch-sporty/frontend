import api from '../../../api/axios';
import { fetchMatchList, fetchRecommendedMatches, requestMatchParticipation, toMatchListItem, matchRequestError } from './matchListApi';

jest.mock('../../../api/axios', () => ({ get: jest.fn(), post: jest.fn() }));
afterEach(() => jest.clearAllMocks());
const dto = { matchId: 1, title: '풋살', sportType: 'FUTSAL', status: 'RECRUITING', startAt: '2026-09-26T19:30', maxParticipant: 12 };

test('sends only supported nonempty search fields and cancellation signal', async () => {
  api.get.mockResolvedValue({ data: [dto] });
  const signal = new AbortController().signal;
  const result = await fetchMatchList({ sportType: 'FUTSAL', titleKeyword: '', region: '성동구', status: 'CLOSED', isFree: 'Y' }, signal);
  expect(api.get).toHaveBeenCalledWith('/api/matches', { params: { sportType: 'FUTSAL', region: '성동구', status: 'CLOSED', isFree: true }, signal, timeout: 15000 });
  expect(result[0]).toMatchObject({ id: 1, format: '풋살', sportType: 'FUTSAL', statusCode: 'RECRUITING', closed: false, startAt: dto.startAt, isFree: null });
  expect(result[0].currentParticipant).toBeUndefined();
});

test.each([['N', false], [false, false], ['', undefined]])('serializes fee selection %p', async (isFree, expected) => {
  api.get.mockResolvedValue({ data: [] });
  await fetchMatchList({ isFree });
  const { params } = api.get.mock.calls[0][1];
  expect(params.isFree).toBe(expected);
  if (expected === undefined) expect(params).not.toHaveProperty('isFree');
});

test.each([{}, null, { matches: [] }])('rejects malformed list response %p', async data => {
  api.get.mockResolvedValue({ data });
  await expect(fetchMatchList()).rejects.toThrow('목록 응답');
});

test.each([[dto], { matches: [dto] }])('accepts documented recommendation list %p', async data => {
  api.get.mockResolvedValue({ data });
  expect(await fetchRecommendedMatches()).toHaveLength(1);
});

test('unknown and closed statuses cannot be joined', () => {
  expect(toMatchListItem({ ...dto, status: 'CLOSED' }).closed).toBe(true);
  expect(toMatchListItem({ ...dto, status: null }).closed).toBe(true);
});

test.each([[0, true], [7, false], [13, false]])(
  '서버의 실제 장소·요금·참여 인원을 MatchRow 모델로 전달한다 (%s명)', (count, isFree) => {
    const result = toMatchListItem({ ...dto, region: '성동구', isFree, numCurrentParticipant: count, skillLevel: 'BEGINNER', genderGroup: 'MIXED' });
    expect(result).toMatchObject({ region: '성동구', isFree, currentParticipant: count, maxParticipant: 12, level: '루키', genderGroupLabel: '혼성' });
  }
);

test.each([0, -1, 1.5, '1'])('rejects an unusable match ID %p', matchId => {
  expect(() => toMatchListItem({ ...dto, matchId })).toThrow('매치 응답');
});

test('requires confirmed creation of participation', async () => {
  api.post.mockResolvedValue({ status: 201, data: { matchId: 1 } });
  await expect(requestMatchParticipation(1)).resolves.toEqual({ matchId: 1 });
  expect(api.post).toHaveBeenCalledWith('/api/matches/1/participants', undefined, { timeout: 15000 });
  api.post.mockRejectedValue({ response: { status: 501 } });
  await expect(requestMatchParticipation(1)).rejects.toEqual({ response: { status: 501 } });
  expect(matchRequestError({ response: { status: 501 } }, 'join')).toContain('준비 중');
});

test('preview IDs cannot reach the API', async () => {
  await expect(requestMatchParticipation('preview-1')).rejects.toThrow('매치 번호');
  expect(api.post).not.toHaveBeenCalled();
});
