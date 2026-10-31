import Footer from '../../../components/layout/Footer';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AISearchBox from '../components/AISearchBox';
import AIConditionSummary from '../components/AIConditionSummary';
import AIConditionEditor from '../components/AIConditionEditor';
import MatchListSection from '../components/MatchListSection';
import MatchRow from '../components/MatchRow';
import useMainSchedule from '../hooks/useMainSchedule';
import api from '../../../api/axios';
import { criteriaToConditions, searchMatchesByCriteria, toConditionSummary, toCriteria, toMatchCard } from '../api/aiMatchApi';
import { prepareAiMatchDraft } from '../../match/utils/aiMatchDraft';
import Header from '../../../components/layout/Header';
import { SPORTS } from '../../match/data/sports';
import '../css/main.css';

/**
 * [메인 화면 연결 지점]
 * onSearch(query): 선택 사항. 기본 AI-02 대신 사용할 때 { conditions, matches } 화면 모델을 반환한다.
 * onGenerate(query): 생성 조건 해석 API를 연결할 자리. { initialValues, facility? }를 반환해야 한다.
 *   main/api에 해석 API 함수를 만든 뒤 routes/AppRoutes.jsx에서 <MainPage onGenerate={함수} />로 연결한다.
 * onEdit(): 조건 편집 UI를 여는 콜백. 편집 결과의 재검색·상태 반영 로직은 별도 구현이 필요하다.
 * onJoin(match): 카드의 화면 모델(id 포함)을 받는다. 참가 API 호출 및 오류/결과 표시를 구현해 연결한다.
 * 최초 목록은 비어 있으며 검색 후 서버 응답만 표시한다.
 * 화면 스타일은 main/css/main.css에서 수정한다.
 */
// [AI-01] 비로그인 상태에서 AI 매치 생성을 누른 문장. 로그인 후 메인에 돌아오면 입력창에 다시 채운다.
const AI_PROMPT_KEY = 'aiDraftPrompt';
const readSavedPrompt = () => {
  try {
    return sessionStorage.getItem(AI_PROMPT_KEY) || '';
  } catch {
    return '';
  }
};


const SportShortcuts = () => <nav className="ms-sports" aria-label="종목 바로가기">
    {SPORTS.map(([sport, name, icon]) => <Link key={sport} to={`/matches/search?sportType=${sport}`}><img src={icon} width="18" height="18" alt="" />{name}</Link>)}
</nav>;

const WeekSchedule = ({ title, status, days, hasBoard, joins, onJoin, onEdit }) => {
  const heading = <div className="ms-week-head"><h2>{title}</h2><div>
      {onEdit && <button type="button" onClick={onEdit}>조건 직접 수정</button>}
      <Link to="/matches/search">전체 일정 보기</Link>
  </div></div>;
  if (status !== 'success') return <section className="ms-week">{heading}</section>;
  if (!hasBoard) return <section className="ms-week">{heading}<div className="ms-week-message"><p>직접 열어 볼까요?</p><Link to="/matches/new">매치 개설</Link></div></section>;
  return <section className="ms-week">{heading}
    {days.length === 0 && <p className="ms-week-note">이번 주 다른 매치는 아직 없어요.</p>}
    {days.map(day => <div className="ms-day" key={day.key}>
      <h3>{day.label}</h3>
      <div className="ms-list">{day.matches.map(match => <MatchRow key={match.id} match={match} joinState={joins[match.id]} onJoin={onJoin} />)}</div>
    </div>)}
  </section>;
};

