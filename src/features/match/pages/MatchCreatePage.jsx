import Footer from '../../../components/layout/Footer';
import Header from '../../../components/layout/Header';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import MatchForm from '../components/MatchForm';
import { createMatch, searchMatchFacilities } from '../api/matchApi';
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

  async function handleSubmit(payload) {
    try {
      const matchId = await createMatch(payload);
      navigate(`/matches/${matchId}`, { replace: true });
    } catch (error) {
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
        />
      </main>
      <Footer />
    </div>
  );
}
