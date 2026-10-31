import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AdminDashboardPage from './AdminDashboardPage';
import { getCurrentUser, getUserStats, getMatchStats, queryInstant, queryRange } from '../api/adminApi';

jest.mock('../api/adminApi', () => ({
  getCurrentUser: jest.fn(), getUserStats: jest.fn(), getMatchStats: jest.fn(),
  queryInstant: jest.fn(), queryRange: jest.fn(),
}));

const userStats = { users: { active: 0, withdrawing: 0, withdrawn: 0 }, withdrawalSaga: { requested: 0, succeeded: 0, rejected: 0, timedOut: 0, inProgress: 0 } };
const matchStats = { matches: { total: 0, byStatus: { RECRUITING: 0, CLOSED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 } }, participants: { total: 0 } };
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const verified = (role = 'ADMIN', token = 'token') => ({ user: { role }, authorization: `Bearer ${token}`, retried: false });
const changedStorage = key => window.dispatchEvent(new StorageEvent('storage', { key }));
const activeUsers = value => ({ ...userStats, users: { ...userStats.users, active: value } });

function Destination() {
  const location = useLocation();
  return <p>{`${location.pathname} from:${location.state?.from || ''}`}</p>;
}

function show({ strict = false } = {}) {
  const element = <MemoryRouter initialEntries={['/admin/dashboard?tab=one#top']}
    future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
      <Route path="/login" element={<Destination />} />
      <Route path="/" element={<Destination />} />
    </Routes>
  </MemoryRouter>;
  return render(strict ? <StrictMode>{element}</StrictMode> : element);
}

beforeEach(() => {
  localStorage.clear();
  getCurrentUser.mockReset(); getUserStats.mockReset(); getMatchStats.mockReset(); queryInstant.mockReset(); queryRange.mockReset();
  getUserStats.mockResolvedValue(userStats);
  getMatchStats.mockResolvedValue(matchStats);
});
afterEach(() => { localStorage.clear(); jest.restoreAllMocks(); });

test('토큰이 없으면 A2·통계를 호출하지 않고 로그인 복귀 경로를 전달한다', () => {
  show();
  expect(screen.getByText('/login from:/admin/dashboard?tab=one#top')).toBeInTheDocument();
  expect(getCurrentUser).not.toHaveBeenCalled();
  expect(getUserStats).not.toHaveBeenCalled();
  expect(getMatchStats).not.toHaveBeenCalled();
});

test('A2 확인 중과 USER·역할 누락 시 통계를 호출하지 않는다', async () => {
  localStorage.setItem('at', 'token');
  const pending = deferred();
  getCurrentUser.mockReturnValue(pending.promise);
  const view = show();
  expect(screen.getByText('관리자 권한을 확인하는 중입니다.')).toBeInTheDocument();
  expect(getUserStats).not.toHaveBeenCalled();
  await act(async () => pending.resolve(verified('USER')));
  expect(screen.getByText('관리자 접근 권한이 없습니다.')).toBeInTheDocument();
  expect(getMatchStats).not.toHaveBeenCalled();
  view.unmount();
  getCurrentUser.mockResolvedValue({ user: {}, authorization: 'Bearer token', retried: false });
  show();
  expect(await screen.findByText('관리자 접근 권한이 없습니다.')).toBeInTheDocument();
  expect(getUserStats).not.toHaveBeenCalled();
});

test('ADMIN이면 각 영역을 요청하고 실제 0건을 표시하며 한 영역 실패도 다른 영역에 영향이 없다', async () => {
  localStorage.setItem('at', 'token');
  getCurrentUser.mockResolvedValue(verified());
  getMatchStats.mockRejectedValue({ response: { status: 503 } });
  show();
  const users = await screen.findByRole('region', { name: '회원 누적 통계' });
  await waitFor(() => expect(within(users).getByText('활성 회원')).toBeInTheDocument());
  expect(within(users).getAllByText('0').length).toBeGreaterThan(0);
  const matches = screen.getByRole('region', { name: '매칭 누적 통계' });
  expect(await within(matches).findByText('조회에 실패했습니다. 잠시 후 다시 시도해주세요.')).toBeInTheDocument();
  expect(getUserStats).toHaveBeenCalledTimes(1);
  expect(getMatchStats).toHaveBeenCalledTimes(1);
  expect(queryInstant).not.toHaveBeenCalled();
});

