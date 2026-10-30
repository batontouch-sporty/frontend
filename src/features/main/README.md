# 기능별 구현 안내

## [#54][USR-01][USR-02] 공통 헤더와 메인 상단 회원 메뉴

메인은 `components/layout/Header.jsx`를 import하여 `<Header />`로 표시합니다. 다른 페이지에서도 Router 내부에서 같은 컴포넌트를 사용할 수 있습니다. 현재는 메인에만 적용했습니다. 검색 아이콘은 `components/layout/assets/header-search.svg`에 있습니다.

1. `components/layout/Header.jsx`의 `isLoggedIn` state는 로그인 페이지가 저장한 `localStorage.at` 유무로 메뉴를 결정합니다. 서버 인증을 대체하는 상태는 아닙니다.
2. 비로그인: 로그인(`/login`)·회원가입(`/signup`). 로그인: 마이페이지(`/mypage`). 로그인 후 메인에 진입하면 저장된 토큰을 다시 읽습니다.
3. 다른 탭의 토큰 변경(`storage`)과 브라우저 창 복귀(`focus`)에도 상태를 갱신하며, 화면을 떠나면 이벤트 리스너를 해제합니다.
4. 로그아웃과 회원탈퇴 버튼은 메인 상단에 배치하지 않습니다. 마이페이지 담당자가 해당 화면에서 구현합니다. 현재 `/mypage`는 임시 화면입니다.
5. 스타일은 `components/layout/header.css`의 `.sporty-header-auth-menu`에서 수정합니다. 모바일에서는 로고·회원 메뉴 아래에 시설 검색창이 배치됩니다.

이 문서의 경로는 `frontend/src/` 기준입니다. 기능 ID는 FC-01(시설 검색), AI-02(AI 매치 검색), AI-03(AI 매치 생성), EM-02(전체 운동 매칭 목록 조회)를 사용합니다. AI-01은 현재 전달받은 기능 목록에 없어 부여하지 않았습니다.

## [FC-01] 시설 검색

1. **사용자 입력 → 이동**: `components/layout/Header.jsx`의 `facilityQuery`(문자열)에 상단 검색어를 저장합니다. 검색 버튼/Enter를 누르면 `facilitySearchHandler`가 `/facilities?query=검색어`로 이동합니다. 이 핸들러는 API를 호출하지 않습니다.
2. **시설 검색 페이지**: `features/facilities/pages/FacilityListPage.jsx`가 `/facilities`를 담당합니다. `useSearchParams`의 `query`는 백엔드 `serviceName` 조건으로 사용합니다.
3. **현재 재사용 가능한 API**: `features/match/api/matchApi.js`의 `searchMatchFacilities({ query, region })`가 `GET /api/services`로 요청합니다. query는 `serviceName` 쿼리 파라미터, region은 `region` 파라미터로 전달합니다. 둘 다 문자열이며 빈 값은 생략합니다. FC-01 최종 명세가 다르면 이 함수의 URL/파라미터를 맞춥니다.
4. **받아올 데이터**: 현재 코드는 배열 `[{ serviceId, serviceName, region, locationName }]`을 가정합니다. serviceId는 정수, serviceName은 문자열 필수입니다. region(자치구), locationName(장소명)은 선택 문자열입니다. `toFacilityOption`이 serviceName을 화면의 name으로 바꿉니다.
5. **생성 폼 내부 검색**: `features/match/components/MatchForm.jsx`의 `search()`가 같은 API를 사용합니다. query/region 입력 → results에 시설 배열 저장 → 클릭한 시설을 facility에 저장 → values.serviceId에 실제 시설 ID를 저장합니다. 시설 선택은 종목을 자동 변경하지 않습니다.
6. **시설 선택 후 생성 이동**: 시설 페이지에서 `navigate('/matches/new', { state: { facility: { serviceId, name, region, locationName } } })`로 넘길 수 있습니다. MatchCreatePage가 MatchForm의 selectedFacility props로 전달합니다.
7. **담당자가 확인할 것**: 시설 응답 DTO와 `toFacilityOption` 필드 매핑, 정상 결과/빈 결과/실패 안내, URL 검색어 반영, 시설 선택 후 실제 ID 전달을 확인합니다.

## [AI-02] AI 매치 검색

