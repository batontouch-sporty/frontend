import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { fetchUnreadCount, NOTIFICATIONS_CHANGED } from '../../features/notifications/api/notificationApi';
import headerSearch from './assets/header-search.svg';
import './header.css';

// [#54][FC-01] Router 내부에서 <Header />로 사용한다. main.css 없이도 독립적으로 표시된다.
export default function Header({ children, onFacilitySearch }) {
  const moveUrl = useNavigate();
  const location = useLocation();
  // [#54][USR-02] 상단 메뉴 표시용 로그인 상태. 로그인 페이지가 저장하는 at 유무를 사용한다.
  // 실제 API 접근 권한/토큰 만료 검증은 서버가 담당한다.
  const [isLoggedIn, setIsLoggedIn] = useState(() => Boolean(localStorage.getItem('at')?.trim()));
  useEffect(() => {
    const syncLoginState = () => setIsLoggedIn(Boolean(localStorage.getItem('at')?.trim()));
    const storageHandler = event => {
      if (event.key === 'at' || event.key === null) syncLoginState();
    };
    // [#54] 다른 탭의 로그인/로그아웃과 화면 복귀 시 상태를 다시 읽는다.
    window.addEventListener('storage', storageHandler);
    window.addEventListener('focus', syncLoginState);
    // 공통 레이아웃에서 헤더가 유지되는 경우에도 경로 이동 후 인증 상태를 갱신한다.
    syncLoginState();
    return () => {
      window.removeEventListener('storage', storageHandler);
      window.removeEventListener('focus', syncLoginState);
    };
  }, [location.key]);
  // 로그인 사용자의 안 읽은 알림 수. 조회 실패는 배지만 숨기고 헤더 동작에는 영향을 주지 않는다.
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    if (!isLoggedIn) { setUnreadCount(0); return undefined; }
    const controller = new AbortController();
    const load = () => Promise.resolve().then(() => fetchUnreadCount({ signal: controller.signal })).then(count => {
      if (!controller.signal.aborted) setUnreadCount(count);
    }).catch(() => {});
    load();
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => { controller.abort(); window.removeEventListener(NOTIFICATIONS_CHANGED, load); };
  }, [isLoggedIn, location.key]);
  // [FC-01] string: 상단 시설 검색어. facilitySearchHandler가 URL의 query로 전달한다.
  const [facilityQuery, setFacilityQuery] = useState('');

  // [FC-01] 시설 검색
  // 통합 검색은 시설 검색 화면으로 위임한다. 입력값은 URL에 보존해 이동 후에도 사용할 수 있다.
  // 시설 검색 페이지 구현 시 useSearchParams().get('query')로 읽어 초기 검색 조건에 사용한다.
  const facilitySearchHandler = event => {
    event.preventDefault();
    const query = facilityQuery.trim();
    if (onFacilitySearch) { onFacilitySearch(query); return; }
    moveUrl(query ? `/facilities?${new URLSearchParams({
      query
    })}` : '/facilities');
  };

  return (
        <header className="sporty-header">
            <div className="sporty-header-container sporty-header-inner">
                <Link className="sporty-header-brand" to="/" aria-label="Sporty 홈">
                    <span>Sporty</span>
                </Link>
                <nav className="sporty-header-nav" aria-label="주 메뉴">
                    <NavLink to="/matches/search">매치 찾기</NavLink>
                    <NavLink to="/facilities">체육시설</NavLink>
                    <NavLink to="/matches/new">매치 개설</NavLink>
                </nav>
                {/* 폼 제출을 사용해 검색 버튼 클릭과 Enter 입력이 같은 경로로 이동하도록 한다. */}
                <form className="sporty-header-search" role="search" aria-label="체육시설 검색" onSubmit={facilitySearchHandler}>
                    <label className="sporty-header-global-search">
                        <img src={headerSearch} width="16" height="16" alt="" />
                        <input type="search" aria-label="체육시설 검색" placeholder="체육시설 검색" value={facilityQuery} onChange={event => setFacilityQuery(event.target.value)} />
                    </label>
                    <button type="submit" className="sporty-header-search-button">검색</button>
                </form>
                {isLoggedIn && <Link className="sporty-header-bell" to="/notifications" aria-label={unreadCount ? `알림 ${unreadCount}개 안 읽음` : '알림'}>
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" /></svg>
                    {unreadCount > 0 && <span>{unreadCount > 99 ? '99+' : unreadCount}</span>}
                </Link>}
                {/* [#54][USR-01][USR-02] 로그아웃·회원탈퇴는 마이페이지에서 처리한다. */}
                <nav className="sporty-header-auth-menu" aria-label="회원 메뉴">
                    {isLoggedIn ? <Link className="sporty-header-auth-primary" to="/mypage">마이페이지</Link> : <>
                        <Link className="sporty-header-auth-login" to="/login">로그인</Link>
                        <Link className="sporty-header-auth-primary" to="/signup">회원가입</Link>
                    </>}
                </nav>
            </div>
            {children && <div className="sporty-header-container">{children}</div>}
        </header>
  );
}