test.each([
  [401, '/login from:/admin/dashboard?tab=one#top'],
  [403, '관리자 접근 권한이 없습니다.'],
  [404, '회원 조회 연동을 확인할 수 없습니다. API 경로와 서비스 준비 상태를 확인해주세요.'],
])('A2의 %s 응답을 구분한다', async (status, message) => {
  localStorage.setItem('at', 'token');
  getCurrentUser.mockRejectedValue({ response: { status } });
  show();
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(getUserStats).not.toHaveBeenCalled();
});

test('A2 네트워크 및 refresh 경로 실패는 ADMIN 성공이 아니다', async () => {
  localStorage.setItem('at', 'token');
  getCurrentUser.mockRejectedValue({ request: {}, message: 'Network Error' });
  const view = show();
  expect(await screen.findByText('관리자 권한을 확인하지 못했습니다. 연결 상태를 확인해주세요.')).toBeInTheDocument();
  view.unmount();
  getCurrentUser.mockRejectedValue({ response: { status: 404 } });
  show();
  expect(await screen.findByText('회원 조회 연동을 확인할 수 없습니다. API 경로와 서비스 준비 상태를 확인해주세요.')).toBeInTheDocument();
  expect(getUserStats).not.toHaveBeenCalled();
});

test('PromQL을 제출해야만 조회하며 빈 vector와 실패를 구분한다', async () => {
  localStorage.setItem('at', 'token');
  getCurrentUser.mockResolvedValue(verified());
  queryInstant.mockResolvedValueOnce([]).mockRejectedValueOnce({ response: { status: 403 } });
  show();
  const monitor = await screen.findByRole('region', { name: '모니터링' });
  expect(queryInstant).not.toHaveBeenCalled();
  fireEvent.change(within(monitor).getByLabelText('PromQL'), { target: { value: 'up' } });
  fireEvent.click(within(monitor).getByRole('button', { name: '조회' }));
  expect(await within(monitor).findByText('조회 결과가 없습니다.')).toBeInTheDocument();
  fireEvent.click(within(monitor).getByRole('button', { name: '조회' }));
  expect(await within(monitor).findByText('모니터링 접근 권한이 없습니다.')).toBeInTheDocument();
});

test('화면 이탈 후 늦은 A2 응답은 통계 요청을 시작하지 않는다', async () => {
  localStorage.setItem('at', 'token');
  const pending = deferred();
  getCurrentUser.mockReturnValue(pending.promise);
  const view = show();
  await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(1));
  view.unmount();
  await act(async () => pending.resolve(verified()));
  expect(getUserStats).not.toHaveBeenCalled();
});

test('StrictMode의 정리된 효과는 요청을 보내지 않고 현재 A2 승인 후에만 통계를 호출한다', async () => {
  localStorage.setItem('at', 'token');
  const current = deferred();
  getCurrentUser.mockReturnValue(current.promise);
  show({ strict: true });
  await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(1));
  expect(getUserStats).not.toHaveBeenCalled();
  await act(async () => current.resolve(verified()));
  await waitFor(() => expect(getUserStats).toHaveBeenCalled());
});

test('재발급으로 AT만 바뀌고 RT·userId가 유지되면 A2 ADMIN 승인을 받아들인다', async () => {
  localStorage.setItem('at', 'expired');
  localStorage.setItem('rt', 'same-refresh');
  localStorage.setItem('userId', '7');
  const pending = deferred();
  getCurrentUser.mockReturnValue(pending.promise);
  show();
  await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(1));
  await act(async () => {
    localStorage.setItem('at', 'renewed');
    pending.resolve({ user: { role: 'ADMIN' }, authorization: 'Bearer renewed', retried: true });
  });
  await waitFor(() => expect(getUserStats).toHaveBeenCalled());
  act(() => window.dispatchEvent(new Event('focus')));
  expect(getCurrentUser).toHaveBeenCalledTimes(1);
});

