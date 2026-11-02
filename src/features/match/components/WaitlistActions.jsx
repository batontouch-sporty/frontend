import { useEffect, useRef, useState } from 'react';
import { cancelWaitlist, registerWaitlist } from '../api/waitlistApi';

// The API has no waitlist GET: only a registration response can confirm a queue position.
export default function WaitlistActions({ match, preview, pending, busyRef, onPendingChange, onRefresh, onLogin }) {
  const [ticket, setTicket] = useState(null);
  const [notice, setNotice] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  if (preview || match.isOwner || match.isParticipant
    || !['RECRUITING', 'CLOSED', 'IN_PROGRESS'].includes(match.status)) return null;

  const canRegister = () => match.status === 'CLOSED'
    && Number.isInteger(match.currentParticipantCount) && Number.isInteger(match.maxParticipant)
    && match.currentParticipantCount >= match.maxParticipant
    && Date.parse(`${match.startAt}+09:00`) > Date.now();

  async function act(action) {
    if (busyRef.current || (action === 'register' && !canRegister())) return;
    if (!localStorage.getItem('at')) {
      onLogin('대기 신청·취소를 하려면 로그인이 필요해요.');
      return;
    }
    if (action === 'cancel' && !window.confirm('대기 신청을 취소할까요?')) return;
    busyRef.current = true;
    onPendingChange(`waitlist-${action}`);
    setNotice('');
    try {
      if (action === 'register') {
        const registration = await registerWaitlist(match.matchId);
        if (!alive.current) return;
        setTicket({ position: registration.position });
        setNotice('대기 신청이 완료됐어요. 빈자리가 생겨 참가가 확정되면 알림함으로 알려드려요.');
      } else {
        await cancelWaitlist(match.matchId);
        if (!alive.current) return;
        window.alert('대기 신청을 취소했어요.');
        onRefresh();
      }
    } catch (error) {
      if (!alive.current) return;
      const status = error.response?.status;
      const code = error.response?.data?.code;
      if (status === 401) {
        localStorage.removeItem('at');
        onLogin('인증이 만료됐어요. 다시 로그인해 주세요.');
      } else if (code === 'WAITLIST_ALREADY_JOINED') {
        setTicket({ position: null });
        setNotice('이미 대기 신청한 매치예요. 신청을 취소할 수 있어요.');
      } else if (['MATCH_ALREADY_JOINED', 'MATCH_OWNER_CANNOT_WAIT', 'WAITLIST_NOT_FOUND', 'MATCH_NOT_FULL', 'WAITLIST_CANCEL_NOT_ALLOWED'].includes(code)
        || status === 404) {
        window.alert(code === 'WAITLIST_NOT_FOUND'
          ? '대기 기록이 없어요. 이미 참가가 확정됐을 수 있어 현재 상태를 다시 확인할게요.'
          : '모임 또는 참가 상태가 바뀌었어요. 현재 상태를 다시 확인할게요.');
        onRefresh();
      } else {
        const messages = {
          MATCH_GENDER_NOT_ALLOWED: '이 매치의 성별 조건에 맞지 않아 대기 신청할 수 없어요.',
          USER_NOT_ACTIVE: '현재 활동 가능한 회원만 대기 신청할 수 있어요.',
        };
        setNotice(messages[code] || (status === 503
          ? '잠시 연결할 수 없어요. 대기 신청·취소 결과를 확인한 뒤 다시 시도해 주세요.'
          : '처리 결과를 확인하지 못했어요. 참가 상태·알림함을 확인하거나 대기 취소를 이용해 주세요.'));
      }
    } finally {
      if (alive.current) {
        busyRef.current = false;
        onPendingChange(null);
      }
    }
  }

  return <section className="detail-waitlist" aria-label="참가 대기">
    <h3>참가 대기</h3>
    {ticket?.position && <p>신청 당시 대기 순번: <strong>{ticket.position}번</strong></p>}
    {ticket?.position && <p className="detail-action-note">현재 순번은 취소·승급에 따라 달라질 수 있어요.</p>}
    {notice && <p role="status">{notice}</p>}
    {canRegister() && !ticket && <button type="button" className="detail-primary-button"
      disabled={pending !== null} onClick={() => act('register')}>
      {pending === 'waitlist-register' ? '대기 신청 중…' : '대기 신청하기'}
    </button>}
    {!ticket && <p className="detail-action-note">이전에 대기 신청했다면 아래에서 취소할 수 있어요.</p>}
    <button type="button" className="detail-waitlist-cancel" disabled={pending !== null} onClick={() => act('cancel')}>
      {pending === 'waitlist-cancel' ? '대기 취소 중…' : '대기 취소하기'}
    </button>
  </section>;
}
