# 운동 매치 목록 구현 안내

진입 URL: `/matches/search`. 실제 서버 목록을 조회하며 예시 데이터는 자동 표시하지 않습니다.

## 구현 파일

- `pages/MatchListPage.jsx`: 실제 라우트 컴포넌트와 표시 전용 `MatchListView`.
- `hooks/useMatchList.js`: 목록/추천 조회, 필터 적용·초기화, 정렬, 더보기, 재시도, 참가, 시설 검색 이동.
- `api/matchListApi.js`: 공통 axios 기반 API, 지원 필드만 전송, DTO 화면 모델 변환, 오류 메시지.
- `components/MatchListFilters.jsx`, `MatchBrowseCard.jsx`: 상태/콜백을 받아 UI 표시.
- `data/matchListPreview.js`: 디자인 예시 전용. 명시적으로 `MatchListView preview`를 렌더링할 때만 사용.

## 동작

- 진입 시 GET /api/matches. 종목은 검색 DTO에 전송하고 모집 상태는 받은 전체 배열에서 필터링합니다. 필터는 ‘조건 검색 적용’으로 적용하며 재시도는 마지막 적용 조건을 유지합니다.
- 기본순은 서버 반환 순서입니다. 경기 시작순 정렬을 제공합니다. 최신등록/마감임박/거리순은 근거 필드가 없어 제거했습니다.
- 6개씩 표시하고 더보기로 6개씩 추가합니다. 서버 페이지네이션 요청을 만들지 않습니다.
- 요청 취소와 최신 요청 확인으로 이전 응답의 덮어쓰기를 막습니다. 목록과 추천 상태는 독립적이고 15초 요청 제한을 둡니다.
- 추천은 토큰이 있을 때만 요청합니다. 미구현 404/501은 준비 중으로 표시합니다.
- 참가는 비로그인 시 로그인 경로로 이동하며, 요청 중 잠금과 201 확인 후 재조회를 수행합니다. 400/401/403/404/409/501과 네트워크 실패를 안내합니다.
- 시설 검색은 Enter로 /facilities?query=... 경로로 이동합니다. 해당 시설 페이지와 로그인/상세 페이지는 현재 라우터의 임시 화면입니다.
- 지역/요금/선호 종목은 서버/프로필 계약이 없어 비활성화했습니다. 프로필 정보를 지어내지 않습니다.
- 생성 폼의 genderGroup 입력·검증·요청 데이터, 메인 카드 성별 표시, AI 초안 성별 전달 및 생성 폼 초기값 연결을 구현했습니다. **백엔드에는 성별 필드가 없어 서버 저장은 아직 지원되지 않습니다.** 프론트 요청만으로 저장된다고 판단하지 마세요.
- AI 초안 전달은 준비된 라우터 state를 읽는 기능입니다. AI 해석 API 자체와 로그인 경유 초안 복원은 별도 연동 사항입니다.

## PDF ↔ 현재 로컬 백엔드 대조

확인 범위: `backend/sporty/src/main/java`. 서버 실행/통합 호출은 하지 않았습니다.

| 기능 | PDF API | 현재 백엔드 상태 |
| --- | --- | --- |
| EM-02 전체 목록 | `GET /api/matches` | MatchController.search → MatchService.searchMatches 구현. 200 + 배열, 잘못된 검색 조건은 400 |
| AI-03 맞춤 추천 | `GET /api/ai/matches/recommendations` | 보안 설정에 경로는 있으나 컨트롤러 구현 없음. 명세상 401/500 |
| EM-06 참가 | `POST /api/matches/{matchId}/participants` | 핸들러는 있으나 501 NOT_IMPLEMENTED 반환. 명세상 201 + 참가 DTO, 400/401/404/409 |
| EM-03 상세 | `GET /api/matches/{matchId}` | 구현됨. 카드 클릭은 `/matches/{id}` 라우트로 이동. 해당 상세 프론트는 기존 임시 화면 |
| PR-02 프로필 | `GET /api/profiles/{profileId}` | 프로필 엔티티/저장소만 확인, 컨트롤러 없음. 내 profileId를 얻는 계약도 필요. userId와 혼동 금지 |
| FC-01 시설 검색 | `GET /api/services` | PDF 존재, 현재 시설 컨트롤러 없음. 헤더는 시설 검색 화면으로 이동하도록 연결 예정 |
| FC-02 시설 상세 | `GET /api/services/{serviceId}` | PDF 존재, 현재 시설 컨트롤러 없음. 공식 예약 URL/시설 정보 확인 시 필요 |