test('A2 대기 중 로그아웃하면 늦은 ADMIN 응답은 통계를 열지 않는다', async () => {
  localStorage.setItem('at', 'token');
  localStorage.setItem('rt', 'old-refresh');
  localStorage.setItem('userId', '7');
  const pending = deferred();
  getCurrentUser.mockReturnValue(pending.promise);
  show();
  await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(1));
  await act(async () => {
    localStorage.clear();
    pending.resolve(verified());
  });
  expect(getUserStats).not.toHaveBeenCalled();
  expect(getMatchStats).not.toHaveBeenCalled();
});

test('A2 대기 중 다른 계정으로 전환하면 이전 ADMIN 응답은 통계를 열지 않는다', async () => {
  localStorage.setItem('at', 'token');
  localStorage.setItem('rt', 'old-refresh');
  localStorage.setItem('userId', '7');
  const pending = deferred();
  getCurrentUser.mockReturnValue(pending.promise);
  show();
  await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(1));
  await act(async () => {
    localStorage.setItem('at', 'other-token');
    localStorage.setItem('rt', 'other-refresh');
    localStorage.setItem('userId', '9');
    pending.resolve(verified());
  });
  expect(getUserStats).not.toHaveBeenCalled();
  expect(getMatchStats).not.toHaveBeenCalled();
});

test('값이 있는 A30에서 A31로 전환하면 이전 vector를 matrix로 읽지 않는다', async () => {
  localStorage.setItem('at', 'token');
  getCurrentUser.mockResolvedValue(verified());
  queryInstant.mockResolvedValue([{ metric: { job: 'a' }, value: [100, '3'] }]);
  queryRange.mockResolvedValue([{ metric: { job: 'a' }, values: [[100, '4']] }]);
  show();
  const monitor = await screen.findByRole('region', { name: '모니터링' });
  fireEvent.change(within(monitor).getByLabelText('PromQL'), { target: { value: 'up' } });
  fireEvent.click(within(monitor).getByRole('button', { name: '조회' }));
  expect(await within(monitor).findByText('3')).toBeInTheDocument();
  fireEvent.change(within(monitor).getByLabelText('조회 방식'), { target: { value: 'range' } });
  fireEvent.click(within(monitor).getByRole('button', { name: '조회' }));
  expect(await within(monitor).findByText(/1개 시점/)).toBeInTheDocument();
});

test('값이 있는 A31에서 A30으로 전환하면 이전 matrix를 vector로 읽지 않는다', async () => {
  localStorage.setItem('at', 'token');
  getCurrentUser.mockResolvedValue(verified());
  queryRange.mockResolvedValue([{ metric: { job: 'a' }, values: [[100, '4']] }]);
  queryInstant.mockResolvedValue([{ metric: { job: 'a' }, value: [100, '3'] }]);
  show();
  const monitor = await screen.findByRole('region', { name: '모니터링' });
  fireEvent.change(within(monitor).getByLabelText('PromQL'), { target: { value: 'up' } });
  fireEvent.change(within(monitor).getByLabelText('조회 방식'), { target: { value: 'range' } });
  fireEvent.click(within(monitor).getByRole('button', { name: '조회' }));
  expect(await within(monitor).findByText(/1개 시점/)).toBeInTheDocument();
  fireEvent.change(within(monitor).getByLabelText('조회 방식'), { target: { value: 'instant' } });
  fireEvent.click(within(monitor).getByRole('button', { name: '조회' }));
  expect(await within(monitor).findByText('3')).toBeInTheDocument();
});