1. **입력창**: `features/main/components/AISearchBox.jsx`의 query(문자열)가 자연어 원문입니다. AI 매치 검색 버튼 또는 Enter로 `actionHandler(onSearch)`를 실행하면 MainPage의 `searchHandler(query)`로 전달됩니다. error(문자열)는 실패 안내를 표시합니다.
2. **서버 요청**: `features/main/pages/MainPage.jsx`의 `searchHandler`에서 `POST /api/ai/matches/search`를 직접 호출합니다. 현재 본문은 `{ "query": "성동구에서 초보 풋살 찾아줘" }`를 가정합니다. 백엔드 요청 필드명이 다르면 이 지점을 수정합니다. OpenAI 호출/응답 정제는 백엔드에서 담당하며 프론트에서 호출하지 않습니다.
3. **서버에서 받아올 구조**: HTTP 200의 응답 본문은 `{ conditions: 배열, matches: 배열 }`로 준비했습니다. conditions의 내부 형식과 아래 확장 필드는 아직 최종 DTO 확인이 필요합니다. Axios 응답 전체가 아닌 `response.data`를 읽습니다.
4. **맞춤 조건 데이터**: conditions는 `[{ label: 문자열, value: 문자열 }]`입니다. label은 종목/성별/날짜/자치구/실력 수준 중 하나이고 value에는 풋살/성별 무관/2026-10-01/성동구/초급 등을 전달합니다. `features/main/api/aiMatchApi.js`의 `toConditionSummary`가 5개 순서를 고정하고 추가 조건을 제외합니다. 일부 항목 누락은 미지정, 전체 조건 누락은 요약 숨김입니다. 날짜/지역을 프론트에서 자연어로 재해석하지 않습니다.
5. **매치 카드 데이터**: matches의 각 객체를 같은 파일의 `toMatchCard`에 넣습니다. 아래 표대로 서버 필드를 화면 모델로 바꿉니다. 실제 서버 이름이 다르면 이 함수만 수정합니다.

| 서버 필드 | 타입 | 화면에서 쓰는 곳 / 누락 처리 |
| --- | --- | --- |
| matchId | 정수, 필수 | 카드의 id와 React key |
| title | 문자열, 필수 | 카드 제목 |
| description | 문자열 | 카드 설명, 없으면 빈 문자열 |
| sportType | enum 문자열 | 종목 태그, 예: FUTSAL, TENNIS |
| skillLevel | enum 문자열 | 실력 태그, BEGINNER/INTERMEDIATE/ADVANCED |
| startAt, endAt | ISO 날짜·시간 문자열 | 일정 표시, startAt은 시간순 정렬에도 사용 |
| region, facilityName | 문자열, 확장 필드 가정 | 자치구 + 시설명 표시(예: 성동구 예시 풋살장), 누락 값은 미정 표시 |
| currentParticipant | 0 이상 정수, 확장 필드 가정 | 현재 참여 인원 |
| maxParticipant | 1 이상 정수 | 최대 참여 인원 |
| isFree | boolean, 확장 필드 가정 | true=무료, false=유료, 없으면 요금 정보 없음 |
| score | 0~100 숫자, 확장 필드 가정 | 적합도와 정렬, 없으면 배지 숨김 |
| distance | 숫자, 확장 필드 가정 | 거리순 정렬, 모든 항목의 거리 단위 통일 필요 |

6. **state 갱신 → 화면 전달**: `setSearchResults({ conditions, matches })`로 두 배열을 함께 저장합니다. conditions는 `AIConditionSummary`에, matches는 `MatchListSection`에 props로 전달합니다. MatchListSection이 배열을 순회해 각 객체를 `MatchCard`의 match props에 넣습니다. 예시는 3개지만 실제 검색 결과를 3개로 자르지는 않습니다.
7. **카드 인원 표시**: MatchCard가 currentParticipant/maxParticipant로 `참여 인원 7/12명`과 막대 길이를 함께 계산합니다. 25% 미만 파랑, 25~75% 초록, 75% 초과 빨강입니다. 인원 누락/비정상 값은 정보 없음 및 막대 숨김, 정원 초과는 실제 인원 표시 및 길이 100% 제한입니다. 금액과 잔디 종류는 표시하지 않습니다.
8. **검색 상태/오류**: searchStatus는 idle/loading/success/error입니다. 시작 시 이전 결과를 비우고 로딩 중 입력/버튼을 잠급니다. 401/500의 message(문자열)를 표시하며 없으면 기본 안내를 사용합니다. 빈 matches 배열은 결과 없음으로 표시합니다. 실패를 빈 결과로 취급하지 않습니다.
9. **정렬/추가 연결**: `MatchListSection.jsx`의 sort는 score/startAt/distance이며 현재 받은 배열만 정렬합니다. `onEdit`는 조건 편집 기능, `onJoin(match)`는 참가 신청 기능 연결점이며 미구현입니다. 참가 API와 서버 정렬은 별도 연결이 필요합니다.
10. **담당자가 수정할 순서**: MainPage.searchHandler의 요청 필드 확정 → toConditionSummary/toMatchCard의 응답 필드 매핑 → 실제 서버로 맞춤 조건과 카드 동시 표시 확인 → 빈 결과/401/500 확인. API 주소/토큰 헤더는 공통 `api/axios.js`에서 관리합니다.