참고: 기존 소스의 AI-03 주석은 일부에서 “AI 생성 초안”을 뜻하지만 **이번 PDF의 AI-03은 추천 API**입니다. 이번 skeleton은 PDF 기능 ID를 따릅니다.

## EM-02의 실제 요청·응답

`MatchSearchRequestDto.java`가 받는 쿼리 필드:

```text
serviceId: 양수 Long
titleKeyword: 최대 50자
descriptionKeyword: 최대 500자
startAt, endAt: ISO LocalDateTime (둘 다 있으면 endAt > startAt)
maxParticipant: 양수 Integer (상한 조건)
skillLevel: BEGINNER | INTERMEDIATE | ADVANCED
sportType: SportType enum (예: FUTSAL, TENNIS)
```

`MatchResponseDto.java`의 응답 필드:

```text
matchId, title, description, startAt, endAt, maxParticipant,
status (RECRUITING | CLOSED), skillLevel, sportType
```

## 현재 불일치 / 백엔드 확장 필요

- PDF는 검색에 `gender_group`을 명시하지만 현재 검색 DTO/목록 응답에는 성별 필드가 없습니다. 프론트의 `genderGroup`과 명세 표기부터 합의해야 합니다. 생성 DTO에도 성별 필드가 없어 현재 프론트 생성 데이터의 성별이 저장된다고 볼 수 없습니다.
- UI-09는 지역·종목·서비스 상태 필터를 요구하지만 실제 검색 DTO에는 종목만 있고 지역/서비스 상태는 없습니다. 디자인의 매치 모집 상태와 서비스 상태도 별도 개념입니다.
- 디자인의 `region`, 매치 `status`, `isFree`, 선호 종목 토글은 서버 검색 조건이 아닙니다. status는 전체 조회 후 프론트 필터가 가능하지만 지역/요금은 응답에 없어 불가능합니다.
- 디자인의 거리순, 최신등록순, 취소마감순에 필요한 좌표/거리, createdAt, cancelDeadline이 없습니다. matchId로 등록 시점을 추정하거나 endAt을 취소마감으로 대체하지 마세요.
- 목록 응답에 현재 참가 인원, serviceId/시설명/지역, 방장, 요금, 예약 URL이 없습니다. 목록 DTO 확장 권장. 항목마다 상세 요청을 추가하는 것은 호출 수가 늘어나므로 계약을 먼저 확정하세요.
- 상세 응답의 인원 이름은 `currentParticipantCount`입니다. 메인 카드의 `currentParticipant`와 다릅니다. 상세 DTO가 제공하는 시설 정보도 서비스 코드에서 null로 내려가는 부분을 확인해야 합니다.
- 목록은 `List<MatchResponseDto>`이며 page/size/total/hasNext/sort 계약이 없습니다. 더보기는 프론트에서 받은 배열의 표시 개수를 늘리거나 서버 페이지 계약 추가 후 구현하세요.
- 참가 501을 성공으로 처리하면 안 됩니다. 구현 후 중복 요청 방지, 401 로그인 유도, 400 마감/정원 초과, 409 이미 참가 처리와 재조회가 필요합니다.
- 프로필 역할 횟수, 매너 점수, 알림 API는 확인되지 않았습니다. 실제 값으로 단정하지 않도록 알림/매너 점수는 skeleton에서 생략했습니다.

## 디자인 / 검증 범위

Figma 전체 스크린샷과 왼쪽 사이드바의 상세 컨텍스트를 확보했습니다. 이후 Figma 호출 한도에 도달하여 사용자 승인에 따라 나머지는 스크린샷 기반 근사 구현했습니다. 화면의 DB 필드명 등 개발용 표기는 사용자용 문구로 바꾸었습니다.
사이드바 SVG 9개와 예시 프로필 이미지는 Figma 에셋을 로컬 `assets/list`에 저장했습니다. SVG root 크기는 유지했습니다. 헤더/푸터 로고와 검색 아이콘은 기존 프로젝트 에셋을 재사용했습니다.
Figma 텍스트 깨짐/레이어 겹침까지 복제하지는 않았습니다. 카드의 성별/실력은 기존 기능을 이어 표시합니다.