test.each(['success', 'error'])('전환 전 요청의 늦은 %s 응답은 현재 조회 결과를 덮지 않는다', async outcome => {
  localStorage.setItem('at', 'token');
  getCurrentUser.mockResolvedValue(verified());
  const pending = deferred();
  queryInstant.mockReturnValue(pending.promise);
  queryRange.mockResolvedValue([{ metric: { job: 'new' }, values: [[100, '4']] }]);
  show();
  const monitor = await screen.findByRole('region', { name: '모니터링' });
  fireEvent.change(within(monitor).getByLabelText('PromQL'), { target: { value: 'up' } });
  fireEvent.click(within(monitor).getByRole('button', { name: '조회' }));
  await waitFor(() => expect(queryInstant).toHaveBeenCalledTimes(1));
  fireEvent.change(within(monitor).getByLabelText('조회 방식'), { target: { value: 'range' } });
  fireEvent.click(within(monitor).getByRole('button', { name: '조회' }));
  expect(await within(monitor).findByText(/1개 시점/)).toBeInTheDocument();
  await act(async () => outcome === 'success'
    ? pending.resolve([{ metric: { job: 'old' }, value: [100, '99'] }])
    : pending.reject({ response: { status: 503 } }));
  expect(within(monitor).getByText(/1개 시점/)).toBeInTheDocument();
  expect(within(monitor).queryByText('99')).not.toBeInTheDocument();
});

test('빠른 전환과 화면 이탈 뒤의 응답은 상태를 갱신하지 않는다', async () => {
  localStorage.setItem('at', 'token');
  getCurrentUser.mockResolvedValue(verified());
  const first = deferred();
  const second = deferred();
  queryInstant.mockReturnValue(first.promise);
  queryRange.mockReturnValue(second.promise);
  const view = show();
  const monitor = await screen.findByRole('region', { name: '모니터링' });
  fireEvent.change(within(monitor).getByLabelText('PromQL'), { target: { value: 'up' } });
  fireEvent.click(within(monitor).getByRole('button', { name: '조회' }));
  await waitFor(() => expect(queryInstant).toHaveBeenCalledTimes(1));
  fireEvent.change(within(monitor).getByLabelText('조회 방식'), { target: { value: 'range' } });
  fireEvent.click(within(monitor).getByRole('button', { name: '조회' }));
  await waitFor(() => expect(queryRange).toHaveBeenCalledTimes(1));
  fireEvent.change(within(monitor).getByLabelText('조회 방식'), { target: { value: 'instant' } });
  fireEvent.click(within(monitor).getByRole('button', { name: '조회' }));
  view.unmount();
  await act(async () => {
    first.resolve([{ metric: {}, value: [100, '9'] }]);
    second.reject({ response: { status: 503 } });
  });
  expect(screen.queryByRole('region', { name: '모니터링' })).not.toBeInTheDocument();
});

test('ADMIN 통계 표시 후 다른 탭 전체 로그아웃은 수치를 숨기고 로그인 복귀한다', async () => {
  localStorage.setItem('at', 'token');
  localStorage.setItem('rt', 'old-rt');
  localStorage.setItem('userId', '7');
  getCurrentUser.mockResolvedValue(verified());
  getUserStats.mockResolvedValue(activeUsers(42));
  show();
  expect(await screen.findByText('42')).toBeInTheDocument();
  act(() => { localStorage.clear(); changedStorage(null); });
  expect(screen.queryByText('42')).not.toBeInTheDocument();
  expect(screen.getByText('/login from:/admin/dashboard?tab=one#top')).toBeInTheDocument();
});