## [AI-03] AI 매치 생성

1. **입력 → 핸들러**: AISearchBox의 같은 query를 사용합니다. AI 매치 생성 버튼을 누르면 `actionHandler(onGenerate)` → `MainPage.generateHandler(query)` 순서로 실행합니다. 검색 버튼과는 다른 핸들러입니다.
2. **현재 구현 범위**: 생성 해석 API URL은 아직 미정이며 현재 직접 호출하는 API가 없습니다. 생성 담당자는 해석 API 함수를 만든 뒤 `routes/AppRoutes.jsx`에서 `<MainPage onGenerate={해석함수} />`로 주입합니다. 함수는 자연어 문자열을 받아 Promise로 아래 본문 객체를 반환해야 합니다. Axios response 자체를 반환하지 않습니다.
3. **서버에서 받아올 예정 데이터**: `{ initialValues: 객체, facility?: 객체 }`입니다. 아래는 프론트에서 준비한 계약이며 최종 DTO 확정 후 조정합니다.

| 필드 | 타입 | 자동 입력 위치 |
| --- | --- | --- |
| initialValues.sportType | enum 문자열 | 운동 종목 |
| initialValues.skillLevel | enum 문자열 | 실력 수준 |
| initialValues.startAt | YYYY-MM-DDTHH:mm 형식 문자열 | 경기 날짜/시작 시간 |
| initialValues.endAt | YYYY-MM-DDTHH:mm 형식 문자열 | 종료 날짜/종료 시간 |
| initialValues.maxParticipant | 1 이상 정수 | 최대 모집 인원 |
| initialValues.title | 문자열 | 매치 제목 |
| initialValues.description | 문자열 | 상세 안내 |
| facility.serviceId | 양의 정수 | 실제 시설 ID |
| facility.name | 문자열 | 선택한 시설 이름 |
| facility.region, facility.locationName | 선택 문자열 | 시설 지역/장소 표시 |

4. **초안 정리**: `features/match/utils/aiMatchDraft.js`의 `prepareAiMatchDraft`가 허용 필드만 추려 `{ prompt, initialValues, facility, interpreted }`로 만듭니다. 실제 시설 ID/name이 없으면 시설을 자동 선택하지 않습니다. 성별/자치구는 현재 생성 폼의 독립 입력 항목이 아니므로 자동 입력 대상에 없습니다. 필요하면 초안 허용 목록·폼·등록 DTO를 함께 확장합니다.
5. **페이지 전달 — 현재 구현**: generateHandler가 `moveUrl('/matches/new', { state: { aiDraft } })`로 이동하는 부분까지 구현되어 있습니다. 현재 `features/match/pages/MatchCreatePage.jsx`는 aiDraft를 읽지 않으므로 생성 폼에 조건이 자동 입력되지 않습니다. 생성 담당자가 `location.state?.aiDraft`를 읽어 MatchForm의 initialValues/selectedFacility props로 전달해야 합니다. 기존 `location.state?.facility` 처리도 함께 고려해야 합니다.
6. **자동 입력 — 담당자 연결 필요**: `MatchForm.jsx`는 전달받은 initialValues를 `initialMatchValues`로 변환해 최초 마운트 때 values state에 저장할 수 있습니다. 날짜·시간 분리는 `features/match/utils/matchValidation.js`가 처리합니다. 담당자는 초안 props를 연결하고, 같은 생성 화면에서 새 초안을 적용할 때 `location.key` 등을 폼의 key로 사용해 다시 마운트하도록 구현해야 합니다. 일반 재렌더마다 초기화해 사용자의 수정값을 덮지 않도록 합니다.
7. **미연결/실패**: onGenerate 미연결 시 자연어 원문만 가져가며 조건을 추측하지 않습니다. 값이 없으면 기존 폼 기본값을 사용합니다. 해석 실패는 입력창 error에 표시하고 생성 페이지로 이동하지 않습니다. generating state는 처리 중 버튼/입력 잠금에 사용합니다.
8. **인증 — 담당자 연결 필요**: 토큰이 없으면 RequireMatchAuth가 로그인으로 이동하며 현재는 from 경로만 전달합니다. fromState 보존은 구현되어 있지 않아 로그인 경유 시 AI 초안이 유지되지 않습니다. 생성·로그인 담당자는 인증 이동 지점에서 기존 location.state를 fromState 등으로 보존하고, 로그인 성공 후 검증된 내부 경로로 `navigate(from, { state: fromState, replace: true })`하여 복원하도록 연결해야 합니다. 로그인 화면은 현재 안내 문구 상태입니다.
9. **최종 등록과 구분**: AI-03은 해석 및 초안 전달입니다. 실제 등록은 사용자가 생성 폼의 완료 버튼을 눌러야 `MatchForm.submit` → `MatchCreatePage.handleSubmit` → `createMatch` → `POST /api/matches`가 실행됩니다. 실제 등록 기능 ID는 아직 지정하지 않았습니다. 요청 필드와 검증은 [매치 생성 안내](../match/README.md)에 정리했습니다.
10. **담당자가 수정할 순서**: 해석 API 함수 작성 → AppRoutes의 onGenerate 연결 → prepareAiMatchDraft 필드 맞추기 → MatchCreatePage에서 aiDraft 읽기 및 MatchForm props/key 연결 → 인증 이동 시 초안 보존 및 로그인 후 복원 연결 → 자동 입력/수정/실패 확인. AI 해석 성공만으로 실제 매치를 등록하지 않습니다.

