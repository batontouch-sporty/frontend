import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../api/axios';
import '../css/logout.css';

// [USR-03] Router 내부에서 재사용한다. onLogout은 부모의 인증 state 초기화용이다.
const LogoutButton = ({ onLogout }) => {
  const moveUrl = useNavigate();
  const errorId = useId();
  // [USR-03] 요청 중 버튼 비활성화/처리 중 문구에 사용한다.
  const [pending, setPending] = useState(false);
  // [USR-03] 서버 또는 네트워크 실패 안내 문구다.
  const [error, setError] = useState('');

  // [USR-03] 인증 정보만 삭제한다. 부모 Context/state도 onLogout에서 초기화한다.
  const clearSession = () => {
    localStorage.removeItem('at');
    localStorage.removeItem('rt');
    localStorage.removeItem('userId');
    onLogout?.();
    moveUrl('/login', { replace: true });
  };

  // [USR-03] POST /api/auth/logout, 요청 본문 없음, 성공 204.
  // 공통 axios가 at를 헤더에 붙이므로 서버 응답 전에 토큰을 삭제하지 않는다.
  const logoutHandler = () => {
    setPending(true);
    setError('');
    return api.post('/api/auth/logout')
      .then(response => {
        if (response.status === 204) {
          clearSession();
        } else {
          setError('로그아웃 응답을 확인하지 못했습니다.');
        }
      })
      .catch(requestError => {
        // 인증 만료라면 로컬 정보도 정리한다. 서버 장애 시 토큰을 유지해 재시도를 허용한다.
        if (requestError.response?.status === 401) {
          clearSession();
        } else {
          setError('로그아웃하지 못했습니다. 잠시 후 다시 시도해주세요.');
        }
      })
      .finally(() => {
        setPending(false);
      });
  };

  return (
    <div className="auth-logout">
      <button type="button" className="auth-logout-button" onClick={logoutHandler} disabled={pending} aria-busy={pending} aria-describedby={error ? errorId : undefined}>
        {pending ? '로그아웃 중...' : '로그아웃'}
      </button>
      {error && <p id={errorId} className="auth-logout-error" role="alert">{error}</p>}
    </div>
  );
};

export default LogoutButton;
