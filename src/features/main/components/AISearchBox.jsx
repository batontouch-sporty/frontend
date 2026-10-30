import { useId, useState } from 'react';
import spark from '../assets/spark.svg';
import search from '../assets/search.svg';
import plus from '../assets/plus.svg';
import '../css/main.css';
const DEFAULT_KEYWORDS = ['이번 주말', '강남 풋살', '초보 환영', '실내 구장'];

// [AI-02] AI 매치 검색 / [AI-03] AI 매치 생성 — 공통 자연어 입력창
// 입력·버튼·오류 표시만 담당한다. API 주소나 이동 경로는 이곳이 아닌 MainPage/API 모듈에 연결한다.
// onSearch/onGenerate는 Promise를 반환하고 실패 시 Error를 던져야 아래 actionHandler에서 메시지를 표시할 수 있다.
// pending은 두 버튼을 모두 잠그며 generating은 생성 진행 문구를 선택한다. Enter는 검색만 실행한다.
const AISearchBox = ({
  onSearch,
  onGenerate,
  keywords = DEFAULT_KEYWORDS,
  pending = false,
  generating = false,
  initialQuery = ''
}) => {
  const id = useId();
  // [AI-02][AI-03] string: 사용자가 입력한 자연어 원문. actionHandler가 선택한 검색/생성 콜백으로 전달한다.
  // initialQuery는 로그인 후 복원한 생성 문장(AI-01)이다.
  const [query, setQuery] = useState(initialQuery);
  // [AI-02][AI-03] string: 검색/생성 Promise가 실패했을 때 표시할 안내 문구. 새 요청 시 초기화한다.
  const [error, setError] = useState('');
  const actionHandler = action => {
    if (!action || !query.trim() || pending) return;
    setError('');
    return Promise.resolve().then(() => action(query.trim())).catch(error => {
      setError(error.message || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.');
    });
  };
  return (
    <form className="ms-search ms-panel" onSubmit={event => {
    event.preventDefault();
    actionHandler(onSearch);
  }}>
        <div className="ms-search-row">
            <span className="ms-spark">
                <img src={spark} width="20" height="20" alt="" />
            </span>
            <div className="ms-query-field">
                <label htmlFor={id}>원하는 매치 조건을 자연스럽게 설명해 주세요</label>
                <div className="ms-query-input">
                    <input id={id} value={query} onChange={event => setQuery(event.target.value)} placeholder="예: 이번 주말 강남에서 풋살 초보 매치 찾아줘" disabled={pending} />
                    <button type="button" aria-label="검색어 지우기" onClick={() => setQuery('')} disabled={pending || !query}>✕</button>
                </div>
            </div>
        </div>
        <div className="ms-search-bottom">
            <div className="ms-keywords">
                <span>추천 키워드:</span>
                {keywords.map(keyword => <button key={keyword} type="button" disabled={pending} onClick={() => setQuery(previous => previous ? `${previous} ${keyword}` : keyword)}>{keyword}</button>)}
            </div>
            <div className="ms-search-actions">
                <button className="ms-primary" type="submit" disabled={!onSearch || !query.trim() || pending}>
                    <img src={search} width="16" height="16" alt="" />
                    {pending && !generating ? '검색 중…' : 'AI 매치 검색'}
                </button>
                <button className="ms-generate" type="button" disabled={!onGenerate || !query.trim() || pending} onClick={() => actionHandler(onGenerate)}>
                    <img src={plus} width="16" height="16" alt="" />
                    {generating ? '조건 분석 중…' : 'AI 매치 생성'}
                </button>
            </div>
        </div>
        {error && <p className="ms-error" role="alert">{error}</p>}
    </form>
  );
};
export default AISearchBox;
