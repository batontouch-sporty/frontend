import { useEffect, useState } from 'react';
import { loadMyMatches } from '../../mypage/api/myPageApi';

const STATES = {
  OWNER: { status: 'owner' },
  PARTICIPANT: { status: 'done', restored: true },
};

// 목록 API에는 참가 여부가 없어 내 매치 목록으로 행 상태를 되살린다. 부가 조회라 실패해도 목록은 그대로 둔다.
export default function useMyMatchStates() {
  const [states, setStates] = useState({});
  useEffect(() => {
    if (!localStorage.getItem('at')) return undefined;
    const controller = new AbortController();
    Promise.resolve().then(() => loadMyMatches({ signal: controller.signal, skipSessionRedirect: true })).then(rows => {
      if (controller.signal.aborted) return;
      setStates(Object.fromEntries(rows.filter(({ role }) => STATES[role]).map(({ matchId, role }) => [matchId, STATES[role]])));
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  return states;
}
