import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import Header from '../../../components/layout/Header';
import Footer from '../../../components/layout/Footer';
import { getCurrentUser, getUserStats, getMatchStats, queryInstant, queryRange } from '../api/adminApi';
import RequestPanel, { errorKind, useRequest } from '../components/RequestPanel';
import '../css/adminDashboard.css';

const sagaLabels = { requested: '탈퇴 요청', succeeded: '탈퇴 성공', rejected: '탈퇴 거절', timedOut: '탈퇴 시간 초과', inProgress: '진행 중' };
const matchLabels = { RECRUITING: '모집 중', CLOSED: '마감', IN_PROGRESS: '진행 중', COMPLETED: '완료', CANCELLED: '취소' };
const readSession = () => ({
  at: localStorage.getItem('at')?.trim(),
  rt: localStorage.getItem('rt'),
  userId: localStorage.getItem('userId'),
});
const sameSessionValues = (a, b) => a.at === b.at && a.rt === b.rt && a.userId === b.userId;

const loadUsers = signal => getUserStats({ signal });
const loadMatches = signal => getMatchStats({ signal });

// total을 주면 값 앞에 전체 대비 막대를 그린다.
function StatList({ values, labels, total }) {
  return <dl className="admin-dashboard-stats">{Object.entries(labels).map(([key, label]) =>
    <div key={key}><dt>{label}</dt><dd>
      {total > 0 && <span className="admin-dashboard-share" aria-hidden="true"><span style={{ width: `${values[key] / total * 100}%` }} /></span>}
      {values[key].toLocaleString('ko-KR')}
    </dd></div>)}</dl>;
}

