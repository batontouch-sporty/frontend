const success = (config, data) => Promise.resolve({ config, status: 200, data, headers: {} });
const unauthorized = config => Promise.reject({ config, response: { status: 401, data: { code: 'UNAUTHORIZED' } }, isAxiosError: true });

beforeEach(() => {
  jest.resetModules();
  localStorage.clear();
  localStorage.setItem('at', 'expired-at');
  localStorage.setItem('rt', 'valid-rt');
  localStorage.setItem('userId', '7');
});
afterEach(() => localStorage.clear());

test('실제 공통 Axios 재발급 후 A2 응답에 재시도·새 Bearer 근거가 담긴다', async () => {
  const adapter = jest.fn(config => {
    if (config.url === '/user-service/api/auth/refresh') return success(config, { accessToken: 'renewed-at' });
    if (config.url === '/user-service/api/users/me') {
      return config.headers.Authorization === 'Bearer renewed-at'
        ? success(config, { role: 'ADMIN' }) : unauthorized(config);
    }
    throw new Error(`Unexpected request: ${config.url}`);
  });
  require('axios').default.defaults.adapter = adapter;
  const { getCurrentUser } = require('./adminApi');
  const result = await getCurrentUser();

  expect(result).toEqual({ user: { role: 'ADMIN' }, retried: true, authorization: 'Bearer renewed-at' });
  expect(localStorage.getItem('at')).toBe('renewed-at');
  expect(adapter.mock.calls.map(([config]) => config.url)).toEqual([
    '/user-service/api/users/me', '/user-service/api/auth/refresh', '/user-service/api/users/me',
  ]);
});
