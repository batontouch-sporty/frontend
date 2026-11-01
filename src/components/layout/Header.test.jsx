import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';
import api from '../../api/axios';
import Header from './Header';

jest.mock('../../api/axios', () => ({ get: jest.fn() }));
jest.mock('../../features/notifications/api/notificationApi', () => ({
  fetchUnreadCount: jest.fn().mockResolvedValue(0), NOTIFICATIONS_CHANGED: 'sporty:notifications-changed',
}));

function Location() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}|{new URLSearchParams(location.search).get('query')}</p>;
}

beforeEach(() => {
  localStorage.clear();
  api.get.mockReset().mockResolvedValue(verified('USER', 'test-token'));
});
afterEach(() => localStorage.clear());

function show() {
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Header /><Location /><Link to="/other">다른 화면</Link>
  </MemoryRouter>);
}

const verified = (role, token, retried = false) => ({
  data: { role }, config: { headers: { Authorization: `Bearer ${token}` }, _retry: retried },
});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const storageChange = key => window.dispatchEvent(new StorageEvent('storage', { key }));

test('ADMIN은 마이페이지와 관리자 대시보드 링크를 보고 클릭해 이동한다', async () => {
  localStorage.setItem('at', 'admin-at');
  api.get.mockResolvedValue(verified('ADMIN', 'admin-at'));
  show();
  const admin = await screen.findByRole('link', { name: '관리자 대시보드' });
  expect(api.get).toHaveBeenCalledWith('/user-service/api/users/me', {
    signal: expect.any(AbortSignal), skipSessionRedirect: true,
  });
  expect(admin).toHaveAttribute('href', '/admin/dashboard');
  expect(screen.getByRole('link', { name: '마이페이지' })).toBeInTheDocument();
  fireEvent.click(admin);
  expect(screen.getByTestId('location')).toHaveTextContent('/admin/dashboard');
});

test('USER·비로그인·A2 오류·확인 중에는 관리자 링크를 숨긴다', async () => {
  show();
  expect(api.get).not.toHaveBeenCalled();
  expect(screen.queryByRole('link', { name: '관리자 대시보드' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();

  localStorage.setItem('at', 'test-token');
  const pending = deferred();
  api.get.mockReturnValueOnce(pending.promise);
  fireEvent.click(screen.getByRole('link', { name: '다른 화면' }));
  expect(screen.getByRole('link', { name: '마이페이지' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: '관리자 대시보드' })).not.toBeInTheDocument();
  await act(async () => pending.resolve(verified('USER', 'test-token')));
  expect(screen.queryByRole('link', { name: '관리자 대시보드' })).not.toBeInTheDocument();

  api.get.mockRejectedValueOnce(new Error('A2 failed'));
  localStorage.setItem('at', 'another-token');
  act(() => storageChange('at'));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('link', { name: '관리자 대시보드' })).not.toBeInTheDocument();
});

test('ADMIN 로그아웃과 USER 계정 전환은 버튼을 즉시 지우고 오래된 응답을 무시한다', async () => {
  localStorage.setItem('at', 'admin-at');
  localStorage.setItem('rt', 'admin-rt');
  localStorage.setItem('userId', 'admin-id');
  api.get.mockResolvedValueOnce(verified('ADMIN', 'admin-at'));
  show();
  expect(await screen.findByRole('link', { name: '관리자 대시보드' })).toBeInTheDocument();

  localStorage.setItem('at', 'user-at');
  localStorage.setItem('rt', 'user-rt');
  localStorage.setItem('userId', 'user-id');
  const oldResponse = deferred();
  api.get.mockReturnValueOnce(oldResponse.promise);
  act(() => storageChange('at'));
  expect(screen.queryByRole('link', { name: '관리자 대시보드' })).not.toBeInTheDocument();
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  await act(async () => oldResponse.resolve(verified('ADMIN', 'admin-at')));
  expect(screen.queryByRole('link', { name: '관리자 대시보드' })).not.toBeInTheDocument();

  localStorage.clear();
  act(() => storageChange(null));
  expect(screen.queryByRole('link', { name: '관리자 대시보드' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();
});

test('ADMIN에서 USER로 전환한 뒤 새 A2 응답도 관리자 링크를 열지 않는다', async () => {
  localStorage.setItem('at', 'admin-at');
  localStorage.setItem('rt', 'admin-rt');
  localStorage.setItem('userId', 'admin-id');
  api.get.mockResolvedValueOnce(verified('ADMIN', 'admin-at'))
    .mockResolvedValueOnce(verified('USER', 'user-at'));
  show();
  expect(await screen.findByRole('link', { name: '관리자 대시보드' })).toBeInTheDocument();
  localStorage.setItem('at', 'user-at');
  localStorage.setItem('rt', 'user-rt');
  localStorage.setItem('userId', 'user-id');
  act(() => storageChange('at'));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('link', { name: '관리자 대시보드' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '마이페이지' })).toBeInTheDocument();
});

test('새로 마운트한 ADMIN 헤더는 A2 재확인 후 버튼을 표시한다', async () => {
  localStorage.setItem('at', 'admin-at');
  api.get.mockResolvedValue(verified('ADMIN', 'admin-at'));
  const first = show();
  expect(await screen.findByRole('link', { name: '관리자 대시보드' })).toBeInTheDocument();
  first.unmount();
  show();
  expect(await screen.findByRole('link', { name: '관리자 대시보드' })).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledTimes(2);
});

test('같은 RT·계정의 AT 재발급 응답만 현재 관리자 권한으로 인정한다', async () => {
  localStorage.setItem('at', 'old-at');
  localStorage.setItem('rt', 'same-rt');
  localStorage.setItem('userId', 'same-id');
  api.get.mockImplementationOnce(() => {
    localStorage.setItem('at', 'new-at');
    return Promise.resolve(verified('ADMIN', 'new-at', true));
  });
  show();
  expect(await screen.findByRole('link', { name: '관리자 대시보드' })).toBeInTheDocument();
  expect(localStorage.getItem('at')).toBe('new-at');
});

test.each([' 성동구 & 풋살 ', '   '])('공통 헤더 검색은 공백을 정리하고 검색어를 안전하게 전달한다: %s', query => {
  show();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } });
  fireEvent.submit(screen.getByRole('search'));
  expect(screen.getByTestId('location')).toHaveTextContent(`/facilities|${query.trim()}`);
});

test('헤더가 마운트된 채 경로가 바뀌어도 로그인 상태를 갱신한다', () => {
  show();
  expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();
  localStorage.setItem('at', 'test-token');
  fireEvent.click(screen.getByRole('link', { name: '다른 화면' }));
  expect(screen.getByRole('link', { name: '마이페이지' })).toBeInTheDocument();
  localStorage.removeItem('at');
  fireEvent.click(screen.getByRole('link', { name: 'Sporty 홈' }));
  expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();
});
