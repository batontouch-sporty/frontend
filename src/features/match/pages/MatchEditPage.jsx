import Footer from '../../../components/layout/Footer';
import Header from '../../../components/layout/Header';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import MatchForm from '../components/MatchForm';
import { getMatchDetail, modifyMatch } from '../api/matchApi';
import '../css/match.css';

export default function MatchEditPage() {
  const { matchId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const from = location.pathname + location.search;

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    if (!/^[1-9]\d*$/.test(matchId) || !Number.isSafeInteger(Number(matchId))) {
      setResult({ matchId, error: '매치를 찾을 수 없습니다.' });
      return () => controller.abort();
    }
    getMatchDetail(matchId, controller.signal).then(match => {
      if (controller.signal.aborted) return;
      setResult(match.isOwner === true
        ? { matchId, match }
        : { matchId, error: '이 매치를 수정할 권한이 없습니다.' });
    }).catch(error => {
      if (controller.signal.aborted) return;
      const status = error.response?.status;
      if (status === 401) {
        localStorage.removeItem('at');
        navigate(`/login?redirect=${encodeURIComponent(from)}`, { state: { from }, replace: true });
        return;
      }
      const messages = { 403: '이 매치를 수정할 권한이 없습니다.', 404: '매치를 찾을 수 없습니다.' };
      setResult({ matchId, error: messages[status] || '매치 정보를 불러오지 못했습니다. 다시 시도해주세요.', retry: !messages[status] });
    });
    return () => controller.abort();
  }, [matchId, attempt, from, navigate]);

  async function handleSubmit(payload) {
    try {
      await modifyMatch(matchId, payload);
      navigate(`/matches/${matchId}`, { replace: true });
    } catch (error) {
      if (error.response?.status === 401) {
        localStorage.removeItem('at');
        navigate(`/login?redirect=${encodeURIComponent(from)}`, { state: { from }, replace: true });
      }
      throw error;
    }
  }

  const current = result?.matchId === matchId ? result : null;
  const match = current?.match;

  return <div className="match-page">
    <Header />
    <main className="match-main">
      <nav className="match-breadcrumb" aria-label="현재 위치"><Link to="/">홈</Link><span>/</span><Link to={`/matches/${matchId}`}>매치 상세</Link><span>/</span><span aria-current="page">매치 수정</span></nav>
      <h1>운동 매치 수정하기</h1>
      <p className="match-intro">일정과 모집 조건, 상세 안내를 수정하고 변경 내용을 저장하세요.</p>
      {!current && <div className="match-section match-edit-state" role="status">매치 정보를 불러오는 중…</div>}
      {current?.error && <div className="match-section match-edit-state"><p className="match-error" role="alert">{current.error}</p>{current.retry && <button type="button" className="match-small-button" onClick={() => setAttempt(value => value + 1)}>다시 시도</button>}<Link to="/">홈으로 이동</Link></div>}
      {match && <MatchForm key={`${matchId}:${attempt}`} isEdit initialValues={match}
        selectedFacility={{ serviceId: match.serviceId, name: match.serviceName, region: match.region, locationName: match.locationName }}
        onSubmit={handleSubmit} submitLabel="매치 수정 완료하기" />}
    </main>
    <Footer />
  </div>;
}
