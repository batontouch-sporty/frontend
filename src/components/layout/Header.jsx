import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
                {/* 폼 제출을 사용해 검색 버튼 클릭과 Enter 입력이 같은 경로로 이동하도록 한다. */}
                <form className="sporty-header-search" role="search" aria-label="체육시설 검색" onSubmit={facilitySearchHandler}>
                    <div className="sporty-header-global-search">
                        <img src={headerSearch} width="16" height="16" alt="" />
                        <input type="search" aria-label="체육시설 검색" placeholder="체육시설 검색" value={facilityQuery} onChange={event => setFacilityQuery(event.target.value)} />
                    </div>
                    <button type="submit" className="sporty-header-search-button">검색</button>
                </form>
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
