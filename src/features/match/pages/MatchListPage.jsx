import { useState } from 'react';
import Footer from '../../../components/layout/Footer';
import Header from '../../../components/layout/Header';
import MatchRow from '../../main/components/MatchRow';
import MatchListFilters from '../components/MatchListFilters';
import { groupByDay } from '../utils/matchDates';
import '../../main/css/main.css';
import '../css/match.css';
import '../css/matchList.css';
import useMatchList from '../hooks/useMatchList';

// 실제 라우트는 조회/이벤트 훅을 사용하고, 표시 컴포넌트는 독립적으로 테스트한다.
export default function MatchListPage() {
  const model = useMatchList();
  return <MatchListView {...model} />;
}

export function MatchListView({
  matches = [], recommendations = [], profile, profileStatus = 'idle', totalCount,
  filters = {}, dateTab = '', sort = 'default', recommendationSort = 'default', status = 'idle', recommendationStatus = 'idle',
  hasMore = false, listError = '', recommendationError = '', joins = {},
  onSportChange, onDateTab, onFilterChange, onApply, onReset, onSort, onRecommendationSort,
  onJoin, onLoadMore, onRetry, onRecommendationRetry, onFacilitySearch,
}) {
  const join = onJoin && (match => onJoin(match.id));
  const [allRecommendations, setAllRecommendations] = useState(false);
  const profileHeading = profile?.nickname || { loading: '프로필 불러오는 중', error: '프로필을 불러오지 못했어요', unauthorized: '다시 로그인해 주세요' }[profileStatus] || '로그인 후 확인해 주세요';

  return <div className="ms-page ml-page">
    <Header onFacilitySearch={onFacilitySearch} />
    <main className="ms-main">
      <div className="ms-hero ml-hero">
        <div className="ms-container">
          <div className="ml-hero-head">
            <h1>매치 찾기</h1>
            <p>종목과 날짜로 좁혀서 내 일정에 맞는 매치를 골라 보세요.</p>
          </div>
          <section className="ml-profile" aria-label="내 프로필">
            <strong>{profileHeading}</strong>
            <dl>
              <div><dt>선호 종목</dt><dd>{profile?.sports || '정보 없음'}</dd></div>
              <div><dt>활동 권역</dt><dd>{profile?.region || '정보 없음'}</dd></div>
            </dl>
          </section>
          <section className="ms-board ml-board" aria-labelledby="ml-recommendation-title" aria-busy={recommendationStatus === 'loading'}>
            <div className="ms-board-head">
              <h2 id="ml-recommendation-title">회원 맞춤 추천 매치</h2>
              <label>정렬 <select aria-label="추천 매치 정렬" value={recommendationSort} disabled={!onRecommendationSort} onChange={event => onRecommendationSort?.(event.target.value)}><option value="default">기본순</option><option value="startAt">시간순</option></select></label>
            </div>
            {recommendationStatus === 'loading' ? <p className="ms-board-message" role="status">추천 매치를 찾고 있어요.</p>
              : recommendationStatus === 'error' ? <div className="ms-board-message" role="alert">{recommendationError || '추천 매치를 불러오지 못했어요.'}<button type="button" disabled={!onRecommendationRetry} onClick={onRecommendationRetry}>다시 시도</button></div>
              : recommendations.length ? <>
                <div className={`ml-board-rows${allRecommendations ? ' is-all' : ''}`}>{recommendations.map(match => <MatchRow key={match.id} board showDate match={match} mine={profile?.region} joinState={joins[match.id]} onJoin={join} />)}</div>
                {recommendations.length > 2 && <button className="ml-board-more" type="button" aria-expanded={allRecommendations} onClick={() => setAllRecommendations(value => !value)}>{allRecommendations ? '추천 접기' : '추천 더 보기'}</button>}
              </>
              : <p className="ms-board-message">{recommendationError || '추천 매치가 없어요.'}</p>}
          </section>
        </div>
      </div>
      <div className="ms-container">
        <MatchListFilters profile={profile} filters={filters} dateTab={dateTab} onSportChange={onSportChange} onDateTab={onDateTab} onFilterChange={onFilterChange} onApply={onApply} onReset={onReset} />
        <section className="ml-list" aria-labelledby="ml-list-title" aria-busy={status === 'loading'}>
          <div className="ml-list-head">
            <h2 id="ml-list-title">전체 일정 <small>{totalCount ?? matches.length}개 매치</small></h2>
            <div className="ml-sort" role="group" aria-label="목록 정렬">{[['default', '기본순'], ['startAt', '경기 시작순']].map(([value, label]) => <button type="button" key={value} aria-pressed={sort === value} disabled={!onSort} onClick={() => onSort?.(value)}>{label}</button>)}</div>
          </div>
          {status === 'loading' ? <p className="ms-week-message" role="status">매치 목록을 불러오고 있어요.</p>
            : status === 'error' ? <div className="ms-week-message" role="alert"><p>{listError || '매치 목록을 불러오지 못했어요.'}</p><button type="button" disabled={!onRetry} onClick={onRetry}>다시 시도</button></div>
            : matches.length ? groupByDay(matches).map(day => <div className="ms-day" key={day.key}>
              <h3>{day.label}</h3>
              <div className="ms-list">{day.matches.map(match => <MatchRow key={match.id} showDescription match={match} joinState={joins[match.id]} onJoin={join} />)}</div>
            </div>)
            : <p className="ms-week-message">조건에 맞는 매치가 없어요. 검색 조건을 바꿔 보세요.</p>}
          {hasMore && <div className="ml-more"><button type="button" disabled={!onLoadMore || status === 'loading' || status === 'error'} onClick={onLoadMore}>매치 더 보기</button></div>}
        </section>
      </div>
    </main>
    <Footer />
  </div>;
}
