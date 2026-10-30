# 매치 생성

```text
features/match/
├── assets/
├── api/
│   ├── matchApi.js
│   └── matchApi.test.js
├── pages/
│   └── MatchCreatePage.jsx
├── components/
│   ├── MatchForm.jsx
│   └── MatchForm.test.jsx
├── utils/
│   └── matchValidation.js
├── css/
│   └── match.css
└── README.md
```

- 시설 검색 결과와 선택한 시설에는 지역명과 장소명을 `서초구 · 서초종합체육관` 형식으로 표시합니다. API 필드명은 `region` (`location.region`), `locationName` (`location.name`)으로 가정하며 실제 응답 DTO 확인이 필요합니다.

- 화면 경로: `/matches/new`. `localStorage.at`가 없으면 `/login?redirect=%2Fmatches%2Fnew`로 이동합니다. 로그인 화면은 아직 자리표시자입니다. 로그인 구현 시 `location.state.from` 또는 `redirect`의 내부 경로를 검증한 후 `navigate(from, { replace: true })`로 복귀시켜야 합니다.
- API 주소는 기존 `REACT_APP_BACKEND_ENDPOINT`를 사용합니다. `POST /api/matches` 성공 시 반환된 정수 또는 `{ matchId }`로 `/matches/:matchId`에 이동합니다.
- `GET /api/services`에 `serviceName`, `region` 검색 조건을 전달합니다. 시설 목록 응답은 아직 확인 전으로 `[{ serviceId: number, serviceName: string, region?: string, locationName?: string }]`를 가정합니다. 실제 DTO 확정 시 `api/matchApi.js`의 `toFacilityOption`을 조정하세요.
- 시설 상세 화면에서는 `navigate('/matches/new', { state: { facility: { serviceId, name, region, locationName } } })`로 선택한 시설을 넘길 수 있습니다.
- 종목 선택과 시설 검색·선택은 독립적입니다. 종목 변경 시 시설과 검색 조건을 유지하고, 시설 선택 시 종목을 변경하지 않습니다. 생성 요청에는 기존 7개 필드에 `sportType`을 추가해 8개 필드를 전송합니다. `sportType`은 백엔드 enum 이름(예: `FUTSAL`, `TABLE_TENNIS`)이며 시설 응답에는 필요하지 않습니다.
- 제목 50자, 설명 500자는 Figma 기준입니다. 종료 날짜 미입력 시 경기 당일로 계산하며 날짜/시간은 시간대 변환 없이 LocalDateTime 형식으로 보냅니다.
- 수정 화면에서 `MatchForm`에 조회된 `initialValues`, `selectedFacility`, 수정 API를 호출하는 `onSubmit`, `submitLabel`을 전달하면 재사용할 수 있습니다. 비동기 조회가 완료된 뒤 폼을 마운트하세요. 수정 API 명세가 없어 수정 라우트 구현은 포함하지 않습니다.
- 로그인/매치 상세 등 다른 페이지와 공통 헤더·푸터는 아직 미구현입니다. 공통 레이아웃이 생기면 페이지의 헤더·푸터를 교체할 수 있습니다.

검증: `npm test -- --watchAll=false --runInBand`, `npm run build`.
