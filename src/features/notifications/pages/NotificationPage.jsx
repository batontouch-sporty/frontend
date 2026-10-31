import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Footer from '../../../components/layout/Footer';
import Header from '../../../components/layout/Header';
import { fetchNotifications, markNotificationRead } from '../api/notificationApi';
import '../css/notifications.css';

const TYPE_LABELS = {
  JOINED: '참가 확정',
  STATUS_CHANGED: '모임 상태 변경',
  WITHDRAWAL_REJECTED: '탈퇴 거절',
  STARTING_SOON: '모임 시작 하루 전',
  WAITLIST_PROMOTED: '대기 승급',
};

const timeLabel = value => (typeof value === 'string' && value.length >= 16
  ? `${value.slice(5, 10).replace('-', '.')} ${value.slice(11, 16)}` : '');

export default function NotificationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [notifications, setNotifications] = useState([]);
  const [readError, setReadError] = useState('');
  const [token, setToken] = useState(() => localStorage.getItem('at'));

  const load = useCallback(signal => {
    setStatus('loading');
    return fetchNotifications({ signal }).then(rows => {
      if (signal?.aborted) return;
      setNotifications(rows);
      setStatus('success');
    }).catch(() => {
      if (!signal?.aborted) setStatus('error');
    });
  }, []);

  // 다른 탭에서 로그아웃하거나 계정을 바꾸면 이전 계정의 알림을 비운다.
  useEffect(() => {
    const sync = event => {
      if (event.key !== 'at' && event.key !== null) return;
      setNotifications([]);
      setToken(localStorage.getItem('at'));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, token]);

  if (!token || !localStorage.getItem('at')) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const open = async notification => {
    setReadError('');
    if (!notification.read) {
      try {
        await markNotificationRead(notification.id);
        setNotifications(rows => rows.map(row => (row.id === notification.id ? { ...row, read: true } : row)));
      } catch {
        setReadError('읽음 처리를 하지 못했어요. 잠시 후 다시 시도해 주세요.');
        return;
      }
    }
    if (notification.matchId) navigate(`/matches/${notification.matchId}`);
  };

  return <div className="nt-page">
    <Header />
    <main className="nt-main">
      <h1>알림</h1>
      {readError && <p className="nt-error" role="alert">{readError}</p>}
      {status === 'loading' && <p className="nt-message" role="status">알림을 불러오고 있어요.</p>}
      {status === 'error' && <div className="nt-message" role="alert"><p>알림을 불러오지 못했어요.</p><button type="button" onClick={() => load()}>다시 시도</button></div>}
      {status === 'success' && notifications.length === 0 && <div className="nt-message"><p>아직 받은 알림이 없어요.</p><Link to="/matches/search">매치 찾기</Link></div>}
      {status === 'success' && notifications.length > 0 && <ul className="nt-list">
        {notifications.map(notification => <li key={notification.id}>
          <button type="button" className={notification.read ? '' : 'is-unread'} onClick={() => open(notification)}>
            <span className="nt-type">{TYPE_LABELS[notification.type] || '알림'}{!notification.read && <em>읽지 않음</em>}</span>
            <span className="nt-body">{notification.message}</span>
            <time dateTime={notification.createdAt}>{timeLabel(notification.createdAt)}</time>
          </button>
        </li>)}
      </ul>}
    </main>
    <Footer />
  </div>;
}
