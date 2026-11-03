import Footer from '../../../components/layout/Footer';
import Header from '../../../components/layout/Header';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getMatchDetail, joinMatch, leaveMatch, deleteMatch, updateAttendance } from '../api/matchApi';
import ProfileModal from '../../profiles/components/ProfileModal';
import WaitlistActions from '../components/WaitlistActions';
import { SKILL_LABELS as LEVELS } from '../../../constants/skillLevels';
import { DEPOSIT_POINTS, depositErrorMessage } from '../utils/depositMessages';
import { localDateTime } from '../../main/utils/schedule';
import '../css/match.css';
import '../css/matchDetail.css';

const SPORTS = {
  SOCCER: '축구', FUTSAL: '풋살', BASKETBALL: '농구', BASEBALL: '야구',
  TENNIS: '테니스', BADMINTON: '배드민턴', TABLE_TENNIS: '탁구',
  VOLLEYBALL: '배구', SWIMMING: '수영', RUNNING: '러닝',
};
const GENDERS = { MALE: '남성', FEMALE: '여성', MIXED: '혼성' };

// 서버의 LocalDateTime을 시간대 변환 없이 그대로 표시한다.
function dateLabel(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return '정보 없음';
  return value.slice(0, 10).replaceAll('-', '.');
}

function timeLabel(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return '정보 없음';
  return value.slice(11, 16);
}

function durationLabel(start, end) {
  // 문자열에 UTC 표식을 붙여 브라우저의 지역/DST에 따른 계산 차이를 방지한다.
  const minutes = (Date.parse(`${end}Z`) - Date.parse(`${start}Z`)) / 60000;
  if (!Number.isFinite(minutes) || minutes <= 0) return '정보 없음';
  const hours = Math.floor(minutes / 60);
  const remaining = Math.floor(minutes % 60);
  return [hours ? `${hours}시간` : '', remaining ? `${remaining}분` : ''].filter(Boolean).join(' ');
}

const Breadcrumb = () => <nav className="match-breadcrumb" aria-label="현재 위치">
  <Link to="/">홈</Link><span>/</span><Link to="/matches/search">매치 찾기</Link><span>/</span>
  <span aria-current="page">매치 상세</span>
</nav>;

function Avatar({ participant }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [participant.imageUrl]);
  return (
    <span className="detail-avatar" aria-hidden="true">
      {participant.imageUrl && !failed
        ? <img src={participant.imageUrl} alt="" onError={() => setFailed(true)} />
        : (participant.nickname?.trim().slice(0, 1) || '?')}
    </span>
  );
}

const ATTENDANCE_LABELS = { ATTENDED: '출석', NO_SHOW: '노쇼' };

// [출석] 방장 화면에서만 matchParticipantStatus 값이 온다. 진행 중이면 토글, 종료 후에는 확정 값만 보여 준다.
function AttendanceControl({ participant, phase, disabled, onChange }) {
  if (!Number.isSafeInteger(participant.participantId) || !ATTENDANCE_LABELS[participant.matchParticipantStatus]) return null;
  if (phase === 'closed') return <span className="detail-attendance-final">{ATTENDANCE_LABELS[participant.matchParticipantStatus]}</span>;
  if (phase !== 'open') return null;
  const name = participant.nickname || '참가자';
  return <div className="detail-attendance" role="group" aria-label={`${name} 출석 체크`}>
    {Object.entries(ATTENDANCE_LABELS).map(([value, label]) => <button key={value} type="button"
      className={participant.matchParticipantStatus === value ? 'is-selected' : undefined} aria-pressed={participant.matchParticipantStatus === value}
      disabled={disabled} onClick={() => onChange(participant, value)}>{label}</button>)}
  </div>;
}

function Participant({ participant, preview, onProfileClick, attendance }) {
  const name = participant.nickname || '프로필 정보 없음';
  return (
    <li className={`detail-person ${participant.role === 'OWNER' ? 'detail-person-owner' : ''}`}>
      <Avatar participant={participant} />
      <div>
        {participant.profileId && !preview
          ? <button type="button" className="detail-profile-button" aria-haspopup="dialog" onClick={() => onProfileClick(participant.profileId)}>{name}</button>
          : <strong>{name}</strong>}
        <span className="detail-person-role">{participant.role === 'OWNER' ? '매치 생성자' : '참가자'}</span>
      </div>
      {participant.role === 'OWNER' && <span className="detail-tag">개설자</span>}
      {attendance}
    </li>
  );
}