function AdminStats({ sessionSignal }) {
  const users = useRequest(loadUsers, sessionSignal);
  const matches = useRequest(loadMatches, sessionSignal);
  // 응답 전이나 실패한 요청의 지표는 값을 짐작하지 않고 비워 둔다. 안내는 아래 패널이 맡는다.
  const figure = (request, read) => request.state.kind === 'success' ? read(request.state.data).toLocaleString('ko-KR') : '-';
  const kpis = [
    ['활성 회원', figure(users, data => data.users.active)],
    ['탈퇴 진행', figure(users, data => data.users.withdrawing)],
    ['전체 매치', figure(matches, data => data.matches.total)],
    ['전체 참가 기록', figure(matches, data => data.participants.total)],
  ];
  return <>
    <section aria-label="핵심 지표">
      <dl className="admin-dashboard-kpis">{kpis.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </section>
    <div className="admin-dashboard-grid">
      <RequestPanel title="탈퇴 처리" request={users}>
        {data => <><StatList values={data.withdrawalSaga} labels={sagaLabels} /><StatList values={data.users} labels={{ withdrawn: '탈퇴 완료 회원' }} /></>}
      </RequestPanel>
      <RequestPanel title="매치 상태" request={matches}>
        {data => <StatList values={data.matches.byStatus} labels={matchLabels} total={data.matches.total} />}
      </RequestPanel>
    </div>
  </>;
}

const kstFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

const kstTime = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const CHART_WIDTH = 640;
const CHART_HEIGHT = 160;
const CHART_INSET = 8;

// 값 문자열을 숫자로 읽어 선을 그린다. NaN·Inf 시점은 선을 끊고, 그릴 값이 없으면 표만 남긴다.
function LineChart({ values, label }) {
  const samples = values.map(([time, value]) => [time, Number(value)]);
  const finite = samples.filter(([, value]) => Number.isFinite(value));
  if (finite.length === 0) return null;
  const times = finite.map(([time]) => time);
  const numbers = finite.map(([, value]) => value);
  const [first, last, low, high] = [Math.min(...times), Math.max(...times), Math.min(...numbers), Math.max(...numbers)];
  const x = time => (last === first ? CHART_WIDTH / 2 : (time - first) / (last - first) * CHART_WIDTH);
  const y = value => (high === low ? CHART_HEIGHT / 2 : CHART_HEIGHT - CHART_INSET - (value - low) / (high - low) * (CHART_HEIGHT - CHART_INSET * 2));
  let connected = false;
  const path = samples.map(([time, value]) => {
    if (!Number.isFinite(value)) { connected = false; return ''; }
    const point = `${x(time).toFixed(1)} ${y(value).toFixed(1)}`;
    const command = connected ? `L${point}` : `M${point} h0`;
    connected = true;
    return command;
  }).filter(Boolean).join(' ');
  return <figure className="admin-dashboard-chart">
    <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={`${label} 추이 그래프`}>
      {[CHART_INSET, CHART_HEIGHT / 2, CHART_HEIGHT - CHART_INSET].map(line => <line key={line} x1="0" x2={CHART_WIDTH} y1={line} y2={line} />)}
      <path d={path} />
    </svg>
    <figcaption>
      <span>{kstTime.format(new Date(first * 1000))}</span>
      <span>최저 {low} · 최고 {high}</span>
      <span>{kstTime.format(new Date(last * 1000))}</span>
    </figcaption>
  </figure>;
}

function RangeResults({ data }) {
  return <div className="admin-dashboard-range-results">{data.map((item, index) => {
    const labels = Object.entries(item.metric).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(', ');
    const headingId = `admin-range-series-${index}`;
    return <section className="admin-dashboard-range-series" key={index} aria-labelledby={headingId}>
      <h3 id={headingId}>시계열 {index + 1}: {labels || '라벨 없음'}</h3>
      {item.values.length === 0 ? <p>표시할 시점이 없어요.</p> : <>
        <LineChart values={item.values} label={`시계열 ${index + 1}`} />
        <div className="admin-dashboard-range-scroll" tabIndex={0}>
          <table aria-labelledby={headingId}>
            <thead><tr><th scope="col">시각 (KST)</th><th scope="col">값</th></tr></thead>
            <tbody>{item.values.map(([timestamp, value], sampleIndex) => {
              const instant = new Date(timestamp * 1000);
              const milliseconds = instant.getUTCMilliseconds();
              const time = `${kstFormatter.format(instant)}${milliseconds ? `.${String(milliseconds).padStart(3, '0')}` : ''} KST`;
              return <tr key={sampleIndex}>
                <td><time dateTime={instant.toISOString()}>{time}</time></td>
                <td>{value}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </>}
    </section>;
  })}</div>;
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
    <p>PromQL을 입력해 운영 지표를 조회해요.</p>
    <form onSubmit={submit}>
      <div className="admin-dashboard-control">
        <label htmlFor="admin-promql">PromQL</label>
        <input id="admin-promql" value={query} onChange={event => setQuery(event.target.value)} required />
      </div>
      <div className="admin-dashboard-control">
        <label htmlFor="admin-query-mode">조회 방식</label>
        <select id="admin-query-mode" value={mode} onChange={event => setMode(event.target.value)}>
          <option value="instant">즉시 조회</option><option value="range">최근 1시간 추이</option>
        </select>
      </div>
      <button type="submit">조회</button>
    </form>
    {state.kind === 'idle' && <p>조회할 지표를 입력해주세요.</p>}
    {state.kind === 'loading' && <p role="status">지표를 불러오는 중이에요.</p>}
    {state.kind === 'success' && state.id === submitted?.id && (state.data.length === 0 ? <p>조회 결과가 없어요.</p> :
      state.mode === 'range' ? <RangeResults data={state.data} /> :
        <ul>{state.data.map((item, index) => <li key={index}>
          <strong>{JSON.stringify(item.metric)}</strong>
          <span>{String(item.value[1])}</span>
        </li>)}</ul>)}
    {!['idle', 'loading', 'success'].includes(state.kind) && <>
      <p role="alert">{{ forbidden: '모니터링 접근 권한이 없어요.', unavailable: '모니터링 연동을 확인할 수 없어요. 경로와 서비스 준비 상태를 확인해주세요.', unauthorized: '인증을 확인할 수 없어요. 다시 로그인해주세요.', error: '지표를 조회하지 못했어요. PromQL 또는 연결 상태를 확인해주세요.' }[state.kind]}</p>
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
      <div className="admin-dashboard-band">
        <div className="admin-dashboard-inner">
          <nav aria-label="현재 위치"><Link to="/">홈</Link><span> / 관리자 대시보드</span></nav>
          <h1>관리자 대시보드</h1>
          {authorized && <p className="admin-dashboard-note">전체 기간의 누적 통계예요.</p>}
        </div>
      </div>
      <div className="admin-dashboard-inner admin-dashboard-body">
        {access.kind === 'loading' && <p role="status">관리자 권한을 확인하는 중이에요.</p>}
        {access.kind === 'forbidden' && <p role="alert">관리자 접근 권한이 없어요.</p>}
        {access.kind === 'unavailable' && <p role="alert">회원 조회 연동을 확인할 수 없어요. API 경로와 서비스 준비 상태를 확인해주세요.</p>}
        {access.kind === 'error' && <p role="alert">관리자 권한을 확인하지 못했어요. 연결 상태를 확인해주세요.</p>}
        {access.kind === 'sessionChanged' && <p role="alert">로그인 계정이 바뀌었어요. 다시 확인해주세요.</p>}
        {['unavailable', 'error', 'sessionChanged'].includes(access.kind) && <button type="button" onClick={() => setAttempt(value => value + 1)}>다시 시도</button>}
        {authorized && <>
          <AdminStats sessionSignal={access.sessionSignal} />
          <Monitoring sessionSignal={access.sessionSignal} />
        </>}
      </div>
    </main>
    <Footer />
  </div>;
}
