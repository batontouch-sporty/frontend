import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import Header from '../../../components/layout/Header';
import Footer from '../../../components/layout/Footer';
import { getCurrentUser, getUserStats, getMatchStats, queryInstant, queryRange } from '../api/adminApi';
import RequestPanel, { errorKind } from '../components/RequestPanel';
import '../css/adminDashboard.css';

const userLabels = { active: '활성 회원', withdrawing: '탈퇴 진행', withdrawn: '탈퇴 완료' };
const sagaLabels = { requested: '탈퇴 요청', succeeded: '탈퇴 성공', rejected: '탈퇴 거절', timedOut: '탈퇴 시간 초과', inProgress: '진행 중' };
const matchLabels = { RECRUITING: '모집 중', CLOSED: '마감', IN_PROGRESS: '진행 중', COMPLETED: '완료', CANCELLED: '취소' };
const readSession = () => ({
  at: localStorage.getItem('at')?.trim(),
  rt: localStorage.getItem('rt'),
  userId: localStorage.getItem('userId'),
});
const sameSessionValues = (a, b) => a.at === b.at && a.rt === b.rt && a.userId === b.userId;

function StatList({ values, labels }) {
  return <dl className="admin-dashboard-stats">{Object.entries(labels).map(([key, label]) =>
    <div key={key}><dt>{label}</dt><dd>{values[key].toLocaleString('ko-KR')}</dd></div>)}</dl>;
}

function Monitoring({ sessionSignal }) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('instant');
  const [submitted, setSubmitted] = useState(null);
  const requestId = useRef(0);
  const [state, setState] = useState({ kind: 'idle' });

  useEffect(() => {
    if (!submitted) return undefined;
    const controller = new AbortController();
    const abort = () => controller.abort();
    sessionSignal?.addEventListener('abort', abort);
    if (sessionSignal?.aborted) abort();
    const now = Math.floor(Date.now() / 1000);
    const options = submitted.mode === 'instant'
      ? { query: submitted.query, signal: controller.signal }
      : { query: submitted.query, start: now - 3600, end: now, step: 60, signal: controller.signal };
    const load = submitted.mode === 'instant' ? queryInstant : queryRange;
    Promise.resolve().then(() => {
      if (!controller.signal.aborted) return load(options);
      return undefined;
    }).then(data => {
      if (!controller.signal.aborted && requestId.current === submitted.id) {
        setState({ kind: 'success', id: submitted.id, mode: submitted.mode, data });
      }
    }).catch(error => {
      if (!controller.signal.aborted && requestId.current === submitted.id) {
        setState({ kind: errorKind(error), id: submitted.id });
      }
    });
    return () => { sessionSignal?.removeEventListener('abort', abort); abort(); };
  }, [submitted, sessionSignal]);

  const startRequest = next => {
    const id = ++requestId.current;
    setState({ kind: 'loading', id });
    setSubmitted({ ...next, id });
  };

  const submit = event => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    startRequest({ query: trimmed, mode });
  };

  return <section className="admin-dashboard-panel admin-dashboard-monitor" aria-label="모니터링" aria-busy={state.kind === 'loading'}>
    <h2>모니터링</h2>
    <p>운영 지표는 아직 확정되지 않았습니다. PromQL을 입력해 조회할 수 있습니다.</p>
    <form onSubmit={submit}>
      <label htmlFor="admin-promql">PromQL</label>
      <input id="admin-promql" value={query} onChange={event => setQuery(event.target.value)} required />
      <label htmlFor="admin-query-mode">조회 방식</label>
      <select id="admin-query-mode" value={mode} onChange={event => setMode(event.target.value)}>
        <option value="instant">즉시 조회</option><option value="range">최근 1시간 추이</option>
      </select>
      <button type="submit">조회</button>
    </form>
    {state.kind === 'idle' && <p>조회할 지표를 입력해주세요.</p>}
    {state.kind === 'loading' && <p role="status">지표를 불러오는 중입니다.</p>}
    {state.kind === 'success' && state.id === submitted?.id && (state.data.length === 0 ? <p>조회 결과가 없습니다.</p> :
      <ul>{state.data.map((item, index) => <li key={index}>
        <strong>{JSON.stringify(item.metric)}</strong>
        <span>{state.mode === 'instant' ? String(item.value[1]) : `${item.values.length}개 시점`}</span>
      </li>)}</ul>)}
    {!['idle', 'loading', 'success'].includes(state.kind) && <>
      <p role="alert">{{ forbidden: '모니터링 접근 권한이 없습니다.', unavailable: '모니터링 연동을 확인할 수 없습니다. 경로와 서비스 준비 상태를 확인해주세요.', unauthorized: '인증을 확인할 수 없습니다. 다시 로그인해주세요.', error: '지표 조회에 실패했습니다. PromQL 또는 연결 상태를 확인해주세요.' }[state.kind]}</p>
      <button type="button" onClick={() => startRequest(submitted)}>다시 시도</button>
    </>}
  </section>;
}

