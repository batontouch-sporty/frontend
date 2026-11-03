import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MyPoints from './MyPoints';
import { loadMyPoints, loadPointHistory } from '../api/myPageApi';
import api from '../../../api/axios';

jest.mock('../../../api/axios', () => ({ get: jest.fn() }));
afterEach(() => jest.resetAllMocks());

const entry = (id, reason, delta, afterPoints, createdAt = '2026-11-02T19:30:00') => ({ id, matchId: 7, requestId: null, reason, beforePoints: afterPoints - delta, afterPoints, delta, createdAt });
const respond = (balance, ...pages) => {
  api.get.mockImplementation((url, { params } = {}) => {
    if (url === '/api/users/me/points') return Promise.resolve({ data: balance });
    return Promise.resolve({ data: pages[params.page] });
  });
};
const showPoints = (onUnauthorized = jest.fn()) => render(<MyPoints loadMyPoints={loadMyPoints} loadPointHistory={loadPointHistory} onUnauthorized={onUnauthorized} />);

test('보유 포인트·출석 보상 진행·정지 상태와 사유별 이력을 보여 준다', async () => {
  respond({ points: 30, attendanceRewardCount: 3, participationSuspended: true, suspendedUntil: '2026-11-10T00:00:00' },
    { content: [entry(3, 'NO_SHOW_FORFEITED', 0, 0), entry(2, 'DEPOSIT_CHARGED', -10, 40), entry(1, 'SIGNUP', 50, 50)], page: 0, size: 20, totalElements: 3, totalPages: 1 });
  showPoints();
  expect(await screen.findByText('30점')).toBeInTheDocument();
  expect(screen.getByText('3 / 5회')).toBeInTheDocument();
  expect(screen.getByText(/다음 보상까지 2회 남았어요/)).toBeInTheDocument();
  expect(screen.getByText('참여 정지 중')).toBeInTheDocument();
  expect(screen.getByText(/2026\.11\.10 00:00까지/)).toBeInTheDocument();
  const rows = screen.getAllByRole('listitem');
  expect(rows.map(row => row.querySelector('strong').textContent)).toEqual(['노쇼로 보증금 미반환', '참가 보증금 차감', '가입 축하 포인트']);
  expect(within(rows[1]).getByText('-10점')).toHaveClass('is-minus');
  expect(within(rows[2]).getByText('+50점')).toBeInTheDocument();
  expect(within(rows[2]).getByText('잔액 50점')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/api/users/me/points/history', { params: { page: 0, size: 20 }, signal: expect.any(AbortSignal) });
  expect(screen.queryByRole('button', { name: '이력 더 보기' })).not.toBeInTheDocument();
});

test('정지가 없으면 참여 가능으로 보여 주고 다음 페이지 이력을 이어 붙인다', async () => {
  respond({ points: 50, attendanceRewardCount: 0, participationSuspended: false, suspendedUntil: null },
    { content: [entry(2, 'ATTENDANCE_REWARDED', 10, 60)], page: 0, size: 20, totalElements: 2, totalPages: 2 },
    { content: [entry(1, 'DEPOSIT_RETURNED', 10, 50)], page: 1, size: 20, totalElements: 2, totalPages: 2 });
  showPoints();
  expect(await screen.findByText('참여 가능')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '이력 더 보기' }));
  expect(await screen.findByText('보증금 반환')).toBeInTheDocument();
  expect(screen.getByText('출석 5회 보상')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '이력 더 보기' })).not.toBeInTheDocument();
});

test('조회 실패는 다시 시도하고 401은 로그인으로 넘긴다', async () => {
  api.get.mockRejectedValue(new Error('server'));
  showPoints();
  expect(await screen.findByRole('alert')).toHaveTextContent('포인트 정보를 불러오지 못했어요.');
  respond({ points: 10, attendanceRewardCount: 1, participationSuspended: false, suspendedUntil: null }, { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByText('포인트 이력이 없어요.')).toBeInTheDocument();

  const onUnauthorized = jest.fn();
  api.get.mockRejectedValue({ response: { status: 401 } });
  showPoints(onUnauthorized);
  await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
});

test('이력만 실패하면 잔액은 보여 주고 이력 영역에만 오류를 띄운다', async () => {
  api.get.mockImplementation(url => (url === '/api/users/me/points'
    ? Promise.resolve({ data: { points: 30, attendanceRewardCount: 1, participationSuspended: false, suspendedUntil: null } })
    : Promise.reject({ response: { status: 500 } })));
  showPoints();
  expect(await screen.findByText('30점')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('포인트 이력을 불러오지 못했어요.');
  expect(screen.queryByText('포인트 정보를 불러오지 못했어요.')).not.toBeInTheDocument();
  expect(screen.queryByText('포인트 이력이 없어요.')).not.toBeInTheDocument();
  respond({ points: 30, attendanceRewardCount: 1, participationSuspended: false, suspendedUntil: null },
    { content: [entry(1, 'SIGNUP', 50, 50)], page: 0, size: 20, totalElements: 1, totalPages: 1 });
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByText('가입 축하 포인트')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('잔액 조회가 실패하면 이력 응답을 기다리지 않고 오류를 먼저 보여 준다', async () => {
  api.get.mockImplementation(url => (url === '/api/users/me/points' ? Promise.reject({ response: { status: 500 } }) : new Promise(() => {})));
  showPoints();
  expect(await screen.findByRole('alert')).toHaveTextContent('포인트 정보를 불러오지 못했어요.');
  expect(screen.queryByText('포인트 정보를 불러오는 중이에요.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
});

test('미리보기에서는 포인트를 조회하지 않는다', () => {
  render(<MyPoints onUnauthorized={jest.fn()} />);
  expect(screen.getByText('미리보기에서는 포인트를 조회하지 않아요.')).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalled();
});
