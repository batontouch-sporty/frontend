# 공통 화면 요소

- `Header.jsx`: 페이지 상단 로고·시설 검색·회원 메뉴. 비로그인은 로그인/회원가입, 로그인은 마이페이지를 표시한다. 메뉴는 기존 at 저장 여부 기준이며 실제 토큰 검증·재발급은 공통 axios와 서버가 담당한다. 경로 변경·다른 탭의 storage 이벤트·화면 복귀 시 상태를 갱신한다.
- 시설 검색은 기본적으로 `/facilities?query=...`로 이동한다. 기존 매치 목록의 검색 핸들러는 `onFacilitySearch`로 유지한다. 페이지 전용 탐색 메뉴가 있으면 children으로 전달한다.
- `Footer.jsx`: 모든 주요 페이지에서 사용하는 브랜드·저작권·안내 문구. 약관 화면이 구현되면 해당 span을 실제 경로의 Link로 교체한다.
- `../common/DistrictSelect.jsx`: 회원가입, 마이페이지, 매치 생성 시설 검색, 매치 목록 필터, 시설 목록 필터, AI 조건 수정에서 사용한다. 옵션 원본은 `src/constants/districts.js`이며 서울 25개 자치구를 공유한다.
- 기본 `valueType="code"`는 회원 API의 `district`에 GANGNAM 같은 코드를 전달한다. `valueType="name"`은 시설·매치 API의 `region`에 강남구 같은 한글을 전달한다. name/value/onChange/required/disabled/접근성 속성은 페이지가 관리한다. 백엔드 계약은 변경하지 않았다.
- 테마 기준은 `frontend/COLOR GUID2.MD`. 페이지 배경은 #F8FAFC, 패널·헤더·푸터는 흰색, 검색은 #2563EB, AI 생성은 #4F46E5, 참가는 #047857이다. 기존 폼·그리드 배치와 미디어 쿼리를 유지한다. 프로필 모달의 내부 header/footer는 페이지 공통 헤더·푸터로 교체하지 않는다.
