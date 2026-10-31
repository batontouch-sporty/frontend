import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchMatchList, fetchRecommendedMatches, requestMatchParticipation, matchRequestError } from '../api/matchListApi';
import { loadMyPage } from '../../mypage/api/myPageApi';
import useMyMatchStates from '../../main/hooks/useMyMatchStates';
import { districts, sports } from '../../auth/data/signUpOptions';
import { inDateTab } from '../utils/matchDates';

const EMPTY_FILTERS = { sportType: '', status: '', region: '', isFree: '', preferredOnly: false };

export default function useMatchList() {
  const [profile, setProfile] = useState(null);
  const [profileStatus, setProfileStatus] = useState(() => localStorage.getItem('at') ? 'loading' : 'idle');
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // 메인 종목 바로가기가 ?sportType=FUTSAL로 들어온다.
  const [initialFilters] = useState(() => ({ ...EMPTY_FILTERS, sportType: searchParams.get('sportType') || '' }));
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [matches, setMatches] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [status, setStatus] = useState('loading');
  const [recommendationStatus, setRecommendationStatus] = useState('idle');
  const [listError, setListError] = useState('');
  const [recommendationError, setRecommendationError] = useState('');
  // { 매치 ID: { status: 'joining' | 'done' | 'error', message? } }: MatchRow의 joinState.
  const [joins, setJoins] = useState({});
  const myMatchStates = useMyMatchStates();
  // 날짜 탭은 서버 조건이 아니라 받은 목록을 프론트에서 거른다.
  const [dateTab, setDateTab] = useState('');
  const [sort, setSort] = useState('default');
  const [recommendationSort, setRecommendationSort] = useState('default');
  const [limit, setLimit] = useState(6);
  // 메인 바로가기와 헤더 메뉴처럼 같은 화면에서 주소만 바뀌는 경우도 필터에 반영한다.
  const sportParam = searchParams.get('sportType') || '';
  useEffect(() => {
    setFilters(previous => (previous.sportType === sportParam ? previous : { ...previous, sportType: sportParam }));
    setApplied(previous => (previous.sportType === sportParam ? previous : { ...previous, sportType: sportParam }));
  }, [sportParam]);
  const listRequest = useRef(null);
  const recommendationRequest = useRef(null);
  const joining = useRef(false);
  const mounted = useRef(true);
  const appliedRef = useRef(applied);
  appliedRef.current = applied;

  useEffect(() => {
    if (!localStorage.getItem('at')) return;
    const request = new AbortController();
    setProfileStatus('loading');
    loadMyPage({ signal: request.signal }).then(({ profile: member }) => {
      if (request.signal.aborted) return;
      setProfile({
        nickname: member.nickname,
        region: districts.find(([code]) => code === member.district)?.[1] || member.district,
        sports: sports.filter(([code]) => member.preferenceSports.includes(code)).map(([, label]) => label).join(' · '),
        preferenceSports: member.preferenceSports,
      });
      setProfileStatus('success');
    }).catch(error => {
      if (request.signal.aborted) return;
      setProfile(null);
      setProfileStatus(error.response?.status === 401 ? 'unauthorized' : 'error');
    });
    return () => request.abort();
  }, []);

  // 참가 뒤 재조회는 quiet로 불러 목록이 로딩 문구로 바뀌지 않게 한다.
  const loadList = useCallback(async (conditions, { quiet = false } = {}) => {
    listRequest.current?.abort();
    const request = new AbortController();
    listRequest.current = request;
    if (!quiet) { setStatus('loading'); setListError(''); }
    try {
      const rows = await fetchMatchList(conditions, request.signal);
      if (request.signal.aborted) return;
      setMatches(rows); setStatus('success');
    } catch (error) {
      if (request.signal.aborted || quiet) return;
      setListError(matchRequestError(error)); setStatus('error');
    }
  }, []);

  const loadRecommendations = useCallback(async ({ quiet = false } = {}) => {
    recommendationRequest.current?.abort();
    if (!localStorage.getItem('at')) {
      setRecommendations([]); setRecommendationStatus('idle');
      setRecommendationError('로그인하면 맞춤 추천을 볼 수 있어요.');
      return;
    }
    const request = new AbortController();
    recommendationRequest.current = request;
    if (!quiet) { setRecommendationStatus('loading'); setRecommendationError(''); }
    try {
      const rows = await fetchRecommendedMatches(request.signal);
      if (request.signal.aborted) return;
      setRecommendations(rows); setRecommendationStatus('success');
    } catch (error) {
      if (request.signal.aborted || quiet) return;
      setRecommendationError(matchRequestError(error, 'recommendation')); setRecommendationStatus('error');
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadRecommendations();
    return () => { mounted.current = false; listRequest.current?.abort(); recommendationRequest.current?.abort(); };
  }, [loadRecommendations]);
  useEffect(() => { loadList(applied); }, [applied, loadList]);

  const ordered = useMemo(() => sortMatches(matches.filter(match =>
    (!applied.status || match.statusCode === applied.status)
    && (!applied.preferredOnly || profile?.preferenceSports.includes(match.sportType))
    && inDateTab(match, dateTab)
  ), sort), [matches, applied.status, applied.preferredOnly, profile, sort, dateTab]);

  const onJoin = async matchId => {
    if (joining.current) return;
    if (!localStorage.getItem('at')) {
      const from = location.pathname + location.search;
      navigate(`/login?redirect=${encodeURIComponent(from)}`, { state: { from } });
      return;
    }
    joining.current = true;
    setJoins(previous => ({ ...previous, [matchId]: { status: 'joining' } }));
    try {
      await requestMatchParticipation(matchId);
      if (!mounted.current) return;
      setJoins(previous => ({ ...previous, [matchId]: { status: 'done' } }));
      await Promise.all([loadList(appliedRef.current, { quiet: true }), loadRecommendations({ quiet: true })]);
    } catch (error) {
      if (!mounted.current) return;
      setJoins(previous => ({ ...previous, [matchId]: { status: 'error', message: matchRequestError(error, 'join') } }));
      if (error.response?.status === 401) {
        localStorage.removeItem('at');
        const from = location.pathname + location.search;
        navigate(`/login?redirect=${encodeURIComponent(from)}`, { state: { from } });
      }
    } finally {
      joining.current = false;
    }
  };

  return {
    profile, profileStatus, matches: ordered.slice(0, limit), totalCount: ordered.length,
    recommendations: sortMatches(recommendations, recommendationSort),
    filters, dateTab, sort, recommendationSort, status, recommendationStatus, listError, recommendationError,
    joins: { ...myMatchStates, ...joins }, hasMore: limit < ordered.length,
    onSportChange: sportType => {
      setFilters(previous => ({ ...previous, sportType }));
      setApplied(previous => ({ ...previous, sportType }));
      setLimit(6);
    },
    onDateTab: value => { setDateTab(value); setLimit(6); },
    onFilterChange: (name, value) => setFilters(previous => ({ ...previous, [name]: value })),
    onApply: () => { setLimit(6); setApplied({ ...filters }); },
    onReset: () => { setFilters(EMPTY_FILTERS); setApplied({ ...EMPTY_FILTERS }); setDateTab(''); setSort('default'); setLimit(6); },
    onSort: value => { setSort(value); setLimit(6); },
    onRecommendationSort: setRecommendationSort,
    onJoin, onLoadMore: () => setLimit(previous => previous + 6),
    onRetry: () => loadList(appliedRef.current), onRecommendationRetry: () => loadRecommendations(),
    onFacilitySearch: query => navigate(query.trim() ? `/facilities?${new URLSearchParams({ query: query.trim() })}` : '/facilities'),
  };
}

function sortMatches(matches, sort) {
  if (sort !== 'startAt') return [...matches];
  const time = match => { const value = Date.parse(match.startAt); return Number.isNaN(value) ? Infinity : value; };
  return [...matches].sort((a, b) => time(a) - time(b));
}
