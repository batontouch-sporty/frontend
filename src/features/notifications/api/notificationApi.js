import api from '../../../api/axios';

export const NOTIFICATIONS_CHANGED = 'sporty:notifications-changed';

export const fetchNotifications = ({ signal } = {}) =>
  api.get('/api/notifications/me', { signal }).then(({ data }) => {
    if (!Array.isArray(data)) throw new Error('알림 응답 형식을 확인해 주세요.');
    return data;
  });

// 헤더 배지용 부가 조회라 세션이 끝나도 현재 화면을 유지한다.
export const fetchUnreadCount = ({ signal } = {}) =>
  api.get('/api/notifications/me/unread-count', { signal, skipSessionRedirect: true })
    .then(({ data }) => (Number.isInteger(data?.unreadCount) ? data.unreadCount : 0));

export const markNotificationRead = id =>
  api.patch(`/api/notifications/${id}/read`).then(() => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED)));
