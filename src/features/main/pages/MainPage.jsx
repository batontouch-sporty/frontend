import Footer from '../../../components/layout/Footer';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AISearchBox from '../components/AISearchBox';
import AIConditionSummary from '../components/AIConditionSummary';
import AIConditionEditor from '../components/AIConditionEditor';
import MatchListSection from '../components/MatchListSection';
import api from '../../../api/axios';
import { criteriaToConditions, searchMatchesByCriteria, toConditionSummary, toCriteria, toMatchCard } from '../api/aiMatchApi';
import { prepareAiMatchDraft } from '../../match/utils/aiMatchDraft';
import Header from '../../../components/layout/Header';
import arrow from '../assets/arrow.svg';
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

const MainPage = ({
  matches = [],
  conditions = criteriaToConditions(toCriteria(null)),
  onSearch,
  onGenerate,
  onEdit,
  onJoin,
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
  const visibleMatches = searchResults?.matches ?? matches;
  const visibleConditions = searchResults?.conditions ?? conditions;
  const moveUrl = useNavigate();
  // [AI-01] string: 로그인 전에 저장한 생성 문장. 처음 화면을 열 때 한 번만 읽는다.
  const [savedPrompt] = useState(readSavedPrompt);
  useEffect(() => {
    try { sessionStorage.removeItem(AI_PROMPT_KEY); } catch { /* 저장소를 못 쓰면 복원 없이 진행 */ }
  }, []);
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
      if (error.response?.status === 401) throw new Error('로그인이 필요하거나 인증이 만료되었습니다. 다시 로그인해주세요.');
      if (error.response?.status === 500) throw new Error('추천 처리 중 오류가 발생했습니다. 잠시 후 다시 검색해주세요.');
      if (error.response || error.request) throw new Error('매치를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.');
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
      setEditError('매치를 다시 찾지 못했습니다. 잠시 후 다시 시도해주세요.');
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
      window.alert('AI 매치 생성은 로그인 후 이용할 수 있습니다. 로그인 화면으로 이동합니다.');
      moveUrl('/login?redirect=%2F', { state: { from: '/' } });
      return;
    }
    searching.current = true;
    setGenerating(true);
    return Promise.resolve().then(() => {
      return onGenerate ? onGenerate(query) : undefined;
    }).then(result => {
      if (onGenerate && result == null) throw new Error('매치 생성 조건 응답이 없습니다.');
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
        <main className="ms-container ms-main">
            <section className="ms-hero">
                <h1>자연어로 말하듯 검색하면, AI가 딱 맞는 매치 조건을 찾아드립니다</h1>
                <p>종목, 시간, 지역, 실력을 알려주세요. 나에게 맞는 매치를 한눈에 확인하세요.</p>
            </section>
            <AISearchBox onSearch={searchHandler} onGenerate={generateHandler} initialQuery={savedPrompt} pending={pending || generating || editPending || searchStatus === 'loading'} generating={generating} />
            {/* 조건과 매치 목록은 같은 응답으로 함께 갱신해 서로 다른 검색 결과가 섞이지 않게 한다. */}
            {/* [AI-02] 조건 직접 수정 중에는 요약 자리에 편집 폼을 보여준다. */}
            {searchStatus !== 'loading' && searchStatus !== 'error' && (editing
              ? <AIConditionEditor initialCriteria={editCriteria} onApply={applyEditHandler}
                  onCancel={() => { setEditing(false); setEditError(''); }} pending={editPending} error={editError} />
              : visibleConditions.length > 0 && <AIConditionSummary conditions={visibleConditions} onEdit={editHandler} />)}
            {/* 메인에서는 추천 매치를 보여주고, 전체 매치 탐색은 아래 링크로 별도 페이지에 연결한다. */}
            {searchStatus === 'loading' ? <p role="status">조건에 맞는 매치를 찾고 있습니다.</p> : searchStatus === 'idle' && visibleMatches.length === 0 ? <p className="ms-empty">원하는 조건을 입력하면 매치 검색 결과를 확인할 수 있어요.</p> : searchStatus !== 'error' && <MatchListSection matches={visibleMatches} onJoin={onJoin} />}
        </main>
        <Footer />
        {/* [EM-02] 전체 운동 매칭 목록 조회
            여기서는 목록 화면으로 이동만 한다. 담당자는 /matches/search 페이지에서 전체 목록 API를 연결한다. */}
        <Link className="ms-floating" to="/matches/search">
            전체 매치 목록 보러가기
            <img src={arrow} width="10" height="4" alt="" />
        </Link>
    </div>
  );
};
export default MainPage;
