import DistrictSelect from '../../../components/common/DistrictSelect';
import Footer from '../../../components/layout/Footer';
import Header from '../../../components/layout/Header';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../../api/axios';
import { sports } from '../data/signUpOptions';
import visibilityOff from '../assets/visibility.svg';
import visibilityOn from '../assets/login/visibility.svg';
import chevron from '../assets/chevron.svg';
import '../css/signup.css';

const SignUpPage = () => {
  const moveUrl = useNavigate();
  // [USR-01] 가입 입력값. passwordConfirm은 화면 확인용이며 서버로 보내지 않는다.
  const [form, setForm] = useState({ email: '', password: '', passwordConfirm: '', nickname: '', gender: '', district: '', sportTypes: [] });
  // [USR-01] 필드별 검증/중복 오류. form은 요청 실패 등 공통 오류를 표시한다.
  const [errors, setErrors] = useState({});
  // [USR-01] 비밀번호 표시 여부. 확인 입력란은 항상 마스킹한다.
  const [showPassword, setShowPassword] = useState(false);
  // [USR-01] 요청 중 입력과 제출 버튼을 비활성화한다.
  const [pending, setPending] = useState(false);
  // [USR-01] state 반영 전에 들어오는 중복 제출도 차단한다.
  const submitting = useRef(false);

  // [USR-01] 수업 방식: 입력 name과 같은 form 필드만 갱신한다.
  const keyHandler = (e) => {
    const { name, value } = e.target;
    setForm(previous => ({ ...previous, [name]: value }));
    setErrors(previous => ({ ...previous, [name]: '', ...(name === 'password' ? { passwordConfirm: '' } : {}), form: '' }));
  };

  // [USR-01] 복수 선택 종목은 백엔드 SportType enum 문자열 배열로 관리한다.
  const sportHandler = (e) => {
    const { value, checked } = e.target;
    setForm(previous => ({ ...previous, sportTypes: checked ? [...previous.sportTypes, value] : previous.sportTypes.filter(sport => sport !== value) }));
  };

  // [USR-01] 프론트 검증 기준은 UserSignUpRequestDto와 맞춘다. 최종 검증은 서버에서 수행한다.
  const signUpHandler = (e) => {
    e.preventDefault();
    if (submitting.current) return;
    const nextErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) || form.email.trim().length > 50) nextErrors.email = '50자 이내의 올바른 이메일을 입력해주세요.';
    if (!form.password.trim() || form.password.length < 8 || form.password.length > 20) nextErrors.password = '비밀번호는 8~20자로 입력해주세요.';
    if (!form.passwordConfirm || form.password !== form.passwordConfirm) nextErrors.passwordConfirm = '비밀번호가 일치하지 않아요.';
    if (!form.nickname.trim() || form.nickname.trim().length > 50) nextErrors.nickname = '닉네임은 1~50자로 입력해주세요.';
    if (!form.gender) nextErrors.gender = '성별을 선택해주세요.';
    if (!form.district) nextErrors.district = '주 활동 자치구를 선택해주세요.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      e.currentTarget.elements.namedItem(Object.keys(nextErrors)[0])?.focus();
      return;
    }
    // 비밀번호 원문은 trim하거나 로그에 출력하지 않는다. 이름(name) 대신 실제 DTO의 nickname을 사용한다.
    const data = { email: form.email.trim(), password: form.password, nickname: form.nickname.trim(), gender: form.gender, district: form.district, sportTypes: form.sportTypes };
    saveUser(data);
  };

  // [USR-01] POST /api/users → 201이면 /login으로 이동한다.
  // 담당자는 API 명세가 바뀌면 이 주소/요청 객체/오류 코드 분기를 수정한다.
  // 이메일·닉네임 중복 확인은 별도 API 없이 가입 요청의 409 응답으로 처리한다.
  const saveUser = (data) => {
    submitting.current = true;
    setPending(true);
    return api.post('/api/users', data)
      .then(response => {
        if (response.status !== 201) throw new Error('회원가입 응답을 확인할 수 없어요.');
        moveUrl('/login', { replace: true, state: { signUpComplete: true } });
      })
      .catch(error => {
        const body = error.response?.data;
        const message = typeof body?.message === 'string' ? body.message : '';
        if (body?.code === 'DUPLICATE_EMAIL') setErrors({ email: message || '이미 가입된 이메일이에요.' });
        else if (body?.code === 'DUPLICATE_NICKNAME') setErrors({ nickname: message || '이미 사용 중인 닉네임이에요.' });
        else setErrors({ form: message || (error.response?.status === 400 ? '입력 정보를 확인해주세요.' : '회원가입을 완료하지 못했어요. 잠시 후 다시 시도해주세요.') });
      })
      .finally(() => {
        submitting.current = false;
        setPending(false);
      });
  };

  const fields = {
    email: { label: '이메일', placeholder: 'example@sporty.com', type: 'email', autoComplete: 'email', maxLength: 50 },
    password: { label: '비밀번호', placeholder: '8~20자로 입력해주세요', type: showPassword ? 'text' : 'password', autoComplete: 'new-password', maxLength: 20 },
    passwordConfirm: { label: '비밀번호 확인', placeholder: '비밀번호를 한 번 더 입력해주세요', type: 'password', autoComplete: 'new-password', maxLength: 20 },
    nickname: { label: '활동 닉네임', placeholder: '예: 성수동매치', type: 'text', autoComplete: 'nickname', maxLength: 50 },
  };
  const textField = name => {
    const field = fields[name];
    return <div className={`signup-field signup-field-${name}`} key={name}>
      <label htmlFor={`signup-${name}`}>{field.label} <span className="signup-required" aria-hidden="true">*</span></label>
      <div className="signup-input-wrap">
        <input id={`signup-${name}`} name={name} type={field.type} autoComplete={field.autoComplete} placeholder={field.placeholder} value={form[name]} onChange={keyHandler} maxLength={field.maxLength} required aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `signup-${name}-error` : undefined} />
        {name === 'password' && <button className="signup-visibility" type="button" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} onClick={() => setShowPassword(previous => !previous)}><img src={showPassword ? visibilityOn : visibilityOff} alt="" /></button>}
      </div>
      {errors[name] && <p className="signup-error" id={`signup-${name}-error`} role="alert">{errors[name]}</p>}
      {name === 'nickname' && <p className="signup-help">매치에서 함께 운동할 사람에게 보여요.</p>}
    </div>;
  };

  // 왼쪽 단계 표시 전용 값이다. 제출 검증은 signUpHandler가 맡는다.
  const steps = [
    ['계정', Boolean(form.email.trim() && form.password && form.password === form.passwordConfirm)],
    ['프로필', Boolean(form.nickname.trim() && form.gender && form.district)],
    ['선호 종목', form.sportTypes.length > 0],
  ];

  return (
    <div className="signup-page">
      <Header />
      <main className="signup-main">
        <aside className="signup-rail">
          <div>
            <h1 id="signup-title">회원가입</h1>
            <p>세 단계만 채우면 매치에 참가할 수 있어요.</p>
            <ol aria-label="가입 단계">{steps.map(([label, done], index) => <li key={label} className={done ? 'is-done' : undefined}>
              <span aria-hidden="true">{index + 1}</span>{label}{done && <small>완료</small>}
            </li>)}</ol>
          </div>
        </aside>
        <section className="signup-card" aria-labelledby="signup-title">
          <form onSubmit={signUpHandler} noValidate aria-busy={pending}>
            <fieldset className="signup-fields" disabled={pending}>
              <legend className="signup-sr-only">회원가입 정보</legend>
              <fieldset className="signup-step">
                <legend><span aria-hidden="true">1</span>계정</legend>
                {['email', 'password', 'passwordConfirm'].map(textField)}
              </fieldset>
              <fieldset className="signup-step">
                <legend><span aria-hidden="true">2</span>프로필</legend>
                {textField('nickname')}
                {/* [USR-01] Figma에 없지만 현재 가입 DTO에서 필수인 gender를 선택한다. */}
                <div className="signup-field">
                  <label htmlFor="signup-gender">성별 <span className="signup-required" aria-hidden="true">*</span></label>
                  <div className="signup-select-wrap"><select id="signup-gender" name="gender" value={form.gender} onChange={keyHandler} required aria-invalid={Boolean(errors.gender)} aria-describedby={errors.gender ? 'signup-gender-error' : undefined}><option value="">성별 선택</option><option value="MALE">남성</option><option value="FEMALE">여성</option></select><img src={chevron} alt="" /></div>
                  {errors.gender && <p id="signup-gender-error" className="signup-error" role="alert">{errors.gender}</p>}
                </div>
                <div className="signup-field">
                  <label htmlFor="signup-district">주 활동 자치구 <span className="signup-required" aria-hidden="true">*</span></label>
                  <div className="signup-region">
                    <div className="signup-select-wrap"><select aria-label="시/도" value="SEOUL" disabled><option value="SEOUL">서울특별시</option></select><img src={chevron} alt="" /></div>
                    <div className="signup-select-wrap"><DistrictSelect id="signup-district" name="district" value={form.district} onChange={keyHandler} required aria-invalid={Boolean(errors.district)} aria-describedby={errors.district ? 'signup-district-error' : undefined} /><img src={chevron} alt="" /></div>
                  </div>
                  {errors.district && <p id="signup-district-error" className="signup-error" role="alert">{errors.district}</p>}
                  <p className="signup-help">주로 운동하는 서울시 자치구를 선택해주세요.</p>
                </div>
              </fieldset>
              <fieldset className="signup-step">
                <legend><span aria-hidden="true">3</span>선호 종목 <small>선택 · 복수 선택 가능</small></legend>
                {/* [USR-01] 서버 enum에 없는 '기타' 대신 실제 지원 종목을 표시한다. */}
                <div className="signup-sport-grid">{sports.map(([value, label]) => <label key={value}><input type="checkbox" name="sportTypes" value={value} checked={form.sportTypes.includes(value)} onChange={sportHandler} />{label}</label>)}</div>
              </fieldset>
              {errors.form && <p className="signup-error signup-form-error" role="alert">{errors.form}</p>}
              <button type="submit" className="signup-submit">{pending ? '가입 처리 중...' : '회원가입'}</button>
            </fieldset>
            <p className="signup-login">이미 계정이 있나요? <Link to="/login">로그인</Link></p>
          </form>
        </section>
      </main>
      {/* 약관/고객지원 라우트 확정 후 담당자가 아래 문구를 Link로 교체한다. */}
      <Footer />
    </div>
  );
};

export default SignUpPage;
