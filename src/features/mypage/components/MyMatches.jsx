import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sports } from '../../auth/data/signUpOptions';
import { formatMatchDate, formatMatchLocation } from '../../main/utils/matchDisplay';

// [EM-08 내 매치 목록 조회] MyPage → myPageApi.loadMyMatches → GET /api/matches/me.
// 응답 필드가 변경되면 아래 카드 표시를 수정한다. matchId는 상세 페이지 주소에 사용한다.
export default function MyMatches({ loadMyMatches, onUnauthorized }) {
  // 내 목록의 조회 결과/진행 상태/재시도 횟수. 수정 폼의 state와 분리한다.
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(Boolean(loadMyMatches));
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!loadMyMatches) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.resolve().then(() => loadMyMatches({ signal: controller.signal })).then(data => {
      if (!controller.signal.aborted) setMatches(data);
    }).catch(requestError => {
      if (controller.signal.aborted) return;
      if (requestError.response?.status === 401) onUnauthorized();
      else setError('내 매치 목록을 불러오지 못했습니다.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadMyMatches, onUnauthorized, retry]);

  return <section className="mypage-panel mypage-section" aria-labelledby="my-matches-title">
    <h1 id="my-matches-title">내 매치 목록</h1><p className="mypage-list-description">내가 만들거나 참여한 매치를 확인하세요.</p>
    {!loadMyMatches ? <p className="mypage-empty">미리보기에서는 내 매치 목록을 조회하지 않습니다.</p>
      : loading ? <p role="status">매치 목록을 불러오는 중입니다.</p>
      : error ? <><p role="alert" className="mypage-error">{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>다시 시도</button></>
      : matches.length === 0 ? <p className="mypage-empty">아직 만들거나 참여한 매치가 없습니다.</p>
      : <ul className="mypage-match-list">{matches.map(match => <li key={match.matchId}>
        <Link className="mypage-match-link" to={`/matches/${match.matchId}`} aria-label={`${match.title} 상세 보기`}>
        <span className="mypage-status">{match.role === 'OWNER' ? '내가 만든 매치' : '참여한 매치'}</span>
        <h2>{match.title}</h2>
        <p>{formatMatchDate(match.startAt)}{match.startAt && ` · ${match.startAt.slice(11, 16)}`}</p>
        <p>{formatMatchLocation(match.region, match.facilityName)}</p>
        <p>{sports.find(([value]) => value === match.sportType)?.[1] || '종목 미정'} · 참여 인원 {match.numCurrentParticipant}/{match.maxParticipant}명 · {match.isFree === true ? '무료' : match.isFree === false ? '유료' : '요금 정보 없음'}</p>
        <span className="mypage-match-detail">상세 보기 →</span>
        </Link>
      </li>)}</ul>}
  </section>;
}
