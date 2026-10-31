import api from '../../../api/axios';

export const getCurrentUser = ({ signal } = {}) =>
  api.get('/user-service/api/users/me', { signal }).then(({ data, config }) => ({
    user: data,
    // 공통 Axios의 401 재발급 재시도 여부와 실제 요청 토큰을 관리자 가드에 전달한다.
    retried: config?._retry === true,
    authorization: config?.headers?.get?.('Authorization') ?? config?.headers?.Authorization,
  }));

const count = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export const getUserStats = ({ signal } = {}) =>
  api.get('/user-service/api/admin/stats', { signal }).then(({ data }) => {
    const saga = data?.withdrawalSaga;
    const users = data?.users;
    if (!saga || !users || !['requested', 'succeeded', 'rejected', 'timedOut', 'inProgress'].every(key => count(saga[key]))
      || !['active', 'withdrawing', 'withdrawn'].every(key => count(users[key]))) {
      throw new Error('INVALID_USER_STATS');
    }
    return data;
  });

export const getMatchStats = ({ signal } = {}) =>
  api.get('/match-service/api/admin/stats', { signal }).then(({ data }) => {
    const matches = data?.matches;
    const statuses = matches?.byStatus;
    if (!count(matches?.total) || !count(data?.participants?.total)
      || !statuses || !['RECRUITING', 'CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].every(key => count(statuses[key]))) {
      throw new Error('INVALID_MATCH_STATS');
    }
    return data;
  });

const prometheusData = (body, expectedType) => {
  if (body?.status !== 'success' || body?.data?.resultType !== expectedType || !Array.isArray(body.data.result)
    || !body.data.result.every(item => item && typeof item.metric === 'object' && item.metric !== null
      && Array.isArray(item[expectedType === 'vector' ? 'value' : 'values']))) {
    throw new Error(body?.status === 'error' ? 'PROMETHEUS_ERROR' : 'INVALID_PROMETHEUS_RESPONSE');
  }
  return body.data.result;
};

export const queryInstant = ({ query, time, signal }) =>
  api.get('/prometheus/api/v1/query', { params: { query, ...(time ? { time } : {}) }, signal })
    .then(({ data }) => prometheusData(data, 'vector'));

export const queryRange = ({ query, start, end, step, signal }) =>
  api.get('/prometheus/api/v1/query_range', { params: { query, start, end, step }, signal })
    .then(({ data }) => prometheusData(data, 'matrix'));