test('ADMIN 표시 뒤 다른 탭 USER 전환은 즉시 숨기고 A2 재검증 뒤 거부한다', async () => {
  localStorage.setItem('at', 'token');
  localStorage.setItem('rt', 'old-rt');
  localStorage.setItem('userId', '7');
  getCurrentUser.mockResolvedValueOnce(verified());
  getUserStats.mockResolvedValue(activeUsers(42));
  queryInstant.mockResolvedValue([{ metric: {}, value: [100, '99'] }]);
  show();
  expect(await screen.findByText('42')).toBeInTheDocument();
  const monitor = screen.getByRole('region', { name: '모니터링' });
  fireEvent.change(within(monitor).getByLabelText('PromQL'), { target: { value: 'up' } });
  fireEvent.click(within(monitor).getByRole('button', { name: '조회' }));
  expect(await within(monitor).findByText('99')).toBeInTheDocument();
  const nextCheck = deferred();
  getCurrentUser.mockReturnValueOnce(nextCheck.promise);
  act(() => {
    localStorage.setItem('at', 'user-at');
    localStorage.setItem('rt', 'user-rt');
    localStorage.setItem('userId', '9');
    changedStorage('at');
  });
  expect(screen.queryByText('42')).not.toBeInTheDocument();
  expect(screen.queryByText('99')).not.toBeInTheDocument();
  expect(screen.getByText('관리자 권한을 확인하는 중입니다.')).toBeInTheDocument();
  expect(getUserStats).toHaveBeenCalledTimes(1);
  await act(async () => nextCheck.resolve(verified('USER', 'user-at')));
  expect(screen.getByText('관리자 접근 권한이 없습니다.')).toBeInTheDocument();
  expect(getMatchStats).toHaveBeenCalledTimes(1);
});

test.each(['success', 'error'])('세션 전환 전 A28·A29의 늦은 %s 응답은 새 화면에 반영되지 않는다', async outcome => {
  localStorage.setItem('at', 'token');
  localStorage.setItem('rt', 'old-rt');
  localStorage.setItem('userId', '7');
  getCurrentUser.mockResolvedValueOnce(verified()).mockResolvedValueOnce(verified('USER', 'user-at'));
  const users = deferred();
  const matches = deferred();
  getUserStats.mockReturnValue(users.promise);
  getMatchStats.mockReturnValue(matches.promise);
  show();
  await waitFor(() => expect(getMatchStats).toHaveBeenCalledTimes(1));
  const userSignal = getUserStats.mock.calls[0][0].signal;
  const matchSignal = getMatchStats.mock.calls[0][0].signal;
  act(() => {
    localStorage.setItem('at', 'user-at');
    localStorage.setItem('rt', 'user-rt');
    localStorage.setItem('userId', '9');
    changedStorage('rt');
  });
  expect(userSignal.aborted).toBe(true);
  expect(matchSignal.aborted).toBe(true);
  expect(await screen.findByText('관리자 접근 권한이 없습니다.')).toBeInTheDocument();
  await act(async () => {
    if (outcome === 'success') {
      users.resolve(activeUsers(42)); matches.resolve(matchStats);
    } else {
      users.reject({ response: { status: 503 } }); matches.reject({ response: { status: 503 } });
    }
  });
  expect(screen.queryByText('42')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: '회원 누적 통계' })).not.toBeInTheDocument();
});

test.each([
  ['instant', 'success'], ['instant', 'error'], ['range', 'success'], ['range', 'error'],
])('세션 전환 전 %s 요청은 즉시 취소되고 늦은 %s 응답을 숨긴다', async (mode, outcome) => {
  localStorage.setItem('at', 'token');
  localStorage.setItem('rt', 'old-rt');
  localStorage.setItem('userId', '7');
  getCurrentUser.mockResolvedValueOnce(verified()).mockResolvedValueOnce(verified('USER', 'user-at'));
  const pending = deferred();
  (mode === 'instant' ? queryInstant : queryRange).mockReturnValue(pending.promise);
  show();
  const monitor = await screen.findByRole('region', { name: '모니터링' });
  fireEvent.change(within(monitor).getByLabelText('PromQL'), { target: { value: 'up' } });
  fireEvent.change(within(monitor).getByLabelText('조회 방식'), { target: { value: mode } });
  fireEvent.click(within(monitor).getByRole('button', { name: '조회' }));
  const queryApi = mode === 'instant' ? queryInstant : queryRange;
  await waitFor(() => expect(queryApi).toHaveBeenCalledTimes(1));
  const signal = queryApi.mock.calls[0][0].signal;
  act(() => {
    localStorage.setItem('at', 'user-at');
    localStorage.setItem('rt', 'user-rt');
    localStorage.setItem('userId', '9');
    changedStorage('userId');
  });
  expect(signal.aborted).toBe(true);
  await act(async () => {
    if (outcome === 'error') pending.reject({ response: { status: 503 } });
    else pending.resolve(mode === 'instant'
      ? [{ metric: {}, value: [100, '99'] }]
      : [{ metric: {}, values: [[100, '99']] }]);
  });
  expect(screen.queryByRole('region', { name: '모니터링' })).not.toBeInTheDocument();
});

