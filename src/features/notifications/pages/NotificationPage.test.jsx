import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NotificationPage from './NotificationPage';
import { fetchNotifications, fetchUnreadCount, markNotificationRead } from '../api/notificationApi';

jest.mock('../api/notificationApi', () => ({
  NOTIFICATIONS_CHANGED: 'test-changed',
  fetchNotifications: jest.fn(),
  fetchUnreadCount: jest.fn(),
  markNotificationRead: jest.fn(),
}));

const unread = { id: 1, type: 'JOINED', message: '참가가 확정됐어요.', matchId: 3, read: false, createdAt: '2026-11-01T09:30:00' };

function show() {
  render(<MemoryRouter initialEntries={['/notifications']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/notifications" element={<NotificationPage />} />
      <Route path="/matches/:id" element={<h1>매치 상세 화면</h1>} />
      <Route path="/login" element={<h1>로그인 화면</h1>} />
    </Routes>
  </MemoryRouter>);
}

beforeEach(() => {
  localStorage.setItem('at', 'test-token');
  fetchUnreadCount.mockResolvedValue(1);
  markNotificationRead.mockResolvedValue();
});
afterEach(() => { localStorage.clear(); jest.clearAllMocks(); });

test('비로그인은 로그인으로 보낸다', () => {
  localStorage.clear();
  show();
  expect(screen.getByRole('heading', { name: '로그인 화면' })).toBeInTheDocument();
});

test('안 읽은 알림을 누르면 읽음 처리 후 매치로 이동한다', async () => {
  fetchNotifications.mockResolvedValue([unread]);
  show();
  fireEvent.click(await screen.findByRole('button', { name: /참가가 확정됐어요/ }));
  expect(await screen.findByRole('heading', { name: '매치 상세 화면' })).toBeInTheDocument();
  expect(markNotificationRead).toHaveBeenCalledWith(1);
});

test('읽음 처리에 실패하면 이동하지 않고 안내한다', async () => {
  fetchNotifications.mockResolvedValue([unread]);
  markNotificationRead.mockRejectedValue(new Error('fail'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: /참가가 확정됐어요/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('읽음 처리를 하지 못했어요');
});

test('조회 실패는 다시 시도할 수 있고 빈 목록은 매치 찾기로 안내한다', async () => {
  fetchNotifications.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce([]);
  show();
  fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
  expect(await screen.findByRole('link', { name: '매치 찾기', current: false })).toBeInTheDocument();
  expect(screen.getByText('아직 받은 알림이 없어요.')).toBeInTheDocument();
});
