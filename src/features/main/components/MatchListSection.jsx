import { useState } from 'react';
import MatchCard from './MatchCard';
const SORT_OPTIONS = [['score', 'AI 적합도순'], ['startAt', '시간순'], ['distance', '거리순']];
const MatchListSection = ({
  matches,
  onJoin
}) => {
  // [AI-02] 'score' | 'startAt' | 'distance': 받은 추천 목록의 화면 정렬 기준. 서버에 재요청하지 않는다.
  // [EM-02] 전체 목록 페이지에서 재사용할 수 있지만, 현재 이 state는 EM-02 API와 연결되어 있지 않다.
  const [sort, setSort] = useState('score');
  const ordered = [...matches].sort((a, b) => {
    if (sort === 'score') return (b.score ?? -Infinity) - (a.score ?? -Infinity);
    if (sort === 'startAt') return (Date.parse(a.startAt) || Infinity) - (Date.parse(b.startAt) || Infinity);
    return (a.distance ?? Infinity) - (b.distance ?? Infinity);
  });
  return (
    <section id="match-search-results" className="ms-results" aria-label="매치 검색 결과" tabIndex={-1}>
        <div className="ms-results-heading">
            <h2><span className="ms-status-dot" />분석된 조건과 일치하는 매치 <strong>{matches.length}건</strong>을 발견했습니다</h2>
            <div className="ms-sort" role="group" aria-label="정렬 기준">
                <span>정렬 기준:</span>
                {SORT_OPTIONS.map(([value, label]) => <button key={value} type="button" aria-pressed={sort === value} onClick={() => setSort(value)}>{label}</button>)}
            </div>
        </div>
        {ordered.length ? <div className="ms-card-grid">{ordered.map(match => <MatchCard key={match.id} match={match} onJoin={onJoin} />)}</div> : <p className="ms-empty">조건에 맞는 매치가 없습니다. 검색 조건을 변경해주세요.</p>}
    </section>
  );
};
export default MatchListSection;