export default function AdminDashboardPage() {
  const location = useLocation();
  const token = localStorage.getItem('at')?.trim();
  const [attempt, setAttempt] = useState(0);
  const [sessionRevision, setSessionRevision] = useState(0);
  const [access, setAccess] = useState({ kind: 'loading' });
  const observedSession = useRef(readSession());
  const checkingRequest = useRef(null);
  const approvedRequests = useRef(null);
  const loadUsers = useCallback(signal => getUserStats({ signal }), []);
  const loadMatches = useCallback(signal => getMatchStats({ signal }), []);

  const checkSessionChange = useCallback(() => {
    const current = readSession();
    if (sameSessionValues(current, observedSession.current)) return;
    observedSession.current = current;
    // 화면을 먼저 비우고, 이전 A2·통계·모니터링 요청을 즉시 취소한다.
    checkingRequest.current?.abort();
    approvedRequests.current?.abort();
    setAccess({ kind: 'loading' });
    setSessionRevision(value => value + 1);
  }, []);

  useEffect(() => {
    const onStorage = event => {
      if (event.key === null || ['at', 'rt', 'userId'].includes(event.key)) checkSessionChange();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkSessionChange();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', checkSessionChange);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', checkSessionChange);
      document.removeEventListener('visibilitychange', onVisible);
      checkingRequest.current?.abort();
      approvedRequests.current?.abort();
    };
  }, [checkSessionChange]);

  useEffect(() => {
    const starting = readSession();
    if (!starting.at) return undefined;
    const controller = new AbortController();
    checkingRequest.current = controller;
    setAccess({ kind: 'loading' });
    Promise.resolve().then(() => {
      if (!controller.signal.aborted) return getCurrentUser({ signal: controller.signal });
      return undefined;
    }).then(({ user, authorization, retried }) => {
      if (controller.signal.aborted) return;
      const current = readSession();
      // AT만 변경됐다면 같은 RT·userId 세션에서 Axios가 재발급 후 현재 AT로
      // 재시도한 응답만 허용한다. 로그아웃/계정 전환의 늦은 응답은 승인하지 않는다.
      const sameSession = current.rt === starting.rt && current.userId === starting.userId;
      const validRequestToken = Boolean(current.at) && authorization === `Bearer ${current.at}`;
      const continuousToken = current.at === starting.at || (Boolean(starting.rt) && retried);
      if (!sameSession || !validRequestToken || !continuousToken) {
        setAccess({ kind: 'sessionChanged' });
        return;
      }
      observedSession.current = current;
      if (user?.role === 'ADMIN') {
        const approved = new AbortController();
        approvedRequests.current = approved;
        setAccess({ kind: 'admin', token: current.at, sessionSignal: approved.signal });
      } else setAccess({ kind: 'forbidden' });
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (localStorage.getItem('rt') !== starting.rt || localStorage.getItem('userId') !== starting.userId
        || (!starting.rt && localStorage.getItem('at')?.trim() !== starting.at)) {
        setAccess({ kind: 'sessionChanged' });
      } else setAccess({ kind: errorKind(error) });
    });
    return () => controller.abort();
  }, [attempt, sessionRevision]);

  const from = location.pathname + location.search + location.hash;
  if (!token || access.kind === 'unauthorized') return <Navigate to="/login" replace state={{ from }} />;
  const authorized = access.kind === 'admin' && access.token === token;

  // 화면 진입만 제한한다. 실제 ADMIN 보호는 Gateway/서비스의 JWT 권한 검사 책임이다.
  return <div className="admin-dashboard">
    <Header />
    <main className="admin-dashboard-main">
      <nav aria-label="현재 위치"><Link to="/">홈</Link><span> / 관리자 대시보드</span></nav>
      <h1>관리자 대시보드</h1>
      {access.kind === 'loading' && <p role="status">관리자 권한을 확인하는 중입니다.</p>}
      {access.kind === 'forbidden' && <p role="alert">관리자 접근 권한이 없습니다.</p>}
      {access.kind === 'unavailable' && <p role="alert">회원 조회 연동을 확인할 수 없습니다. API 경로와 서비스 준비 상태를 확인해주세요.</p>}
      {access.kind === 'error' && <p role="alert">관리자 권한을 확인하지 못했습니다. 연결 상태를 확인해주세요.</p>}
      {access.kind === 'sessionChanged' && <p role="alert">로그인 세션이 변경되었습니다. 현재 계정으로 다시 확인해주세요.</p>}
      {['unavailable', 'error', 'sessionChanged'].includes(access.kind) && <button type="button" onClick={() => setAttempt(value => value + 1)}>다시 시도</button>}
      {authorized && <>
        <p className="admin-dashboard-note">A28·A29는 전체 기간의 누적 통계입니다.</p>
        <div className="admin-dashboard-grid">
          <RequestPanel title="회원 누적 통계" request={loadUsers} sessionSignal={access.sessionSignal}>
            {data => <><StatList values={data.users} labels={userLabels} /><h3>탈퇴 처리</h3><StatList values={data.withdrawalSaga} labels={sagaLabels} /></>}
          </RequestPanel>
          <RequestPanel title="매칭 누적 통계" request={loadMatches} sessionSignal={access.sessionSignal}>
            {data => <><StatList values={{ total: data.matches.total }} labels={{ total: '전체 매치' }} /><StatList values={data.matches.byStatus} labels={matchLabels} /><StatList values={data.participants} labels={{ total: '전체 참가 기록' }} /></>}
          </RequestPanel>
        </div>
        <Monitoring sessionSignal={access.sessionSignal} />
      </>}
    </main>
    <Footer />
  </div>;
}