export default function MatchDetailPage({ previewMatch }) {
  const { matchId } = useParams();
  const [result, setResult] = useState({ match: null, loading: true, error: null });
  const [retryCount, setRetryCount] = useState(0);
  const preview = process.env.NODE_ENV === 'development' && Boolean(previewMatch);

  function refreshMatch() {
    setResult({ match: null, loading: true, error: null });
    setRetryCount(count => count + 1);
  }

  useEffect(() => {
    if (preview) {
      setResult({ match: previewMatch, loading: false, error: null });
      return;
    }
    if (!/^[1-9]\d*$/.test(matchId || '') || !Number.isSafeInteger(Number(matchId))) {
      setResult({ match: null, loading: false, error: 'not-found' });
      return;
    }
    const controller = new AbortController();
    let active = true;
    setResult({ match: null, loading: true, error: null });

    async function loadMatch() {
      try {
        const match = await getMatchDetail(matchId, controller.signal);
        if (active) setResult({ match, loading: false, error: null });
      } catch (error) {
        if (active) {
          setResult({ match: null, loading: false, error: error.response?.status === 404 ? 'not-found' : 'request' });
        }
      }
    }
    loadMatch();
    // 다른 매치로 이동하면 이전 요청의 결과가 새 화면을 덮지 않게 한다.
    return () => { active = false; controller.abort(); };
  }, [matchId, retryCount, preview, previewMatch]);

  const { match, loading, error } = result;
  return (
    <div className="match-page detail-page">
      <Header />
      <main className="detail-main">
        {(preview || loading || error) && <div className="detail-body">
          {!match && <Breadcrumb />}
          {preview && <p className="detail-preview-notice">디자인 미리보기 · 예시 데이터이며 실제 매치가 아니에요.</p>}
          {loading && <div className="match-section detail-feedback" role="status"><span className="detail-spinner" /><h1>매치 정보를 불러오는 중이에요</h1><p>잠시만 기다려 주세요.</p></div>}
          {error && <div className="match-section detail-feedback" role="alert">
            <span className="detail-feedback-icon" aria-hidden="true">!</span>
            <h1>{error === 'not-found' ? '매치를 찾을 수 없어요' : '매치 정보를 불러오지 못했어요'}</h1>
            <p>{error === 'not-found' ? '삭제되었거나 존재하지 않는 매치예요.' : '연결 상태를 확인하고 다시 시도해 주세요.'}</p>
            <div className="detail-feedback-actions">
              {error === 'request' && <button className="detail-primary-button" onClick={() => setRetryCount(count => count + 1)}>다시 시도</button>}
              <Link className="detail-secondary-link" to="/">매치 찾기로 이동</Link>
            </div>
          </div>}
        </div>}
        {!loading && !error && match && String(match.matchId) === String(preview ? match.matchId : matchId) && <MatchDetailContent key={`${match.matchId}-${retryCount}`} match={match} preview={preview} onRefresh={refreshMatch} />}
      </main>
      <Footer />
    </div>
  );
}
  // [PR-02] 선택한 참가자의 프로필 ID. null이면 모달을 닫고, 로그인 안내/조회는 모달이 처리한다.
