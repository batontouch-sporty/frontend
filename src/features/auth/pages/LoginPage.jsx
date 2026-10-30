import Footer from '../../../components/layout/Footer';
import Header from '../../../components/layout/Header';
import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../../../api/axios';
import ball from '../assets/login/ball.svg';
import emailIcon from '../assets/login/email.svg';
import info from '../assets/login/info.svg';
import lock from '../assets/login/lock.svg';
import visibility from '../assets/login/visibility.svg';
import shield from '../assets/login/shield.svg';
import submit from '../assets/login/submit.svg';
import signup from '../assets/login/signup.svg';
import '../css/login.css';

const LoginPage = () => {
  const moveUrl = useNavigate();
  const location = useLocation();
  // [USR-02] 로그인 요청 본문. 비밀번호는 URL/로그/로컬 저장소에 기록하지 않는다.
  const [form, setForm] = useState({ email: '', password: '' });
  // [USR-02] email/password는 필드 오류, form은 인증 실패/네트워크 오류 안내다.
  const [errors, setErrors] = useState({});
  // [USR-02] 비밀번호 보기 버튼의 표시 상태만 관리한다.
  const [showPassword, setShowPassword] = useState(false);
  // [USR-02] 요청 중 입력/버튼 비활성화 및 처리 중 문구에 사용한다.
  const [pending, setPending] = useState(false);
  // [USR-02] state 반영 전 연속 제출도 차단하는 잠금이다.
  const submitting = useRef(false);

  // [USR-02] 수업 방식: input의 name으로 해당 form 값만 갱신한다.
  const keyHandler = (e) => {
    const { name, value } = e.target;
    setForm(previous => ({ ...previous, [name]: value }));
    setErrors(previous => ({ ...previous, [name]: '', form: '' }));
  };

  // [USR-02] LoginRequestDto 기준으로 검증 후 login(data)에 요청을 위임한다.
  const loginHandler = (e) => {
    e.preventDefault();
    if (submitting.current) return;
    const nextErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) || form.email.trim().length > 50) nextErrors.email = '50자 이내의 올바른 이메일을 입력해주세요.';
    if (!form.password.trim() || form.password.length < 8 || form.password.length > 20) nextErrors.password = '비밀번호를 8~20자로 입력해주세요.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      e.currentTarget.elements.namedItem(Object.keys(nextErrors)[0])?.focus();
      return;
    }
    login({ email: form.email.trim(), password: form.password });
  };

  // [USR-02] 인증을 요구한 페이지로 복귀한다. 외부 주소/인증 화면은 허용하지 않는다.
  // 보호 페이지 담당자는 { from: 내부 경로, fromState: 기존 location.state }를 전달하면 된다.
  const getReturnPath = () => {
    const candidate = location.state?.from || new URLSearchParams(location.search).get('redirect');
    if (typeof candidate !== 'string' || !candidate.startsWith('/') || candidate.startsWith('//') || /[\\\s]/.test(candidate)) return '/';
    try {
      const target = new URL(candidate, window.location.origin);
      if (target.origin !== window.location.origin || /^\/(login|signup)(\/|$)/.test(target.pathname)) return '/';
      return target.pathname + target.search + target.hash;
    } catch {
      return '/';
    }
  };

  // [USR-02] 실제 API는 POST /api/auth/login, 응답은 LoginResponseDto의 JSON 본문이다.
  // 공통 axios가 Bearer를 붙이므로 at에는 접두사 없이 accessToken만 저장한다.
  const login = (data) => {
    submitting.current = true;
    setPending(true);
    return api.post('/api/auth/login', data)
      .then(response => {
        const { accessToken, refreshToken, userId, tokenType } = response.data || {};
        if (response.status !== 200 || typeof accessToken !== 'string' || !accessToken.trim() || typeof refreshToken !== 'string' || !refreshToken.trim() || !Number.isInteger(userId) || userId <= 0 || tokenType !== 'Bearer') {
          throw new Error('로그인 응답 형식을 확인해주세요.');
        }
        // 기존 인증 코드와 동일한 키를 사용한다. 재발급 API 연결은 별도 담당 범위다.
        try {
          localStorage.setItem('at', accessToken);
          localStorage.setItem('rt', refreshToken);
          localStorage.setItem('userId', String(userId));
        } catch {
          localStorage.removeItem('at');
          localStorage.removeItem('rt');
          localStorage.removeItem('userId');
          throw new Error('로그인 정보를 저장하지 못했습니다. 브라우저 저장소 설정을 확인해주세요.');
        }
        const destination = getReturnPath();
        moveUrl(destination, { replace: true, state: destination !== '/' && location.state?.from ? location.state?.fromState : undefined });
      })
      .catch(error => {
        const message = error.response?.data?.message;
        if (error.response?.status === 401) setErrors({ form: '이메일 또는 비밀번호를 확인해주세요.' });
        else if (typeof message === 'string' && message.trim()) setErrors({ form: message });
        else if (error.response?.status === 400) setErrors({ form: '입력한 이메일과 비밀번호 형식을 확인해주세요.' });
        else if (error.request || error.response) setErrors({ form: '로그인하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.' });
        else setErrors({ form: error.message || '로그인하지 못했습니다. 잠시 후 다시 시도해주세요.' });
      })
      .finally(() => {
        submitting.current = false;
        setPending(false);
      });
  };

  return (
    <div className="login-page">
      <Header />
      <main className="login-main">
        {/* Figma 카드 구조를 유지하고 DB 컬럼/해시 설명은 사용자 화면에서 제외한다. */}
        <section className="login-card" aria-labelledby="login-title">
          <div className="login-body">
            <div className="login-intro"><span className="login-symbol"><img src={ball} alt="" /></span><strong>Sporty</strong><h1 id="login-title">로그인</h1><p>생활체육 매칭 플랫폼 Sporty에 오신 것을 환영합니다.</p></div>
            {/* [USR-01 → USR-02] 회원가입 페이지가 전달하는 완료 상태를 안내한다. */}
            {location.state?.signUpComplete && <p className="login-success" role="status">회원가입이 완료되었습니다. 로그인해주세요.</p>}
            <form onSubmit={loginHandler} noValidate aria-busy={pending}>
              <fieldset className="login-fields" disabled={pending}>
                <legend className="login-sr-only">로그인 정보</legend>
                <div className="login-field">
                  <label htmlFor="login-email">이메일 <span aria-hidden="true">*</span></label>
                  <div className="login-input-wrap"><img src={emailIcon} alt="" className="login-input-icon" /><input id="login-email" type="email" name="email" placeholder="이메일 주소를 입력하세요" autoComplete="username" maxLength={50} value={form.email} onChange={keyHandler} required aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'login-email-error' : 'login-email-help'} /></div>
                  {errors.email && <p id="login-email-error" className="login-error" role="alert">{errors.email}</p>}
                  <p id="login-email-help" className="login-help"><img src={info} alt="" />가입한 계정의 이메일을 입력해주세요.</p>
                </div>
                <div className="login-field">
                  <label htmlFor="login-password">비밀번호 <span aria-hidden="true">*</span></label>
                  <div className="login-input-wrap"><img src={lock} alt="" className="login-input-icon" /><input id="login-password" type={showPassword ? 'text' : 'password'} name="password" placeholder="비밀번호를 입력하세요" autoComplete="current-password" maxLength={20} value={form.password} onChange={keyHandler} required aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'login-password-error' : 'login-password-help'} /><button type="button" className="login-visibility" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} aria-pressed={showPassword} onClick={() => setShowPassword(previous => !previous)}><img src={visibility} alt="" /></button></div>
                  {errors.password && <p id="login-password-error" className="login-error" role="alert">{errors.password}</p>}
                  <p id="login-password-help" className="login-help"><img src={shield} alt="" />가입 시 설정한 8~20자의 비밀번호를 입력해주세요.</p>
                </div>
                <div className="login-feedback" aria-live="polite">{errors.form && <p className="login-error" role="alert">{errors.form}</p>}</div>
                <button className="login-submit" type="submit">{pending ? '로그인 중...' : '로그인'}<img src={submit} alt="" /></button>
              </fieldset>
            </form>
          </div>
          <div className="login-card-footer"><span>아직 회원이 아니신가요?</span><Link to="/signup">회원가입<img src={signup} alt="" /></Link></div>
        </section>
      </main>
      {/* 약관/고객센터 담당자가 실제 라우트 확정 후 Link로 연결한다. */}
      <Footer />
    </div>
  );
};

export default LoginPage;
