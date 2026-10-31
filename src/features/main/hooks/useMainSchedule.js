import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearSession } from '../../../api/axios';
import { districts } from '../../../constants/districts';
import { matchRequestError, requestMatchParticipation } from '../../match/api/matchListApi';
import { loadMyPage } from '../../mypage/api/myPageApi';
import { fetchRecruitingMatches } from '../api/aiMatchApi';
import { buildSchedule } from '../utils/schedule';
import useMyMatchStates from './useMyMatchStates';

const MOBILE_QUERY = '(max-width: 599.98px)';
const isMobile = () => Boolean(window.matchMedia?.(MOBILE_QUERY).matches);

// 메인 일정 보드와 이번 주 목록의 조회·참가 상태. 표시는 MainPage가 맡는다.
export default function useMainSchedule() {
  const moveUrl = useNavigate();
  const [status, setStatus] = useState('loading');
  const [matches, setMatches] = useState([]);
  const [district, setDistrict] = useState(null);
  const [joins, setJoins] = useState({});
  const myMatchStates = useMyMatchStates();
  const [mobile, setMobile] = useState(isMobile);
  const joining = useRef(false);
  const request = useRef(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    if (!quiet) setStatus('loading');
    const hadToken = Boolean(localStorage.getItem('at'));
    try {
      const rows = await fetchRecruitingMatches(controller.signal);
      if (controller.signal.aborted) return;
      setMatches(rows);
      setStatus('success');
    } catch {
      if (controller.signal.aborted) return;
      // 만료된 토큰이 정리됐으면 공개 조회로 한 번 더 시도한다.
      if (hadToken && !localStorage.getItem('at')) { load({ quiet }); return; }
      setStatus(current => (current === 'loading' ? 'error' : current));
    }
  }, []);

  useEffect(() => {
    load();
    return () => request.current?.abort();
  }, [load]);

  // 프로필 조회가 실패해도 보드는 서울 전체로 보여 준다. 공개 페이지라 로그인으로 보내지 않는다.
  useEffect(() => {
    if (!localStorage.getItem('at')) return undefined;
    const controller = new AbortController();
    Promise.resolve().then(() => loadMyPage({ signal: controller.signal, skipSessionRedirect: true })).then(({ profile }) => {
      if (controller.signal.aborted) return;
      setDistrict(districts.find(([code]) => code === profile.district)?.[1] ?? null);
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.(MOBILE_QUERY);
    if (!media) return undefined;
    const change = event => setMobile(event.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  const join = async match => {
    if (joining.current) return;
    if (!localStorage.getItem('at')) {
      moveUrl('/login?redirect=%2F', { state: { from: '/' } });
      return;
    }
    joining.current = true;
    setJoins(previous => ({ ...previous, [match.id]: { status: 'joining' } }));
    try {
      await requestMatchParticipation(match.id);
      setJoins(previous => ({ ...previous, [match.id]: { status: 'done' } }));
      load({ quiet: true });
      return true;
    } catch (error) {
      setJoins(previous => ({ ...previous, [match.id]: { status: 'error', message: matchRequestError(error, 'join') } }));
      if (error.response?.status === 401) {
        clearSession();
        moveUrl('/login?redirect=%2F', { state: { from: '/' } });
      }
    } finally {
      joining.current = false;
    }
    return false;
  };

  const schedule = useMemo(() => buildSchedule(matches, { district, limit: mobile ? 2 : 4 }), [matches, district, mobile]);
  return { status, schedule, district, joins: { ...myMatchStates, ...joins }, join, reload: load };
}
