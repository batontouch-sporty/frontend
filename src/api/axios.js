import axios from 'axios';

const endPoint = process.env.REACT_APP_BACKEND_ENDPOINT;
export const commentApi = axios.create({ baseURL: endPoint });
const api = axios.create({ baseURL: endPoint });

// Gateway 라우트(/<서비스명>/**)에 맞춰 호출 경로 앞에 서비스명을 붙인다.
// 이미 서비스명이 있는 경로와 재시도 요청은 /api로 시작하지 않아 그대로 둔다.
const SERVICE_BY_RESOURCE = {
  users: 'user-service',
  auth: 'user-service',
  profiles: 'user-service',
  matches: 'match-service',
  services: 'facility-service',
  ai: 'ai-service',
  notifications: 'notification-service',
};
const addServicePrefix = config => {
  const service = SERVICE_BY_RESOURCE[config.url.match(/^\/api\/(\w+)/)?.[1]];
  if (service) config.url = `/${service}${config.url}`;
  return config;
};
commentApi.interceptors.request.use(addServicePrefix);
api.interceptors.request.use(addServicePrefix);

api.interceptors.request.use(config => {
  const accessToken = localStorage.getItem('at');
  if (!config._authSession) config._authSession = {
    rt: localStorage.getItem('rt'), userId: localStorage.getItem('userId'),
  };
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// [USR-05] 재발급 인증 실패 시에만 세션을 정리
export const clearSession = () => ['at', 'rt', 'userId'].forEach(key => localStorage.removeItem(key));

const expireSession = ({ skipSessionRedirect } = {}) => {
  clearSession();
  // 공개 페이지의 부가 조회는 세션만 정리하고 화면을 유지한다.
  if (!skipSessionRedirect && window.location.pathname !== '/login') {
    const from = window.location.pathname + window.location.search;
    window.location.assign('/login?redirect=' + encodeURIComponent(from));
  }
};

const refreshFlights = new Map();

// 같은 세션의 동시 401은 한 번의 재발급을 공유한다.
api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    if (!originalRequest || error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // 토큰을 보지 않는 요청의 401은 재발급으로 풀리지 않는다. 로그아웃은 만료 AT면 재발급 후 재시도한다.
    const excludedUrls = ['/user-service/api/auth/login', '/user-service/api/auth/refresh', '/user-service/api/users'];
    if (excludedUrls.includes(originalRequest.url)) return Promise.reject(error);

    const refreshToken = originalRequest._authSession?.rt;
    const sameAccount = () => localStorage.getItem('rt') === refreshToken
      && localStorage.getItem('userId') === originalRequest._authSession?.userId;
    if (!sameAccount()) return Promise.reject(error);
    if (!refreshToken) {
      expireSession(originalRequest);
      return Promise.reject(error);
    }
    originalRequest._retry = true;
    const sentToken = originalRequest.headers?.get?.('Authorization') ?? originalRequest.headers?.Authorization;
    const currentToken = localStorage.getItem('at');
    // 다른 요청이 이미 재발급을 끝낸 뒤 도착한 401도 새 토큰으로 한 번만 재시도한다.
    if (currentToken && sentToken !== `Bearer ${currentToken}`) return api(originalRequest);

    const key = JSON.stringify([refreshToken, originalRequest._authSession.userId]);
    let flight = refreshFlights.get(key);
    if (!flight) {
      flight = { redirectOnFailure: false };
      // 공통 api 대신 axios로 요청해 재발급 요청의 인터셉터 재진입을 막는다.
      flight.promise = axios.post('/user-service/api/auth/refresh', { refreshToken }, { baseURL: endPoint })
        .then(response => {
          if (!sameAccount()) throw error;
          localStorage.setItem('at', response.data.accessToken);
          return response.data.accessToken;
        }).catch(refreshError => {
          if (refreshError.response?.data?.code === 'INVALID_REFRESH_TOKEN' && sameAccount()) {
            expireSession({ skipSessionRedirect: !flight.redirectOnFailure });
          }
          throw refreshError;
        }).finally(() => refreshFlights.delete(key));
      refreshFlights.set(key, flight);
    }
    if (!originalRequest.skipSessionRedirect) flight.redirectOnFailure = true;
    await flight.promise;
    if (!sameAccount()) return Promise.reject(error);
    return api(originalRequest);
  }
);

export default api;
