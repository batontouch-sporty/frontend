let api;
let commentApi;
let adapter;
const REFRESH_URL = '/user-service/api/auth/refresh';
const failure = (config, status, code) => Promise.reject({ config, response: { status, data: { code } }, isAxiosError: true });
const success = (config, data) => Promise.resolve({ config, status: 200, data, headers: {} });

beforeEach(() => {
  jest.resetModules();
  localStorage.clear();
  window.history.replaceState({}, '', '/login');
  localStorage.setItem('at', 'old-at');
  localStorage.setItem('rt', 'existing-rt');
  adapter = jest.fn();
  require('axios').default.defaults.adapter = adapter;
  ({ default: api, commentApi } = require('./axios'));
});
afterEach(() => localStorage.clear());

test.each([
  ['/api/users/me', '/user-service/api/users/me'],
  ['/api/auth/login', '/user-service/api/auth/login'],
  ['/api/profiles/3', '/user-service/api/profiles/3'],
  ['/api/matches', '/match-service/api/matches'],
  ['/api/services/12', '/facility-service/api/services/12'],
  ['/api/ai/matches', '/ai-service/api/ai/matches'],
  ['/api/notifications', '/notification-service/api/notifications'],
  ['/user-service/api/admin/stats', '/user-service/api/admin/stats'],
  ['/prometheus/api/v1/query', '/prometheus/api/v1/query'],
])('%s는 Gateway 경로 %s로 보낸다', async (path, gatewayPath) => {
  adapter.mockImplementation(config => success(config, 'ok'));
  await api.get(path);
  await commentApi.get(path);
  expect(adapter.mock.calls.map(([config]) => config.url)).toEqual([gatewayPath, gatewayPath]);
});

test('401이면 새 AT로 원래 요청을 재시도한다', async () => {
  adapter.mockImplementation(config => {
    if (config.url === REFRESH_URL) return success(config, { accessToken: 'new-at' });
    return config.headers.Authorization === 'Bearer new-at' ? success(config, 'ok') : failure(config, 401);
  });
  const result = await api.get('/api/users/me');
  expect(result.data).toBe('ok');
  const refreshCalls = adapter.mock.calls.filter(([config]) => config.url === REFRESH_URL);
  expect(refreshCalls).toHaveLength(1);
  expect(JSON.parse(refreshCalls[0][0].data)).toEqual({ refreshToken: 'existing-rt' });
  expect(localStorage.getItem('at')).toBe('new-at');
  expect(localStorage.getItem('rt')).toBe('existing-rt');
});

test.each([
  ['get', '/api/matches', '/match-service/api/matches'],
  ['post', '/api/auth/logout', '/user-service/api/auth/logout'],
])('만료 AT로 %s %s가 401이면 재발급 후 재시도한다', async (method, path, gatewayPath) => {
  adapter.mockImplementation(config => {
    if (config.url === REFRESH_URL) return success(config, { accessToken: 'new-at' });
    return config.headers.Authorization === 'Bearer new-at' ? success(config, 'ok') : failure(config, 401);
  });
  const result = await api[method](path);
  expect(result.data).toBe('ok');
  expect(adapter.mock.calls.map(([config]) => config.url)).toEqual([gatewayPath, REFRESH_URL, gatewayPath]);
});

test.each(['/api/auth/login', '/api/auth/refresh', '/api/users'])('%s는 자동 재발급에서 제외한다', async path => {
  adapter.mockImplementation(config => failure(config, 401));
  await expect(api.post(path)).rejects.toBeDefined();
  expect(adapter).toHaveBeenCalledTimes(1);
});

test('재발급 후에도 401이면 반복 요청하지 않는다', async () => {
  adapter.mockImplementation(config => config.url === REFRESH_URL
    ? success(config, { accessToken: 'new-at' }) : failure(config, 401));
  await expect(api.get('/api/users/me')).rejects.toBeDefined();
  expect(adapter).toHaveBeenCalledTimes(3);
});

test('RT 불일치 401이면 로그인 정보를 삭제한다', async () => {
  adapter.mockImplementation(config => failure(config, 401, 'INVALID_REFRESH_TOKEN'));
  await expect(api.get('/api/users/me')).rejects.toBeDefined();
  expect(localStorage.getItem('at')).toBeNull();
  expect(localStorage.getItem('rt')).toBeNull();
});

test('오류 코드 없는 401이면 RT 인증 실패로 단정하지 않는다', async () => {
  adapter.mockImplementation(config => failure(config, 401));
  await expect(api.get('/api/users/me')).rejects.toBeDefined();
  expect(localStorage.getItem('at')).toBe('old-at');
  expect(localStorage.getItem('rt')).toBe('existing-rt');
});

test('재발급 서버 장애에는 세션을 유지한다', async () => {
  adapter.mockImplementation(config => failure(config, config.url === REFRESH_URL ? 503 : 401));
  await expect(api.get('/api/users/me')).rejects.toBeDefined();
  expect(localStorage.getItem('rt')).toBe('existing-rt');
});

test('재발급 중 로그아웃하면 뒤늦은 응답으로 세션을 복원하지 않는다', async () => {
  adapter.mockImplementation(config => {
    if (config.url === REFRESH_URL) {
      localStorage.clear();
      return success(config, { accessToken: 'new-at' });
    }
    return failure(config, 401);
  });
  await expect(api.get('/api/users/me')).rejects.toBeDefined();
  expect(localStorage.getItem('at')).toBeNull();
  expect(adapter).toHaveBeenCalledTimes(2);
});

test('공개 페이지 부가 조회는 세션이 끝나도 로그인으로 보내지 않고 토큰만 지운다', async () => {
  window.history.replaceState({}, '', '/');
  localStorage.removeItem('rt');
  // jsdom은 이동 시도를 console.error로 알린다.
  const navigation = jest.spyOn(console, 'error').mockImplementation(() => {});
  adapter.mockImplementation(config => failure(config, 401));
  await expect(api.get('/api/users/me', { skipSessionRedirect: true })).rejects.toBeDefined();
  expect(localStorage.getItem('at')).toBeNull();
  expect(navigation).not.toHaveBeenCalled();
  navigation.mockRestore();
});
