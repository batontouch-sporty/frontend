# [USR-03] 공통 로그아웃 버튼

사용할 화면에서 `features/auth/components/LogoutButton.jsx`를 import하고 Router 내부에 `<LogoutButton />`을 배치합니다. 로그인한 사용자에게만 표시하는 조건은 부모 화면에서 관리합니다.

1. `logoutHandler`가 본문 없이 `POST /api/auth/logout`을 호출합니다. 공통 axios(src/api/axios.js)가 localStorage의 at를 인증 헤더에 붙입니다.
2. 204 성공 또는 401 인증 만료 시 `clearSession`이 at/rt/userId만 삭제하고 `/login`으로 이동합니다.
3. 부모가 로그인 여부를 Context/state로 관리한다면 `<LogoutButton onLogout={() => setUser(null)} />`처럼 상태 초기화를 연결합니다. onLogout은 동기 상태 초기화용입니다. localStorage 삭제만으로 다른 컴포넌트의 state가 자동 갱신되지는 않습니다.
4. 500·네트워크 오류·예상 밖 응답에서는 토큰을 유지하고 재시도 안내를 표시합니다. pending state로 요청 중 버튼을 비활성화합니다.
5. 색상/여백은 `css/logout.css`, 요청 주소/상태 코드/토큰 키는 컴포넌트의 핸들러에서 수정합니다. 스타일은 COLOR GUID2.MD 기준입니다.