test('새 ADMIN 세션은 A2 승인 이후에만 새 통계를 요청한다', async () => {
  localStorage.setItem('at', 'token');
  localStorage.setItem('rt', 'old-rt');
  localStorage.setItem('userId', '7');
  getCurrentUser.mockResolvedValueOnce(verified());
  getUserStats.mockResolvedValueOnce(activeUsers(42)).mockResolvedValueOnce(activeUsers(77));
  show();
  expect(await screen.findByText('42')).toBeInTheDocument();
  const nextCheck = deferred();
  getCurrentUser.mockReturnValueOnce(nextCheck.promise);
  act(() => {
    localStorage.setItem('at', 'new-at');
    localStorage.setItem('rt', 'new-rt');
    localStorage.setItem('userId', '9');
    changedStorage('at');
  });
  expect(screen.queryByText('42')).not.toBeInTheDocument();
  expect(getUserStats).toHaveBeenCalledTimes(1);
  await act(async () => nextCheck.resolve(verified('ADMIN', 'new-at')));
  expect(await screen.findByText('77')).toBeInTheDocument();
  expect(getUserStats).toHaveBeenCalledTimes(2);
});

test('focus는 세션이 바뀔 때만 재검증하고 StrictMode 리스너는 정리된다', async () => {
  const added = jest.spyOn(window, 'addEventListener');
  const removed = jest.spyOn(window, 'removeEventListener');
  const documentAdded = jest.spyOn(document, 'addEventListener');
  const documentRemoved = jest.spyOn(document, 'removeEventListener');
  localStorage.setItem('at', 'token');
  localStorage.setItem('rt', 'old-rt');
  localStorage.setItem('userId', '7');
  getCurrentUser.mockResolvedValueOnce(verified()).mockResolvedValueOnce(verified('USER', 'user-at'));
  const view = show({ strict: true });
  await waitFor(() => expect(getUserStats).toHaveBeenCalled());
  act(() => { window.dispatchEvent(new Event('focus')); changedStorage('unrelated'); });
  expect(getCurrentUser).toHaveBeenCalledTimes(1);
  act(() => {
    localStorage.setItem('at', 'user-at');
    localStorage.setItem('rt', 'user-rt');
    localStorage.setItem('userId', '9');
    window.dispatchEvent(new Event('focus'));
  });
  expect(await screen.findByText('관리자 접근 권한이 없습니다.')).toBeInTheDocument();
  expect(getCurrentUser).toHaveBeenCalledTimes(2);
  view.unmount();
  const storageHandlers = added.mock.calls.filter(([type, handler]) => type === 'storage' && handler.name === 'onStorage').map(([, handler]) => handler);
  const visibilityHandlers = documentAdded.mock.calls.filter(([type, handler]) => type === 'visibilitychange' && handler.name === 'onVisible').map(([, handler]) => handler);
  expect(storageHandlers).toHaveLength(2);
  expect(visibilityHandlers).toHaveLength(2);
  storageHandlers.forEach(handler => expect(removed).toHaveBeenCalledWith('storage', handler));
  visibilityHandlers.forEach(handler => expect(documentRemoved).toHaveBeenCalledWith('visibilitychange', handler));
  act(() => { changedStorage('at'); window.dispatchEvent(new Event('focus')); });
  expect(getCurrentUser).toHaveBeenCalledTimes(2);
});
