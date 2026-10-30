# [USR-01] 회원가입

`/signup` → `pages/SignUpPage.jsx`. Figma `69:901`의 중앙 카드 배치를 사용하며, 색상은 `style/main` 브랜치의 `frontend/COLOR GUID2.MD`를 기준으로 적용했습니다. 스타일은 `css/signup.css`, 원본 Figma 아이콘은 `assets/`, 선택지는 `data/signUpOptions.js`에서 관리합니다.

1. `form`은 이메일·비밀번호·확인 비밀번호·닉네임·성별·자치구·선호 종목을 저장합니다. `keyHandler`는 입력값을, `sportHandler`는 복수 선택 종목을 갱신합니다.
2. `signUpHandler`는 입력값을 확인하고 `saveUser(data)`를 호출합니다. 이메일/닉네임 최대 50자, 비밀번호 8~20자, 성별/자치구 필수를 현재 `UserSignUpRequestDto`에 맞췄습니다. 비밀번호 확인은 화면에서만 사용합니다. 선호 종목은 선택이며 미선택 시 빈 배열을 보냅니다.
3. `saveUser`는 공통 axios의 `api.post('/api/users', data).then().catch().finally()`를 사용합니다. 요청 필드는 `email`, `password`, `nickname`, `gender`, `district`, `sportTypes`입니다. `gender`는 MALE/FEMALE, `district`와 `sportTypes`는 서버 enum 문자열을 보냅니다. 비밀번호를 로그나 로컬 저장소에 기록하지 않습니다.
4. 201 성공 시 `/login`으로 이동하며 `state.signUpComplete = true`를 전달합니다. 로그인 담당자가 필요하면 이 값을 읽어 가입 완료 안내를 표시하면 됩니다. 현재 로그인 페이지는 기존 안내 문구 그대로입니다.
5. `errors`는 필드별 오류와 공통 오류(`form`)를 표시합니다. 서버의 `DUPLICATE_EMAIL`, `DUPLICATE_NICKNAME`은 해당 입력란 아래에 표시합니다. 별도 중복 확인 API는 현재 없어 Figma의 닉네임 중복 확인 버튼을 넣지 않았습니다. 필드 검증 오류 응답 구조가 확정되면 `saveUser.catch`에서 매핑을 추가합니다.
6. `pending`은 요청 중 폼을 잠그고 `submitting` ref는 연속 제출을 차단합니다. `showPassword`는 비밀번호 보기 버튼에만 사용합니다.
7. Figma와 달라진 부분: 가이드 2의 색상/약한 그림자 적용, 개발용 WIREFRAME·DB 메타데이터 제거, DTO 필수 성별 추가, 종목을 실제 지원 enum으로 분리, 선호 종목 선택 사항 표시. 서울만 지원하므로 시/도는 고정합니다.
8. 담당자가 수정할 곳: API/응답 처리 → `saveUser`, 검증/전송 필드 → `signUpHandler`, 입력·배치 → JSX, 색감/반응형 → CSS, enum 선택지 → `signUpOptions.js`. 이용약관/개인정보처리방침/고객지원은 경로 확정 후 푸터 문구를 Link로 교체합니다.

실제 백엔드와의 가입 성공 여부는 서버를 실행한 환경에서 별도 확인해야 합니다. 자동 테스트는 요청/응답을 모킹하며 실제 계정을 생성하지 않습니다.
