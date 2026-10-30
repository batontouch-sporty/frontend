# [USR-02] 로그인

1. `/login`의 `pages/LoginPage.jsx`에서 `form`과 `keyHandler`로 이메일/비밀번호를 관리합니다. `loginHandler`가 LoginRequestDto 기준으로 이메일 최대 50자, 비밀번호 8~20자를 확인하고 `login(data)`를 호출합니다.
2. `login`은 수업 방식의 `api.post(...).then().catch().finally()` 구조입니다. 실제 API는 `POST /api/auth/login`, 요청은 `{ email, password }`입니다. 비밀번호는 URL·로그·저장소에 기록하지 않습니다.
3. 서버의 200 응답 본문 `{ userId, accessToken, refreshToken, tokenType, expiresIn }`에서 토큰을 읽습니다. 필수 값 확인 후 localStorage의 `at`, `rt`, `userId`에 저장합니다. `at`에는 토큰 원문만 저장하고 공통 axios 인터셉터가 요청 헤더에 Bearer를 붙입니다. 자동 재발급 기능은 이 페이지에서 구현하지 않습니다.
4. 성공 시 `location.state.from`, 없으면 URL의 `redirect`로 복귀합니다. 외부 주소·로그인/회원가입 경로는 `/`로 대체합니다. 보호 페이지 담당자가 `fromState`에 이전 location.state를 전달하면 복귀 시 함께 복원합니다. 현재 MatchCreatePage는 from만 전달하므로 AI 초안 보존은 해당 담당자의 연결이 필요합니다.
5. `errors`에 필드 오류 또는 공통 인증 오류를 저장합니다. 401은 이메일/비밀번호 확인 안내, 400은 형식 안내, 나머지는 서버 메시지나 연결 오류를 표시합니다. `pending`은 입력/버튼을 잠그고 `submitting` ref는 연속 제출을 막습니다. `showPassword`는 표시 전환용입니다.
6. 회원가입에서 `state.signUpComplete`가 오면 완료 안내를 보여줍니다. `/signup` 링크는 연결되어 있지만 이 브랜치의 회원가입 라우트는 기존 안내 문구입니다. 회원가입 브랜치 병합 시 AppRoutes의 두 화면 import/라우트를 모두 유지하세요.
7. 스타일은 `css/login.css`, 원본 Figma 아이콘은 `assets/login/`입니다. Figma 69:689의 카드 배치를 사용하고 COLOR GUID2.MD의 흰색/연회색/파랑과 약한 그림자를 적용했습니다. 그라데이션 강조선 및 개발용 DB 메타데이터는 제외했습니다. 약관/고객센터는 경로 확정 후 푸터 문구를 Link로 교체합니다.

실제 서버 로그인은 서버·Redis가 실행되는 환경에서 확인해야 합니다. 자동 테스트는 API를 모킹하며 실제 계정으로 로그인하지 않습니다.