function MatchDetailContent({ match, preview, onRefresh }) {
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState(null);
  const [actionError, setActionError] = useState('');
  // 참가 202 접수 후 확정을 기다리는 동안의 안내. 화면을 떠나면 상태 조회를 멈춘다.
  const [notice, setNotice] = useState('');
  const poll = useRef(null);
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; poll.current?.abort(); }; }, []);
  // 출석 단계가 화면을 연 채로도 바뀌도록 현재 시각(분)을 상태로 두고, 다음 경계 시각에 한 번 갱신한다.
  const [now, setNow] = useState(() => localDateTime().slice(0, 16));
  const login = (message = '참가 신청을 하려면 로그인이 필요해요.') => {
    window.alert(message);
    const from = location.pathname + location.search;
    navigate(`/login?redirect=${encodeURIComponent(from)}`, { state: { from } });
  };

  async function handleLeave() {
    if (preview || busy.current || match.isOwner === true || match.isParticipant !== true) return;
    if (!localStorage.getItem('at')) {
      login('매치에서 탈퇴하려면 로그인이 필요해요.');
      return;
    }
    if (!window.confirm(`이 매치에서 탈퇴할까요? 시작 전 취소라 보증 포인트 ${DEPOSIT_POINTS}점은 돌려받아요.`)) return;
    busy.current = true;
    setPending('leave');
    setActionError('');
    try {
      await leaveMatch(match.matchId);
      if (!active.current) return;
      window.alert('매치에서 탈퇴했어요. 보증 포인트는 곧 반환돼요.');
      onRefresh();
    } catch (error) {
      if (!active.current) return;
      const statusCode = error.response?.status;
      const code = error.response?.data?.code;
      if (statusCode === 401) {
        localStorage.removeItem('at');
        login('인증이 만료됐어요. 다시 로그인해 주세요.');
        return;
      }
      if (statusCode === 403) {
        window.alert(code === 'MATCH_OWNER_CANNOT_LEAVE'
          ? '매치 생성자는 탈퇴할 수 없어요. 매치 삭제 기능을 이용해 주세요.'
          : '이 매치에서 탈퇴할 권한이 없어요.');
        onRefresh();
        return;
      }
      if (statusCode === 404) {
        if (code === 'MATCH_NOT_FOUND') {
          window.alert('이미 삭제되었거나 존재하지 않는 매치예요.');
          navigate('/', { replace: true });
        } else {
          window.alert('매치 참가 정보를 확인할 수 없어요. 현재 상태를 다시 불러올게요.');
          onRefresh();
        }
        return;
      }
      if (statusCode === 400 && code === 'MATCH_ALREADY_STARTED') {
        window.alert('이미 시작된 매치는 취소할 수 없어요.');
        onRefresh();
        return;
      }
      setActionError('탈퇴 결과를 확인하지 못했어요. 새로고침 후 참가 상태를 확인해 주세요.');
      busy.current = false;
      setPending(null);
    }
  }

  async function handleAttendance(person, attendance) {
    if (preview || busy.current || person.matchParticipantStatus === attendance) return;
    if (attendance === 'NO_SHOW' && !window.confirm(`노쇼로 체크하면 이 참가자의 보증 포인트 ${DEPOSIT_POINTS}점은 반환되지 않아요. 노쇼로 체크할까요?`)) return;
    busy.current = true; setPending('attendance'); setActionError('');
    try {
      await updateAttendance(match.matchId, person.participantId, attendance);
      if (!active.current) return;
      onRefresh();
    } catch (error) {
      if (!active.current) return;
      const statusCode = error.response?.status;
      const code = error.response?.data?.code;
      if (statusCode === 401) {
        localStorage.removeItem('at');
        login('인증이 만료됐어요. 다시 로그인해 주세요.');
        return;
      }
      const reasons = {
        ATTENDANCE_UPDATE_NOT_ALLOWED: '지금은 출석을 바꿀 수 없어요.',
        FORBIDDEN: '출석을 바꿀 권한이 없어요.',
        MATCH_PARTICIPANT_NOT_FOUND: '참가자 정보를 찾을 수 없어요. 현재 상태를 다시 불러올게요.',
      };
      if (reasons[code]) {
        window.alert(reasons[code]);
        onRefresh();
        return;
      }
      setActionError('출석 변경 결과를 확인하지 못했어요. 새로고침 후 확인해 주세요.');
      busy.current = false;
      setPending(null);
    }
  }

  async function performAction(action) {
    if (preview || busy.current) return;
    if (action === 'delete' ? match.isOwner !== true : match.isOwner === true || match.isParticipant === true || match.status !== 'RECRUITING' || remaining === 0) return;
    if (!localStorage.getItem('at')) {
      login(action === 'delete' ? '매치를 삭제하려면 로그인이 필요해요.' : undefined);
      return;
    }
    if (action === 'delete' && !window.confirm('이 매치를 삭제할까요? 삭제한 매치는 복구할 수 없어요.')) return;
    busy.current = true; setPending(action); setActionError('');
    try {
      if (action === 'delete') await deleteMatch(match.matchId);
      else {
        poll.current = new AbortController();
        await joinMatch(match.matchId, { signal: poll.current.signal,
          onPending: () => setNotice('보증 포인트 차감을 확인하고 있어요. 참가가 확정될 때까지 잠시 기다려 주세요.') });
      }
      if (!active.current) return;
      if (action === 'delete') {
        window.alert('매치가 삭제됐어요.');
        navigate('/', { replace: true });
      } else {
        window.alert('참가 신청이 완료됐어요.');
        onRefresh();
      }
    } catch (error) {
      if (!active.current) return;
      setNotice('');
      const statusCode = error.response?.status;
      if (statusCode === 401) {
        localStorage.removeItem('at');
        login('인증이 만료됐어요. 다시 로그인해 주세요.');
        return;
      }
      // 보증금 처리 결과(실패·취소·대기 초과)와 포인트 부족·참여 정지·처리 중 오류는 사유별 문구로 남긴다.
      const depositMessage = action === 'join' && (error.depositRequest ? error.message : depositErrorMessage(error.response?.data?.code));
      if (depositMessage) {
        setActionError(depositMessage);
        busy.current = false;
        setPending(null);
        return;
      }
      const messages = { 400: '모집이 마감되었거나 정원이 찼어요.', 403: '이 작업을 수행할 권한이 없어요.', 404: '매치를 찾을 수 없어요.', 409: '이미 참가 중인 매치예요.', 501: '현재 이 기능을 준비 중이에요.' };
      if (statusCode === 404) {
        window.alert(messages[404]);
        navigate('/', { replace: true });
        return;
      }
      if (action === 'join' && (statusCode === 400 || statusCode === 409)) {
        const reasons = {
          MATCH_RECRUITMENT_CLOSED: '모집이 마감된 매치예요.',
          MATCH_FULL: '모집 정원이 찼어요.',
          MATCH_ALREADY_STARTED: '이미 시작된 매치에는 참가할 수 없어요.',
        };
        window.alert(reasons[error.response?.data?.code] || messages[statusCode]);
        onRefresh();
        return;
      }
      setActionError(messages[statusCode] || (action === 'delete' ? '삭제 결과를 확인하지 못했어요. 새로고침 후 확인해 주세요.' : '참가 결과를 확인하지 못했어요. 새로고침 후 확인해 주세요.'));
      // 성공/상태 변경 시에는 재조회가 끝날 때까지 기존 버튼을 잠근다.
      busy.current = false;
      setPending(null);
    }
  }
  const participants = Array.isArray(match.participants) ? match.participants : null;
  const owners = participants?.filter(person => person.role === 'OWNER') || [];
  const members = participants?.filter(person => person.role !== 'OWNER') || [];
  const current = Number.isInteger(match.currentParticipantCount) ? match.currentParticipantCount : null;
  const maximum = Number.isInteger(match.maxParticipant) && match.maxParticipant > 0 ? match.maxParticipant : null;
  const remaining = current !== null && maximum !== null ? Math.max(0, maximum - current) : null;
  const progress = current !== null && maximum !== null ? Math.min(100, Math.max(0, current / maximum * 100)) : 0;
  const closed = match.status !== 'RECRUITING' || remaining === 0;
  const seats = remaining === null ? '인원 정보 없음' : closed ? '마감' : `${remaining}자리 남음`;
  const place = [match.region, match.locationName].filter(Boolean).join(' · ') || '장소 정보 없음';
  const status = { RECRUITING: '모집 중', CLOSED: '모집 마감' }[match.status] || '상태 정보 없음';
  const schedule = `${dateLabel(match.startAt)} ${timeLabel(match.startAt)} — ${match.startAt?.slice(0, 10) !== match.endAt?.slice(0, 10) ? `${dateLabel(match.endAt)} ` : ''}${timeLabel(match.endAt)}`;
  // 출석은 시작 시각 이상, 종료 시각 미만에만 바꿀 수 있다. 서버 LocalDateTime과 같은 분 단위로 비교한다.
  const attendancePhase = match.status === 'CANCELLED' || match.isOwner !== true || !match.startAt || !match.endAt ? null
    : now < match.startAt.slice(0, 16) ? 'before' : now < match.endAt.slice(0, 16) ? 'open' : 'closed';
  const nextBoundary = { before: match.startAt, open: match.endAt }[attendancePhase]?.slice(0, 16);
  useEffect(() => {
    if (!nextBoundary) return undefined;
    // setTimeout 최대 지연(약 24.8일)을 넘으면 중간에 한 번 깨어나 다시 건다.
    const delay = Math.min(Math.max(0, new Date(nextBoundary) - Date.now()), 2 ** 31 - 1);
    const timer = setTimeout(() => setNow(localDateTime().slice(0, 16)), delay);
    return () => clearTimeout(timer);
  }, [nextBoundary, now]);
  const attendanceNote = { before: '시작 후 노쇼를 체크할 수 있어요.', open: '노쇼한 참가자를 체크해 주세요. 체크하지 않으면 출석으로 확정돼요.', closed: '출석이 확정됐어요.' }[attendancePhase];
  let actionLabel = '참가 신청하기';
  if (match.isOwner === true) actionLabel = pending === 'delete' ? '삭제 중…' : '매치 삭제하기';
  else if (match.isParticipant === true) actionLabel = pending === 'leave' ? '탈퇴 중…' : '매치 탈퇴하기';
  else if (match.status === 'CLOSED') actionLabel = '모집이 마감됐어요';
  else if (remaining === 0) actionLabel = '모집 정원이 찼어요';

  return (
    <>
      <div className="detail-hero">
        <div className="detail-hero-inner">
          <Breadcrumb />
          <div className="detail-hero-row">
            <div className="detail-hero-time"><strong>{timeLabel(match.startAt)}</strong><span>{dateLabel(match.startAt)}</span></div>
            <div className="detail-hero-title">
              <div className="detail-tags">
                <span className="detail-tag">{SPORTS[match.sportType] || '종목 정보 없음'}</span>
                <span className="detail-tag detail-tag-neutral">{LEVELS[match.skillLevel] || '실력 정보 없음'}</span>
                <span className="detail-tag detail-tag-neutral">{GENDERS[match.genderGroup] ?? '성별 구성 정보 없음'}</span>
                <span className={`detail-tag ${match.status === 'RECRUITING' ? 'detail-tag-open' : 'detail-tag-neutral'}`}>{status}</span>
              </div>
              <h1>{match.title || '제목 정보 없음'}</h1>
              <div className="detail-meta"><span>{schedule}</span><span>{place}</span></div>
            </div>
            <div className={`detail-hero-seats${remaining === null ? ' is-unknown' : ''}`}><strong>{seats}</strong>{remaining !== null && <span>{current}/{maximum}명</span>}</div>
          </div>
        </div>
      </div>
      <div className="detail-body detail-grid">
        <div className="detail-sections">
          <section className="detail-section" aria-labelledby="detail-participants-title">
            <div className="detail-section-title"><h2 id="detail-participants-title">참가자</h2><span>{current === null ? '인원 정보 없음' : `${current}명 참여 중`}</span></div>
            {attendanceNote && !preview && participants?.length > 0 && <p className="detail-attendance-note">{attendanceNote}</p>}
            {participants === null ? <p className="detail-empty">참가자 정보를 확인할 수 없어요.</p> : participants.length === 0 ? <p className="detail-empty">아직 참여한 사람이 없어요.</p> : <ul className={`detail-people${attendancePhase === 'open' && !preview ? ' is-attendance' : ''}`}>
              {[...owners, ...members].map((person, index) => <Participant key={person.profileId ?? `person-${index}`} participant={person} preview={preview} onProfileClick={setSelectedProfileId}
                attendance={!preview && attendancePhase && <AttendanceControl participant={person} phase={attendancePhase} disabled={pending !== null} onChange={handleAttendance} />} />)}
            </ul>}
          </section>
          <section className="detail-section" aria-labelledby="detail-summary-title">
            <div className="detail-section-title"><h2 id="detail-summary-title">매치 정보</h2>
              {match.serviceId && !preview && <Link to={`/facilities/${match.serviceId}`}>시설 정보</Link>}
            </div>
            <dl className="detail-facts">
              <div><dt>일시</dt><dd>{dateLabel(match.startAt)}</dd><dd>{timeLabel(match.startAt)} — {timeLabel(match.endAt)}</dd></div>
              <div><dt>경기 시간</dt><dd>{durationLabel(match.startAt, match.endAt)}</dd></div>
              <div><dt>인원 구성</dt><dd>{current ?? '—'} / {maximum ?? '—'}명 참여</dd><dd>{GENDERS[match.genderGroup] ?? '성별 구성 정보 없음'}</dd></div>
              <div><dt>체육시설</dt><dd>{match.serviceName ?? '시설명 정보 없음'}</dd></div>
              <div><dt>장소</dt><dd>{match.locationName ?? '장소 정보 없음'}</dd></div>
              <div><dt>지역</dt><dd>{match.region ?? '지역 정보 없음'}</dd></div>
            </dl>
            {!match.serviceName && !match.locationName && !match.region && <p className="detail-place-note">등록된 장소 정보가 아직 없어요.</p>}
          </section>
          <section className="detail-section" aria-labelledby="detail-description-title">
            <h2 id="detail-description-title">상세 안내</h2>
            <p className="detail-description">{match.description?.trim() || '등록된 상세 안내가 없어요.'}</p>
          </section>
          <section className="detail-section detail-guide" aria-labelledby="detail-guide-title">
            <h2 id="detail-guide-title">참여 전 확인해 주세요</h2>
            <p>매치 일정과 실력 수준을 확인해 주세요.</p>
            <p>준비물과 모임 안내는 매치 상세 내용을 참고해 주세요.</p>
            <p>서로를 배려하며 즐겁게 운동해요.</p>
          </section>
        </div>
        <aside className="detail-sidebar" aria-label="모집 현황">
          <section className="detail-recruitment">
            <div className="detail-capacity"><span>모집 현황</span><strong>{current ?? '—'}<small> / {maximum ?? '—'}명</small></strong></div>
            {current !== null && maximum !== null && <progress className={closed ? 'is-closed' : remaining <= 1 ? 'is-last' : undefined} value={progress} max="100" aria-label="모집 인원 비율" />}
            <p className="detail-recruitment-note">{match.status === 'CLOSED' ? '모집이 마감된 매치예요.' : remaining === null ? '모집 인원을 확인할 수 없어요.' : remaining === 0 ? '모집 정원이 찼어요.' : `${remaining}명이 더 함께할 수 있어요.`}</p>
            <div className="detail-cta">
              <button type="button" className={`detail-primary-button ${match.isOwner || match.isParticipant ? 'is-danger' : 'is-join'}`} disabled={preview || pending !== null || (match.isOwner !== true && match.isParticipant !== true && (match.status !== 'RECRUITING' || remaining === 0))} onClick={match.isOwner === true ? () => performAction('delete') : match.isParticipant === true ? handleLeave : () => performAction('join')}>{pending === 'join' ? '참가 신청 중…' : actionLabel}</button>
              {match.isOwner === true && !preview && pending === null && <Link className="match-edit-link" to={`/matches/${match.matchId}/edit`}>매치 수정하기</Link>}
            </div>
            <WaitlistActions match={match} preview={preview} pending={pending} busyRef={busy}
              onPendingChange={setPending} onRefresh={onRefresh} onLogin={login} />
            {notice && <p className="detail-deposit-note" role="status">{notice}</p>}
            {actionError && <div className="detail-action-error" role="alert"><p className="match-error">{actionError}</p><button type="button" disabled={pending !== null} onClick={onRefresh}>새로고침</button></div>}
            <p className="detail-action-note">{match.isOwner === true ? '이 매치의 생성자예요.' : match.isParticipant === true ? '현재 이 매치에 참여 중이에요.' : '매치 일정과 모집 조건을 확인 후 신청해 주세요.'}</p>
            {match.isOwner !== true && <p className="detail-deposit-note">{match.isParticipant === true
              ? `시작 전에 탈퇴하면 보증 포인트 ${DEPOSIT_POINTS}점을 돌려받아요.`
              : `참가 신청 시 보증 포인트 ${DEPOSIT_POINTS}점이 차감돼요. 정상 출석, 시작 전 취소, 매치 취소 때는 돌려받고 노쇼하면 돌려받지 못해요.`}</p>}
          </section>
        </aside>
      </div>
      {selectedProfileId !== null && <ProfileModal profileId={selectedProfileId} onClose={() => setSelectedProfileId(null)} />}
    </>
  );
}
