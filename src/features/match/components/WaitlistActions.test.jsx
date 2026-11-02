import { useRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WaitlistActions from './WaitlistActions';
import { registerWaitlist, cancelWaitlist } from '../api/waitlistApi';

jest.mock('../api/waitlistApi', () => ({ registerWaitlist: jest.fn(), cancelWaitlist: jest.fn() }));
const full = { matchId: 42, startAt: '2099-01-01T19:00:00', status: 'CLOSED',
  currentParticipantCount: 2, maxParticipant: 2, isOwner: false, isParticipant: false };
let refresh, login;
beforeEach(() => {
  localStorage.setItem('at', 'test-token');
  refresh = jest.fn(); login = jest.fn();
  jest.spyOn(window, 'alert').mockImplementation(() => {});
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { jest.resetAllMocks(); jest.restoreAllMocks(); localStorage.clear(); });

function Host({ match = full, busy = false, preview = false }) {
  const [pending, setPending] = useState(null);
  const busyRef = useRef(busy);
  return <WaitlistActions match={match} preview={preview} pending={pending} busyRef={busyRef}
    onPendingChange={setPending} onLogin={login} onRefresh={refresh} />;
}

test('registers once and displays only the server registration-time position', async () => {
  let finish;
  registerWaitlist.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<Host />);
  const button = screen.getByRole('button', { name: '대기 신청하기' });
  fireEvent.click(button); fireEvent.click(button);
  expect(registerWaitlist).toHaveBeenCalledTimes(1);
  expect(registerWaitlist).toHaveBeenCalledWith(42);
  expect(screen.getByRole('button', { name: '대기 취소하기' })).toBeDisabled();
  await act(async () => finish({ matchId: 42, position: 3 }));
  expect(screen.getByText(/신청 당시 대기 순번/)).toHaveTextContent('3번');
  expect(screen.getByRole('status')).toHaveTextContent('대기 신청이 완료');
  expect(screen.queryByRole('button', { name: '대기 신청하기' })).not.toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
});

test('allows cancellation after a reload without claiming known membership', async () => {
  cancelWaitlist.mockResolvedValue();
  render(<Host />);
  expect(screen.queryByText(/신청 당시 대기 순번/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '대기 취소하기' }));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(cancelWaitlist).toHaveBeenCalledWith(42);
  expect(window.alert).toHaveBeenCalledWith('대기 신청을 취소했어요.');
});

test('does not cancel when confirmation is declined', () => {
  window.confirm.mockReturnValue(false);
  render(<Host />); fireEvent.click(screen.getByRole('button', { name: '대기 취소하기' }));
  expect(cancelWaitlist).not.toHaveBeenCalled();
});

test.each(['대기 신청하기', '대기 취소하기'])('requires login for %s', label => {
  localStorage.clear(); render(<Host />); fireEvent.click(screen.getByRole('button', { name: label }));
  expect(login).toHaveBeenCalledWith('대기 신청·취소를 하려면 로그인이 필요해요.');
  expect(registerWaitlist).not.toHaveBeenCalled(); expect(cancelWaitlist).not.toHaveBeenCalled();
});

test('handles an expired session without claiming registration', async () => {
  registerWaitlist.mockRejectedValue({ response: { status: 401 } });
  render(<Host />); fireEvent.click(screen.getByRole('button', { name: '대기 신청하기' }));
  await waitFor(() => expect(login).toHaveBeenCalledWith('인증이 만료됐어요. 다시 로그인해 주세요.'));
  expect(localStorage.getItem('at')).toBeNull();
});

test('an existing registration has a cancel action but no invented position', async () => {
  registerWaitlist.mockRejectedValue({ response: { status: 409, data: { code: 'WAITLIST_ALREADY_JOINED' } } });
  render(<Host />); fireEvent.click(screen.getByRole('button', { name: '대기 신청하기' }));
  expect(await screen.findByRole('status')).toHaveTextContent('이미 대기 신청');
  expect(screen.queryByText(/신청 당시 대기 순번/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '대기 취소하기' })).toBeEnabled();
});

test('a promotion racing cancellation reloads participation, not a success message', async () => {
  cancelWaitlist.mockRejectedValue({ response: { status: 404, data: { code: 'WAITLIST_NOT_FOUND' } } });
  render(<Host />); fireEvent.click(screen.getByRole('button', { name: '대기 취소하기' }));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('이미 참가가 확정'));
  expect(window.alert).not.toHaveBeenCalledWith('대기 신청을 취소했어요.');
});

test.each([{ response: { status: 503 } }, new Error('network')])('does not turn an uncertain response into registration success', async error => {
  registerWaitlist.mockRejectedValue(error);
  render(<Host />); fireEvent.click(screen.getByRole('button', { name: '대기 신청하기' }));
  expect(await screen.findByRole('status')).toHaveTextContent(/결과를 확인|처리 결과/);
  expect(screen.queryByText(/신청 당시 대기 순번/)).not.toBeInTheDocument();
  expect(registerWaitlist).toHaveBeenCalledTimes(1);
});

test('ignores a late result after navigation', async () => {
  let finish;
  cancelWaitlist.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { unmount } = render(<Host />);
  fireEvent.click(screen.getByRole('button', { name: '대기 취소하기' }));
  unmount(); await act(async () => finish());
  expect(refresh).not.toHaveBeenCalled(); expect(window.alert).not.toHaveBeenCalled();
});

test.each([{ isOwner: true }, { isParticipant: true }, { status: 'CANCELLED' }, { status: 'COMPLETED' }])('hides actions for %p', override => {
  render(<Host match={{ ...full, ...override }} />);
  expect(screen.queryByRole('region', { name: '참가 대기' })).not.toBeInTheDocument();
});

test.each([{ startAt: '2000-01-01T19:00:00' }, { status: 'RECRUITING' }, { currentParticipantCount: 1 }])('does not offer registration for %p but can cancel a prior request', override => {
  render(<Host match={{ ...full, ...override }} />);
  expect(screen.queryByRole('button', { name: '대기 신청하기' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '대기 취소하기' })).toBeEnabled();
});

test('shares the participation mutation lock and disables preview interactions', () => {
  const { unmount } = render(<Host busy />);
  fireEvent.click(screen.getByRole('button', { name: '대기 신청하기' }));
  expect(registerWaitlist).not.toHaveBeenCalled();
  unmount(); render(<Host preview />);
  expect(screen.queryByRole('region', { name: '참가 대기' })).not.toBeInTheDocument();
});
