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

// [USR-05] 401 응답 → RT로 AT 재발급 → 실패했던 요청을 한 번만 다시 보냄
api.interceptors.response.use(
  response => response,
  error => {
    const originalRequest = error.config;
    if (!originalRequest || error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // 토큰을 보지 않는 요청의 401은 재발급으로 풀리지 않는다. 로그아웃은 만료 AT면 재발급 후 재시도한다.
    const excludedUrls = ['/user-service/api/auth/login', '/user-service/api/auth/refresh', '/user-service/api/users'];
    if (excludedUrls.includes(originalRequest.url)) return Promise.reject(error);

    const refreshToken = localStorage.getItem('rt');
    if (!refreshToken) {
      expireSession(originalRequest);
      return Promise.reject(error);
    }
    originalRequest._retry = true;

    // 공통 api 대신 axios로 요청하여 재발급 요청이 인터셉터를 반복하지 않게 처리
    return axios.post('/user-service/api/auth/refresh', { refreshToken }, { baseURL: endPoint })
      .catch(refreshError => {
        if (refreshError.response?.data?.code === 'INVALID_REFRESH_TOKEN'
            && localStorage.getItem('rt') === refreshToken) {
          expireSession(originalRequest);
        }
        return Promise.reject(refreshError);
      })
      .then(response => {
        // 재발급을 기다리는 동안 로그아웃/계정 변경한 경우 중단
        if (localStorage.getItem('rt') !== refreshToken) return Promise.reject(error);
        localStorage.setItem('at', response.data.accessToken);
        // 요청 인터셉터가 새 AT를 헤더에 붙임
        return api(originalRequest);
      });
  }
);

export default api;