## [EM-02] 전체 운동 매칭 목록 조회

1. **이동 지점**: MainPage 하단의 Link를 누르면 `/matches/search`로 이동합니다. Link 자체가 이동을 처리하므로 별도 클릭 핸들러/state는 없습니다.
2. **현재 상태**: AppRoutes의 해당 경로는 안내 문구만 있습니다. EM-02 조회 API의 주소·요청 파라미터·응답 형식은 아직 전달받지 않아 구현하지 않았습니다. AI-02 결과와 전체 목록 조회는 별개입니다.
3. **전체 목록 담당자 작업**: 실제 목록 페이지를 만들고 라우트에 연결합니다. 페이지 안에 loadData 또는 목록 조회 핸들러를 만들고, 목록/로딩/오류 state를 정의한 뒤 확정된 API를 호출합니다. 최초 조회는 useEffect에서 호출할 수 있습니다.
4. **필요한 데이터 협의**: 카드를 재사용하려면 AI-02 표의 제목·종목·실력·일정·위치·현재/최대 인원·유무료 정보가 필요합니다. 적합도는 전체 목록에서 제공하지 않아도 됩니다. 페이지 처리를 적용한다면 목록 배열, 전체 개수(정수), 페이지 번호/크기(정수)의 계약도 별도 확정합니다. 아직 필드명을 정하지 않았습니다.
5. **화면 표시**: 응답을 카드 모델로 변환해 MatchListSection/MatchCard를 재사용할 수 있습니다. 다만 MatchListSection 제목은 현재 '분석된 조건과 일치하는 매치'이므로 전체 목록용 제목으로 분리/확장해야 합니다. 서버 페이지 처리를 쓰면 현재 프론트 정렬이 전체 결과가 아닌 받은 페이지 안에서만 동작한다는 점도 처리합니다.
6. **하단 숫자**: 현재 메인 하단의 N건은 메인에 표시 중인 예시/AI 검색 결과 개수입니다. 서버의 전체 매치 수가 아닙니다. 전체 개수 응답이 확정되면 별도 totalCount state로 연결하고 표시 문구를 맞춥니다.

## state가 없는 컴포넌트

AIConditionSummary와 MatchCard는 받은 props로 표시값을 계산합니다. MatchCreatePage는 현재 라우터 state의 facility만 폼에 전달하며, aiDraft 읽기와 자동 입력 연결은 담당자의 후속 작업입니다. 별도 useState가 없으며 API 응답 저장은 MainPage, 편집 중 폼 값은 MatchForm에서 담당합니다. 각 useState/useRef 바로 위의 기능 ID 주석으로 소유 기능을 찾을 수 있습니다.

카드 날짜는 utils/matchDisplay.js에서 한국 날짜 기준의 XX월 XX일 X요일로 표시합니다. 시간대가 포함된 ISO 값은 한국 시간으로 변환합니다. 장소는 region + facilityName을 사용하며 실제 백엔드 필드명이 다르면 toMatchCard의 매핑을 수정합니다. 역세권 설명은 표시하지 않습니다.
