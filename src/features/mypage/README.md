# 마이페이지

`/mypage`는 실제 API를 사용한다. 로그인하지 않으면 `/login`으로 이동하고 로그인 후 돌아온다. `/mypage/preview`는 개발 환경 전용 예시 화면이며 탈퇴/로그아웃은 비활성이다.

## 연결된 기능

- [USR-06] `api/myPageApi.js`의 loadMyPage: GET /api/users/me. 평면 응답을 user(이메일·성별)와 profile(닉네임·자치구·선호 종목)로 나눈다. 응답에 없는 가입일/상태는 표시하지 않는다.
- [PR-01] saveProfile: PUT /api/profiles/me. `{ nickname, district, sportTypes }` 전송, 응답의 preferenceSports를 폼에 반영한다. 사진 업로드/기본 이미지 버튼/이미지 요청 필드는 제거했다.
- [USR-03] 기존 auth/components/LogoutButton 재사용. POST /api/auth/logout 후 세션 정리.
- [USR-04] components/WithdrawalButton: 비밀번호 확인 dialog에서 DELETE /api/users/me에 `{ password }` 전송. 204 성공 후에만 at/rt/userId를 지우고 로그인 화면으로 이동. 실패 시 세션 유지. 비밀번호는 모달 종료 시 초기화한다.

## 내 정보 / 내 매치 목록

MyPage의 activeTab이 왼쪽 메뉴를 관리한다. 탭을 바꿔도 수정 중인 폼은 유지한다. 취소는 마지막 저장/조회 값으로 복구한다.

1. `MyPage`에서 내 매치 목록 탭을 선택하면 `components/MyMatches.jsx`가 열린다. 기본 조회 함수는 `api/myPageApi.js`의 `loadMyMatches`이며 `GET /api/matches/me`를 호출한다. 공통 axios가 인증 토큰을 전송하므로 userId는 보내지 않는다.
2. 서버의 `List<MyMatchResponseDto>`를 그대로 표시한다. `role`이 OWNER이면 내가 만든 매치, PARTICIPANT이면 참여한 매치로 표시한다. `title`, `startAt`, `region`, `facilityName`, `sportType`, `numCurrentParticipant`, `maxParticipant`, `isFree`를 카드에 사용한다. 시작 일시 내림차순인 서버 응답 순서를 유지한다.
3. 카드 전체가 링크이며 `matchId`로 `/matches/:matchId` 상세 페이지에 이동한다. 날짜와 장소 표시는 기존 `main/utils/matchDisplay.js` 함수를 재사용한다. 응답 필드가 달라지면 MyMatches의 카드 표시 부분을 수정한다.
4. 빈 배열이면 목록 없음, 조회 실패면 재시도 버튼을 표시한다. 401이면 MyPage의 `requireLogin`을 통해 로그인 페이지로 이동한다. 탭을 나가면 진행 중 요청을 취소하고 다시 열면 새로 조회한다.
5. 개발용 `/mypage/preview`에서는 실제 매치 조회를 하지 않는다. 테스트에서만 MyPage의 `loadMyMatches` props로 조회 함수를 대체할 수 있다.

## 실행 시 주의

현재 프론트 브랜치의 백엔드가 오래된 경우 내 정보/탈퇴/수정 API가 없을 수 있다. 해당 API가 포함된 백엔드를 실행해야 실제 연동이 동작한다. 이번 작업에서는 백엔드 브랜치를 병합하거나 서버를 재시작하지 않았다.
