import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toMatchCard } from '../../main/api/aiMatchApi';
import MatchRow from '../../main/components/MatchRow';
import { localDateTime } from '../../main/utils/schedule';

// 응답에 종료 일시가 있으면 경기가 끝날 때까지 다가오는 일정으로 둔다. 일시를 모르면 지난 매치로 보내지 않는다.
const isFinished = ({ status, startAt, endAt }, now) => status === 'COMPLETED' || status === 'CANCELLED'
  || (typeof (endAt || startAt) === 'string' && (endAt || startAt) < now);

// /api/matches/me에는 시설명이 있고 실력·성별이 없다. 행의 장소 칸에 시설까지 넣는다.
const toScheduleRow = match => {
  const card = toMatchCard(match);
  return { ...card, region: card.location, owner: match.role === 'OWNER', status: match.status, endAt: match.endAt };
};

const ScheduleList = ({ matches }) => <ul className="mypage-schedule">{matches.map(match => <li key={match.id}>
  <MatchRow match={match} showDate />
  {match.owner && <span className="mypage-owner">내가 만든 매치</span>}
</li>)}</ul>;

// [EM-08 내 매치 목록 조회] MyPage → myPageApi.loadMyMatches → GET /api/matches/me.
// 응답 필드가 변경되면 toScheduleRow를 수정한다. matchId는 상세 페이지 주소에 사용한다.
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
      if (!controller.signal.aborted) setMatches(data.map(toScheduleRow));
    }).catch(requestError => {
      if (controller.signal.aborted) return;
      if (requestError.response?.status === 401) onUnauthorized();
      else setError('내 매치 목록을 불러오지 못했어요.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadMyMatches, onUnauthorized, retry]);

  const now = localDateTime();
  const byTime = [...matches].sort((a, b) => (a.startAt || '9999').localeCompare(b.startAt || '9999'));
  const upcoming = byTime.filter(match => !isFinished(match, now));
  const finished = byTime.filter(match => isFinished(match, now)).reverse();
  const heading = <div className="mypage-schedule-head"><h2 id="my-matches-title">다가오는 매치</h2><Link to="/matches/search">매치 찾기</Link></div>;

  return <section aria-labelledby="my-matches-title">
    {heading}
    {!loadMyMatches ? <p className="mypage-empty">미리보기에서는 내 매치 목록을 조회하지 않아요.</p>
      : loading ? <p className="mypage-empty" role="status">내 일정을 불러오는 중이에요.</p>
      : error ? <div className="mypage-empty"><p role="alert" className="mypage-error">{error}</p><button type="button" className="mypage-retry" onClick={() => setRetry(value => value + 1)}>다시 시도</button></div>
      : <>
        {upcoming.length === 0 ? <div className="mypage-empty"><p>다가오는 매치가 없어요.</p><Link className="mypage-find" to="/matches/search">매치 찾으러 가기</Link></div> : <ScheduleList matches={upcoming} />}
        {finished.length > 0 && <details className="mypage-finished"><summary>지난 매치 {finished.length}개</summary><ScheduleList matches={finished} /></details>}
      </>}
  </section>;
}
