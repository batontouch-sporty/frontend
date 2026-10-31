import { useEffect, useState } from 'react';

export function errorKind(error) {
  const status = error?.response?.status;
  if (status === 403) return 'forbidden';
  if (status === 404 || status === 501) return 'unavailable';
  if (status === 401) return 'unauthorized';
  return 'error';
}

const messages = {
  forbidden: '접근 권한이 없습니다.',
  unavailable: '연동을 확인할 수 없습니다. API 경로와 서비스 준비 상태를 확인해주세요.',
  unauthorized: '인증을 확인할 수 없습니다. 다시 로그인해주세요.',
  error: '조회에 실패했습니다. 잠시 후 다시 시도해주세요.',
};

export default function RequestPanel({ title, request, children, empty, sessionSignal }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    sessionSignal?.addEventListener('abort', abort);
    if (sessionSignal?.aborted) abort();
    setState({ kind: 'loading' });
    Promise.resolve().then(() => {
      if (!controller.signal.aborted) return request(controller.signal);
      return undefined;
    }).then(data => {
      if (!controller.signal.aborted) setState({ kind: 'success', data });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ kind: errorKind(error) });
    });
    return () => { sessionSignal?.removeEventListener('abort', abort); abort(); };
  }, [request, attempt, sessionSignal]);

  return <section className="admin-dashboard-panel" aria-label={title} aria-busy={state.kind === 'loading'}>
    <h2>{title}</h2>
    {state.kind === 'loading' && <p role="status">불러오는 중입니다.</p>}
    {state.kind === 'success' && (empty?.(state.data) ? <p>조회 결과가 없습니다.</p> : children(state.data))}
    {!['loading', 'success'].includes(state.kind) && <>
      <p role="alert">{messages[state.kind]}</p>
      <button type="button" onClick={() => setAttempt(value => value + 1)}>다시 시도</button>
    </>}
  </section>;
}