const MainPage = ({
  conditions = criteriaToConditions(toCriteria(null)),
  onSearch,
  onGenerate,
  onEdit,
  pending = false
}) => {
  // [AI-02] null | { matches: 배열, conditions: 배열 }: 변환된 검색 응답. null은 아직 검색하지 않은 상태다.
  const [searchResults, setSearchResults] = useState(null);
  // [AI-02] 'idle' | 'loading' | 'success' | 'error': 검색 전/로딩/결과/오류 화면을 결정한다.
  const [searchStatus, setSearchStatus] = useState('idle');
  // [AI-03] boolean: 생성 조건 해석 진행 여부. true이면 입력과 버튼을 잠그고 '조건 분석 중'을 표시한다.
  const [generating, setGenerating] = useState(false);
  // [AI-02][AI-03] ref<boolean>: 렌더링 전 연속 클릭도 차단하는 공통 잠금. 화면 표시용 state가 아니다.
  const searching = useRef(false);
  const { status: scheduleStatus, schedule, district, joins, join, reload } = useMainSchedule();
  const visibleMatches = searchResults?.matches ?? [];
  // AI 결과는 재검색하지 않으므로 신청한 행의 인원만 바로 반영한다.
  const joinFromResults = async match => {
    if (!await join(match)) return;
    setSearchResults(previous => previous && {
      ...previous,
      matches: previous.matches.map(row => row.id === match.id && Number.isInteger(row.currentParticipant) ? { ...row, currentParticipant: row.currentParticipant + 1 } : row),
    });
  };
  const visibleConditions = searchResults?.conditions ?? conditions;
  const moveUrl = useNavigate();
  // [AI-01] string: 로그인 전에 저장한 생성 문장. 처음 화면을 열 때 한 번만 읽는다.
  const [savedPrompt] = useState(readSavedPrompt);
  useEffect(() => {
    try { sessionStorage.removeItem(AI_PROMPT_KEY); } catch { /* 저장소를 못 쓰면 복원 없이 진행 */ }
  }, []);
  // 검색 결과가 첫 화면 밖에 나오므로 결과로 이동한다.
  useEffect(() => {
    if (searchStatus === 'success') document.getElementById('match-search-results')?.scrollIntoView?.({ block: 'start' });
  }, [searchStatus]);
  // [AI-02] 조건 직접 수정: 편집 폼 열림 여부 / 재검색 진행 여부 / 재검색 실패 문구
  const [editing, setEditing] = useState(false);
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState('');
  // AI 검색 전에도 열 수 있다. 이때는 AI 조건이 없으므로 빈 조건으로 시작한다.
  const editHandler = onEdit ?? (() => setEditing(true));
  const editCriteria = searchResults?.criteria ?? toCriteria(null);

  // [AI-02] AI 매치 검색
  // 검색할 때만 AI-02를 호출하며 서버에서 받은 결과를 표시한다.
  // 새 요청 시작 시 이전 조건과 카드를 함께 비우고, 성공 시 한 응답으로 함께 교체한다.
  const searchHandler = query => {
    if (searching.current) return;
    searching.current = true;
    setSearchStatus('loading');
    setEditing(false);
    setSearchResults({
      matches: [],
      conditions: []
    });
    // 수업 방식: 페이지의 핸들러에서 요청 → 응답 데이터 → 상태 변경 순서로 처리한다.
    // onSearch는 테스트/외부 연결용이며, 일반 화면에서는 아래 api.post가 실행된다.
    const request = onSearch ? Promise.resolve().then(() => onSearch(query)) : api.post('/api/ai/matches/search', {
      prompt: query.trim()
    }).then(response => {
      const data = response.data;
      if (!Array.isArray(data?.matches)) throw new Error('매치 목록 응답 형식을 확인해주세요.');
      return {
        matches: data.matches.map(toMatchCard),
        conditions: toConditionSummary(data.conditions),
        criteria: data.criteria ? toCriteria(data.criteria) : null
      };
    });
    return request.then(results => {
      if (!Array.isArray(results?.matches) || !Array.isArray(results?.conditions)) throw new Error('매치 검색 응답 형식을 확인해주세요.');
      setSearchResults(results);
      setSearchStatus('success');
    }).catch(error => {
      // 실패 시 이전 검색 결과를 새 추천 결과로 보여주지 않는다.
      setSearchStatus('error');
      const message = error.response?.data?.message;
      if (typeof message === 'string' && message.trim()) throw new Error(message);
      if (error.response?.status === 401) throw new Error('로그인이 필요하거나 인증이 끝났어요. 다시 로그인해 주세요.');
      if (error.response?.status === 500) throw new Error('추천을 처리하지 못했어요. 잠시 후 다시 검색해 주세요.');
      if (error.response || error.request) throw new Error('매치를 불러오지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.');
      throw error;
    }).finally(() => {
      searching.current = false;
    });
  };

  // [AI-02] 조건 직접 수정 → 일반 매치 검색으로 재검색
  // 실패해도 기존 조건과 결과는 유지하고 폼 안에 문구만 보여준다.
  const applyEditHandler = criteria => {
    if (searching.current) return;
    searching.current = true;
    setEditPending(true);
    setEditError('');
    return searchMatchesByCriteria(criteria).then(matches => {
      setSearchResults({ matches, conditions: criteriaToConditions(criteria), criteria });
      // 검색 전에 직접 조건을 입력한 경우에도 결과 화면으로 바꾼다.
      setSearchStatus('success');
      setEditing(false);
    }).catch(() => {
      setEditError('매치를 다시 찾지 못했어요. 잠시 후 다시 시도해 주세요.');
    }).finally(() => {
      searching.current = false;
      setEditPending(false);
    });
  };

  // [AI-03] AI 매치 생성
  // 생성 해석 API는 추후 onGenerate(query)에 연결한다. 검색 API나 매치 등록 API를 대신 호출하지 않는다.
  // 연결 함수는 HTTP 응답 전체가 아니라 prepareAiMatchDraft가 받는 본문 객체를 반환해야 한다.
  // 미연결 상태에서는 원문만 전달한다. 임시 정규식으로 자연어를 해석하거나 등록 API를 호출하지 않는다.
  const generateHandler = query => {
    if (searching.current) return;
    // [AI-01] 비로그인 사용자는 AI를 호출하지 않고 문장만 저장한 뒤 로그인 화면으로 보낸다.
    if (!localStorage.getItem('at')) {
      try { sessionStorage.setItem(AI_PROMPT_KEY, query); } catch { /* 저장 실패 시 문장 없이 이동 */ }
      window.alert('AI 매치 생성은 로그인 후 쓸 수 있어요. 로그인 화면으로 이동할게요.');
      moveUrl('/login?redirect=%2F', { state: { from: '/' } });
      return;
    }
    searching.current = true;
    setGenerating(true);
    return Promise.resolve().then(() => {
      return onGenerate ? onGenerate(query) : undefined;
    }).then(result => {
      if (onGenerate && result == null) throw new Error('매치 생성 조건 응답이 없어요.');
      const aiDraft = prepareAiMatchDraft(query, result);
      // 다른 라우트에는 props를 직접 넘길 수 없어 state를 사용한다.
      // MatchCreatePage가 state.aiDraft를 읽어 MatchForm의 initialValues/selectedFacility로 전달한다.
      moveUrl('/matches/new', {
        state: {
          aiDraft
        }
      });
    }).finally(() => {
      searching.current = false;
      setGenerating(false);
    });
  };




  return (
    <div className="ms-page">
        <Header />
        <main className="ms-main">
            <section className="ms-hero">
                <div className="ms-container ms-hero-grid">
                    <div className="ms-hero-left">
                        <h1>어떤 운동 찾아요?</h1>
                        <p>종목, 시간, 지역, 실력을 말하듯 적어 주세요.</p>
                        <AISearchBox onSearch={searchHandler} onGenerate={generateHandler} initialQuery={savedPrompt} pending={pending || generating || editPending || searchStatus === 'loading'} generating={generating} />
                    </div>
                    <section className="ms-board" aria-labelledby="ms-board-title">
                        <div className="ms-board-head">
                            <h2 id="ms-board-title">{scheduleStatus === 'success' ? schedule.title : '오늘 모집 중'}</h2>
                            {scheduleStatus === 'success' && schedule.scope && <span>{schedule.scope}</span>}
                        </div>
                        <div className="ms-board-body" aria-busy={scheduleStatus === 'loading'}>
                            {scheduleStatus === 'loading' ? <p className="ms-board-message" role="status">일정을 불러오고 있어요.</p>
                              : scheduleStatus === 'error' ? <div className="ms-board-message" role="alert">일정을 불러오지 못했어요.<button type="button" onClick={() => reload()}>다시 시도</button></div>
                              : schedule.board.length === 0 ? <p className="ms-board-message">이번 주 모집 중인 매치가 아직 없어요.</p>
                              : schedule.board.map(match => <MatchRow key={match.id} board match={match} mine={district} joinState={joins[match.id]} onJoin={join} />)}
                        </div>
                        <Link className="ms-board-all" to="/matches/search">전체 일정 보기</Link>
                    </section>
                </div>
            </section>
            <div className="ms-container">
                <SportShortcuts />
                {/* 조건과 매치 목록은 같은 응답으로 함께 갱신해 서로 다른 검색 결과가 섞이지 않게 한다. */}
                {/* [AI-02] 조건 직접 수정 중에는 요약 자리에 편집 폼을 보여준다. */}
                {editing && <AIConditionEditor initialCriteria={editCriteria} onApply={applyEditHandler}
                  onCancel={() => { setEditing(false); setEditError(''); }} pending={editPending} error={editError} />}
                {searchStatus === 'loading' ? <p className="ms-loading" role="status">조건에 맞는 매치를 찾고 있어요.</p>
                  : searchStatus === 'success' ? <>
                    {!editing && visibleConditions.length > 0 && <AIConditionSummary conditions={visibleConditions} onEdit={editHandler} />}
                    <MatchListSection matches={visibleMatches} joins={joins} onJoin={joinFromResults} />
                  </> : <WeekSchedule title={schedule.title === '이번 주 모집 중' && scheduleStatus === 'success' ? '다음 일정' : '이번 주 모집 중'} status={scheduleStatus} days={schedule.days} hasBoard={schedule.board.length > 0} joins={joins} onJoin={join} onEdit={editing ? undefined : editHandler} />}
            </div>
        </main>
        <Footer />
    </div>
  );
};
export default MainPage;
