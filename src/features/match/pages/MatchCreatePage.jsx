import Footer from '../../../components/layout/Footer';
import Header from '../../../components/layout/Header';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import MatchForm from '../components/MatchForm';
import { createMatch, searchMatchFacilities } from '../api/matchApi';
import { DEPOSIT_POINTS, depositErrorMessage } from '../utils/depositMessages';
import '../css/match.css';

export function RequireMatchAuth({ children }) {
  const location = useLocation();
  if (!localStorage.getItem('at')) {
    const from = location.pathname + location.search;
    return <Navigate to={`/login?redirect=${encodeURIComponent(from)}`} state={{ from }} replace />;
  }
  return children;
}

export default function MatchCreatePage({ searchFacilities = searchMatchFacilities }) {
  const navigate = useNavigate();
  const location = useLocation();
  // 202 접수 후 확정을 기다리는 동안 처리 중 안내를 보여 주고, 화면을 떠나면 상태 조회를 멈춘다.
  const [waiting, setWaiting] = useState(false);
  const poll = useRef(null);
  useEffect(() => () => poll.current?.abort(), []);

  async function handleSubmit(payload) {
    poll.current = new AbortController();
    try {
      const matchId = await createMatch(payload, { signal: poll.current.signal, onPending: () => setWaiting(true) });
      navigate(`/matches/${matchId}`, { replace: true });
    } catch (error) {
      setWaiting(false);
      const depositMessage = depositErrorMessage(error.response?.data?.code);
      if (depositMessage) throw new Error(depositMessage);
      if (error.response?.status === 401) {
        localStorage.removeItem('at');
        const from = location.pathname + location.search;
        navigate(`/login?redirect=${encodeURIComponent(from)}`, { state: { from }, replace: true });
      }
      throw error;
    }
  }

  return (
    <div className="match-page">
      <Header />
      <main className="match-main">
        <nav className="match-breadcrumb" aria-label="현재 위치">
          <Link to="/">홈</Link><span>/</span><Link to="/mypage">매치 관리</Link><span>/</span><span aria-current="page">새 매치 개설</span>
        </nav>
        <h1>새로운 매치 개설하기</h1>
        <p className="match-intro">종목, 장소, 일정을 순서대로 정하면 바로 모집을 시작할 수 있어요.</p>
        <MatchForm
          key={location.key}        
          onSubmit={handleSubmit}
          selectedFacility={location.state?.facility ?? location.state?.aiDraft?.facility}
          searchFacilities={searchFacilities} 
          initialValues={location.state?.aiDraft?.initialValues}
          notice={waiting
            ? <p className="match-deposit-note" role="status">보증 포인트 차감을 확인하고 있어요. 개설이 확정되면 매치 상세로 이동해요.</p>
            : <p className="match-deposit-note">개설이 확정되기 전에 보증 포인트 {DEPOSIT_POINTS}점이 차감돼요. 정상 출석하거나 매치를 취소하면 돌려받아요.</p>}
        />
      </main>
      <Footer />
    </div>
  );
}
