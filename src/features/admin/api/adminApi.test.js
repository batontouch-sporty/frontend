import api from '../../../api/axios';
import { getCurrentUser, getUserStats, getMatchStats, queryInstant, queryRange } from './adminApi';

jest.mock('../../../api/axios', () => ({ get: jest.fn() }));
afterEach(() => jest.clearAllMocks());

test('A2와 A28·A29는 확정 Gateway 경로와 signal을 사용한다', async () => {
  const signal = new AbortController().signal;
  api.get.mockResolvedValueOnce({ data: { role: 'ADMIN' }, config: { headers: { Authorization: 'Bearer test-token' }, _retry: true } })
    .mockResolvedValueOnce({ data: { withdrawalSaga: { requested: 0, succeeded: 0, rejected: 0, timedOut: 0, inProgress: 0 }, users: { active: 0, withdrawing: 0, withdrawn: 0 } } })
    .mockResolvedValueOnce({ data: { matches: { total: 0, byStatus: { RECRUITING: 0, CLOSED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 } }, participants: { total: 0 } } });
  expect(await getCurrentUser({ signal })).toEqual({ user: { role: 'ADMIN' }, authorization: 'Bearer test-token', retried: true });
  expect((await getUserStats({ signal })).users.active).toBe(0);
  expect((await getMatchStats({ signal })).matches.total).toBe(0);
  expect(api.get.mock.calls).toEqual([
    ['/user-service/api/users/me', { signal }],
    ['/user-service/api/admin/stats', { signal }],
    ['/match-service/api/admin/stats', { signal }],
  ]);
});

test('누적 통계의 누락값은 0으로 보정하지 않는다', async () => {
  api.get.mockResolvedValue({ data: { users: { active: 0 } } });
  await expect(getUserStats()).rejects.toThrow('INVALID_USER_STATS');
  await expect(getMatchStats()).rejects.toThrow('INVALID_MATCH_STATS');
});

test('A30 vector와 A31 matrix를 경로·params·형식별로 처리한다', async () => {
  const signal = new AbortController().signal;
  const vector = [{ metric: { job: 'user' }, value: [100, '0'] }];
  const matrix = [{ metric: { job: 'match' }, values: [[100, '1']] }];
  api.get.mockResolvedValueOnce({ data: { status: 'success', data: { resultType: 'vector', result: vector } } })
    .mockResolvedValueOnce({ data: { status: 'success', data: { resultType: 'matrix', result: matrix } } });
  expect(await queryInstant({ query: 'up{job="user"}', time: 100, signal })).toEqual(vector);
  expect(await queryRange({ query: 'rate(x[5m])', start: 100, end: 200, step: 60, signal })).toEqual(matrix);
  expect(api.get.mock.calls).toEqual([
    ['/prometheus/api/v1/query', { params: { query: 'up{job="user"}', time: 100 }, signal }],
    ['/prometheus/api/v1/query_range', { params: { query: 'rate(x[5m])', start: 100, end: 200, step: 60 }, signal }],
  ]);
});

test('Prometheus error와 vector/matrix 불일치는 성공으로 표시하지 않는다', async () => {
  api.get.mockResolvedValueOnce({ data: { status: 'error', errorType: 'bad_data', error: 'parse error' } })
    .mockResolvedValueOnce({ data: { status: 'success', data: { resultType: 'matrix', result: [] } } });
  await expect(queryInstant({ query: 'bad' })).rejects.toThrow('PROMETHEUS_ERROR');
  await expect(queryInstant({ query: 'up' })).rejects.toThrow('INVALID_PROMETHEUS_RESPONSE');
});

test.each([
  [[100]], [[100, 1]], [['100', '1']], [[Number.POSITIVE_INFINITY, '1']],
  [[8.64e12 + 1, '1']], [[100, '1', 'extra']], [null],
])('A31의 잘못된 샘플 %p는 정상 결과로 처리하지 않는다', async values => {
  api.get.mockResolvedValue({ data: { status: 'success', data: {
    resultType: 'matrix', result: [{ metric: {}, values }],
  } } });
  await expect(queryRange({ query: 'up', start: 0, end: 100, step: 60 }))
    .rejects.toThrow('INVALID_PROMETHEUS_RESPONSE');
});

test('A31의 빈 values와 특수 값 문자열은 원문 그대로 유지한다', async () => {
  const matrix = [
    { metric: { job: 'empty' }, values: [] },
    { metric: { job: 'values' }, values: [[0, 'NaN'], [60, '+Inf'], [120, '-Inf']] },
  ];
  api.get.mockResolvedValue({ data: { status: 'success', data: { resultType: 'matrix', result: matrix } } });
  await expect(queryRange({ query: 'up', start: 0, end: 120, step: 60 })).resolves.toEqual(matrix);
});
