import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { getProfile } from '../api/profileApi';
import { districts, sports } from '../../auth/data/signUpOptions';
import closeIcon from '../assets/close.svg';
import locationIcon from '../assets/location.svg';
import '../css/profileModal.css';

const districtLabels = Object.fromEntries(districts);
const sportLabels = Object.fromEntries(sports);
const sportEmoji = { SOCCER: '⚽', FUTSAL: '⚽', BASKETBALL: '🏀', BASEBALL: '⚾', TENNIS: '🎾', BADMINTON: '🏸', TABLE_TENNIS: '🏓', VOLLEYBALL: '🏐', SWIMMING: '🏊', RUNNING: '🏃' };

// [PR-02] 공통 사용법: 부모가 선택한 profileId를 전달하고 onClose에서 선택값을 null로 바꾼다.
// ID가 바뀌면 이전 프로필/오류 상태를 재사용하지 않고 새로 조회한다.
export default function ProfileModal({ profileId, onClose }) {
  if (profileId == null) return null;
  return <ProfileDialog key={profileId} profileId={profileId} onClose={onClose} />;
}

function ProfileDialog({ profileId, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const titleId = useId();
  const dialogRef = useRef(null);
  // [PR-02] 조회 결과와 화면 상태: loading / ready / login / not-found / error.
  const [result, setResult] = useState({ status: 'loading', profile: null });
  // [PR-02] 서버/네트워크 오류 후 '다시 시도'를 누르면 조회 effect를 다시 실행한다.
  const [retryCount, setRetryCount] = useState(0);
  // [PR-02] 이미지가 없거나 로딩 실패하면 닉네임 첫 글자를 대신 표시한다.
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    // native dialog가 배경 클릭/키보드 접근을 차단하고 모달 내부에 포커스를 유지한다.
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  useEffect(() => {
    // [PR-02] 토큰이 없으면 API를 호출하지 않고 로그인 안내를 표시한다.
    if (!localStorage.getItem('at')) {
      setResult({ status: 'login', profile: null });
      return;
    }
    const controller = new AbortController();
    let active = true;
    setResult({ status: 'loading', profile: null });
    getProfile(profileId, controller.signal)
      .then(profile => {
        if (!profile || profile.id == null) throw new Error('프로필 응답 누락');
        if (active) setResult({ status: 'ready', profile });
      })
      .catch(error => {
        if (!active) return;
        // [PR-02] 저장된 토큰이 만료된 경우도 로그인 안내로 전환한다.
        const status = error.response?.status;
        setResult({ status: status === 401 ? 'login' : status === 404 ? 'not-found' : 'error', profile: null });
      });
    // 닫거나 다른 사람을 선택했을 때 늦게 도착한 응답을 화면에 반영하지 않는다.
    return () => { active = false; controller.abort(); };
  }, [profileId, retryCount]);

  // [PR-02 → USR-02] 사용자가 로그인 버튼을 누를 때만 이동하고 현재 화면의 복귀 경로를 전달한다.
  const loginHandler = () => {
    onClose();
    navigate('/login', { state: { from: location.pathname + location.search + location.hash, fromState: location.state } });
  };

  const { status, profile } = result;
  const preferenceSports = Array.isArray(profile?.preferenceSports) ? profile.preferenceSports : [];

  return createPortal(
    <dialog ref={dialogRef} className="profile-modal" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="profile-modal-panel">
        <header className="profile-modal-header">
          <h2 id={titleId}>프로필 상세 정보</h2>
          <button type="button" className="profile-modal-close" aria-label="프로필 모달 닫기" onClick={onClose}><img src={closeIcon} alt="" /></button>
        </header>
        <div className="profile-modal-body" aria-busy={status === 'loading'}>
          {status === 'loading' && <div className="profile-modal-feedback" role="status"><p>프로필 정보를 불러오는 중입니다.</p></div>}
          {status === 'login' && <div className="profile-modal-feedback" role="status"><h3>로그인이 필요합니다</h3><p>프로필 조회는 로그인이 필요합니다.</p><p className="profile-modal-muted">로그인 후 회원의 프로필과 선호 종목을 확인해 보세요.</p></div>}
          {status === 'not-found' && <div className="profile-modal-feedback" role="alert"><h3>프로필을 찾을 수 없습니다</h3><p>존재하지 않거나 삭제된 프로필입니다.</p></div>}
          {status === 'error' && <div className="profile-modal-feedback" role="alert"><h3>프로필을 불러오지 못했습니다</h3><p>연결 상태를 확인하고 다시 시도해 주세요.</p><button type="button" className="profile-modal-primary" onClick={() => setRetryCount(count => count + 1)}>다시 시도</button></div>}
          {status === 'ready' && <>
            <section className="profile-modal-summary" aria-label="회원 정보">
              <div className="profile-modal-avatar" aria-hidden="true">
                {profile.imageUrl && !imageFailed
                  ? <img src={profile.imageUrl} alt="" onError={() => setImageFailed(true)} />
                  : (profile.nickname?.trim().slice(0, 1) || '?')}
              </div>
              <div className="profile-modal-identity">
                <h3>{profile.nickname || '닉네임 정보 없음'}</h3>
                <p className="profile-modal-region"><img src={locationIcon} alt="" />{districtLabels[profile.district] ? `서울 ${districtLabels[profile.district]}` : '자치구 정보 없음'}</p>
              </div>
            </section>
            <section className="profile-modal-preferences" aria-label="선호 운동 종목">
              {/* [PR-02] API에는 숙련도·포지션·접속 여부·이메일이 없으므로 예시 정보를 표시하지 않는다. */}
              <h3>선호 운동 종목</h3>
              <div className="profile-modal-sports">
                {preferenceSports.length > 0 ? <ul>{preferenceSports.map(sport => <li key={sport}><span aria-hidden="true">{sportEmoji[sport] || ''}</span>{sportLabels[sport] || sport}</li>)}</ul>
                  : <p className="profile-modal-muted">등록된 선호 운동 종목이 없습니다.</p>}
              </div>
            </section>
          </>}
        </div>
        <footer className="profile-modal-footer">
          <button type="button" className="profile-modal-secondary" onClick={onClose}>닫기</button>
          {status === 'login' && <button type="button" className="profile-modal-primary" onClick={loginHandler}>로그인하기</button>}
        </footer>
      </div>
    </dialog>, document.body,
  );
}
