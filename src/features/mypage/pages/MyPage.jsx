import DistrictSelect from '../../../components/common/DistrictSelect';
import Footer from '../../../components/layout/Footer';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import Header from '../../../components/layout/Header';
import LogoutButton from '../../auth/components/LogoutButton';
import { districts, sports } from '../../auth/data/signUpOptions';
import { previewData } from '../data/previewData';
import { loadMyPage as fetchMyPage, saveProfile as updateProfile, loadMyMatches as fetchMyMatches } from '../api/myPageApi';
import WithdrawalButton from '../components/WithdrawalButton';
import MyMatches from '../components/MyMatches';
import '../css/mypage.css';

const copyProfile = profile => ({ ...profile, preferenceSports: [...profile.preferenceSports] });

// [USR-06 / PR-01]
export default function MyPage({ preview = false, loadMyPage = fetchMyPage, saveProfile = updateProfile, loadMyMatches = fetchMyMatches }) {
  const location = useLocation();
  // [마이페이지] 탭 선택값. 첫 화면은 내 일정이고, 탭 전환 시 수정 중인 폼은 유지한다.
  const [activeTab, setActiveTab] = useState('matches');
  // [회원정보 조회] 수정 폼과 분리된 읽기 전용 회원 정보 및 마지막 저장된 프로필이다.
  const [saved, setSaved] = useState(null);
  // [프로필 수정] 입력 중인 값
  const [form, setForm] = useState(null);
  // [조회/수정] 로딩, 저장 중 입력 차단과 실패/완료 메시지에 사용한다.
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // [조회] 실패 시 다시 조회하는 버튼과 인증 만료 시 로그인 이동에 사용한다.
  const [retry, setRetry] = useState(0);
  const [loginRequired, setLoginRequired] = useState(false);
  const requireLogin = useCallback(() => setLoginRequired(true), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    if (!preview && !localStorage.getItem('at')) { setLoading(false); return () => controller.abort(); }
    Promise.resolve().then(() => {
      if (preview) return previewData;
      if (!loadMyPage) throw new Error('회원정보 조회 기능을 준비 중이에요.');
      return loadMyPage({ signal: controller.signal });
    }).then(data => {
      if (controller.signal.aborted) return;
      setSaved({ user: data.user, profile: copyProfile(data.profile) });
      setForm(copyProfile(data.profile));
    }).catch(requestError => {
      if (controller.signal.aborted) return;
      if (requestError.response?.status === 401) setLoginRequired(true);
      else setError('회원정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [preview, loadMyPage, retry]);

  // [PR-01 프로필 수정] 수업 코드와 같이 name/value로 해당 입력값만 변경한다.
  const keyHandler = e => {
    const { name, value } = e.target;
    setForm(previous => ({ ...previous, [name]: value }));
    setMessage('');
  };
  const sportHandler = e => {
    const { value, checked } = e.target;
    setForm(previous => ({ ...previous, preferenceSports: checked
      ? [...previous.preferenceSports, value] : previous.preferenceSports.filter(sport => sport !== value) }));
    setMessage('');
  };
  // [PR-01 프로필 수정] 마지막 조회/저장한 값으로 복구한다. 서버 요청은 하지 않는다.
  const cancelHandler = () => {
    setForm(copyProfile(saved.profile)); setError(''); setMessage('변경사항을 취소했어요.');
  };
  const saveHandler = e => {
    e.preventDefault();
    if (!form.nickname.trim() || form.nickname.trim().length > 50) {
      setError('닉네임은 1~50자로 입력해주세요.'); return;
    }
    if (!form.district) { setError('주 활동 자치구를 선택해주세요.'); return; }
    // [PR-01] 수정 가능한 필드만 전달한다. API 함수에서 sportTypes로 변환한다.
    const data = { nickname: form.nickname.trim(), district: form.district,
      preferenceSports: [...form.preferenceSports] };
    setPending(true); setError(''); setMessage('');
    Promise.resolve().then(() => {
      if (preview) return data;
      if (!saveProfile) throw new Error('프로필 저장 기능을 준비 중이에요.');
      return saveProfile(data);
    }).then(profile => {
      setSaved(previous => ({ ...previous, profile: copyProfile(profile) }));
      setForm(copyProfile(profile));
      setMessage(preview ? '미리보기에 반영했어요. 서버에는 저장되지 않아요.' : '프로필 변경사항을 저장했어요.');
    }).catch(requestError => {
      if (requestError.response?.status === 401) setLoginRequired(true);
      else if (requestError.response?.data?.code === 'DUPLICATE_NICKNAME') setError('이미 사용 중인 닉네임이에요.');
      else setError('프로필을 저장하지 못했어요. 입력 내용을 유지했으니 다시 시도해주세요.');
    }).finally(() => setPending(false));
  };

  if (!preview && (loginRequired || !localStorage.getItem('at'))) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  const district = districts.find(([value]) => value === saved?.profile.district)?.[1] || '미설정';
  const favorites = sports.filter(([value]) => saved?.profile.preferenceSports.includes(value)).map(([, label]) => label).join(' · ');
  return <div className="mypage">
    <Header />
    <main>
      {!saved ? <div className="mypage-shell">
        {preview && <p className="mypage-preview">미리보기예요. 변경사항은 서버에 저장되지 않아요.</p>}
        {loading ? <p role="status">회원정보를 불러오는 중이에요.</p> : <div className="mypage-panel mypage-section"><p role="alert" className="mypage-error">{error}</p><button className="mypage-retry" onClick={() => setRetry(value => value + 1)}>다시 시도</button></div>}
      </div> : <>
        <div className="mypage-band">
          <div className="mypage-band-inner">
            <div className="mypage-band-who">
              <h1>{saved.profile.nickname}</h1>
              <p>{district}{favorites && ` · ${favorites}`}</p>
            </div>
            <nav className="mypage-tabs" aria-label="마이페이지 메뉴">
              <button type="button" aria-current={activeTab === 'matches' ? 'page' : undefined} onClick={() => setActiveTab('matches')}>내 일정</button>
              <button type="button" aria-current={activeTab === 'info' ? 'page' : undefined} onClick={() => setActiveTab('info')}>내 정보</button>
            </nav>
          </div>
        </div>
        <div className="mypage-shell">
          {preview && <p className="mypage-preview">미리보기예요. 변경사항은 서버에 저장되지 않아요.</p>}
          {activeTab === 'matches' ? <MyMatches loadMyMatches={preview ? undefined : loadMyMatches} onUnauthorized={requireLogin} /> : <div className="mypage-info">
            <form onSubmit={saveHandler} noValidate aria-busy={pending}>
              <section className="mypage-panel mypage-section" aria-labelledby="profile-heading">
                <h2 id="profile-heading">프로필 수정</h2>
                <fieldset disabled={pending}>
                  <legend className="mypage-sr-only">프로필 입력 정보</legend>
                  <div className="mypage-field"><label htmlFor="mypage-nickname">활동 닉네임 <small>1~50자</small></label><input id="mypage-nickname" name="nickname" value={form.nickname} onChange={keyHandler} maxLength={50} autoComplete="nickname" /><p className="mypage-hint">함께 운동할 사람에게 보여요.</p></div>
                  <fieldset className="mypage-sports"><legend>선호 운동 종목 <small>복수 선택 가능</small></legend><div>{sports.map(([value, label]) => <label key={value} className={form.preferenceSports.includes(value) ? 'is-selected' : ''}><input type="checkbox" value={value} checked={form.preferenceSports.includes(value)} onChange={sportHandler} />{label}</label>)}</div></fieldset>
                  <div className="mypage-field"><label htmlFor="mypage-district">주 활동 자치구</label><div className="mypage-region"><input aria-label="시/도" value="서울특별시" readOnly /><DistrictSelect id="mypage-district" name="district" value={form.district} onChange={keyHandler} /></div></div>
                </fieldset>
                {error && <p className="mypage-error" role="alert">{error}</p>}{message && <p className="mypage-message" role="status">{message}</p>}
                <div className="mypage-actions mypage-profile-actions">
                  <button type="button" className="mypage-cancel" onClick={cancelHandler} disabled={pending}>취소</button>
                  <button type="submit" className="mypage-primary mypage-save" disabled={pending || (!preview && !saveProfile)}>{pending ? '저장 중...' : '변경사항 저장'}</button>
                </div>
              </section>
            </form>
            <aside className="mypage-account-side">
              <section className="mypage-panel mypage-section" aria-labelledby="account-heading"><h2 id="account-heading">회원 정보</h2>
                <dl className="mypage-account"><div><dt>이메일</dt><dd>{saved.user.email}</dd></div><div><dt>성별</dt><dd>{{ MALE: '남성', FEMALE: '여성' }[saved.user.gender] || '미등록'}</dd></div></dl>
              </section>
              <section className="mypage-panel mypage-section" aria-labelledby="session-heading"><h2 id="session-heading">계정 관리</h2>
                <div className="mypage-account-actions">{preview ? <button disabled>로그아웃 (미리보기)</button> : <LogoutButton />}{preview ? <button disabled>회원탈퇴 (미리보기)</button> : <WithdrawalButton />}</div>
              </section>
            </aside>
          </div>}
        </div>
      </>}
    </main>
    <Footer />
  </div>;
}
