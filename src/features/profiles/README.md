# [PR-02] 프로필 상세 조회 모달

## 사용 방법

페이지에서 선택한 `profileId`를 state로 관리하고 `ProfileModal`에 전달합니다.
사용자 ID(`userId`)가 아니라 매치 참가자 응답의 `profileId`를 사용합니다.
모달은 공통 컴포넌트이므로 라우터에 등록하지 않습니다. React Router 내부에서 사용합니다.

```jsx
import { useState } from 'react';
import ProfileModal from '../../profiles/components/ProfileModal';

const [selectedProfileId, setSelectedProfileId] = useState(null);

<button onClick={() => setSelectedProfileId(participant.profileId)}>프로필 보기</button>
{selectedProfileId !== null && (
  <ProfileModal
    profileId={selectedProfileId}
    onClose={() => setSelectedProfileId(null)}
  />
)}
```

## 파일별 담당 지점

1. `api/profileApi.js`: `GET /api/profiles/{profileId}` 요청. 경로나 응답 형식 변경 시 수정합니다.
   공통 axios가 localStorage의 `at`를 Authorization 헤더에 붙입니다.
2. `components/ProfileModal.jsx`: API 조회, 로딩, 401/404/서버 오류, 재시도 및 프로필 표시를 처리합니다.
   - `result`: 조회 상태와 프로필 응답.
   - `retryCount`: 다시 시도 시 요청 재실행.
   - `imageFailed`: 이미지 오류 시 닉네임 첫 글자로 대체.
   - 토큰 없음: 요청 없이 “프로필 조회는 로그인이 필요합니다” 안내.
   - 401: 같은 로그인 안내. 사용자가 “로그인하기”를 선택할 때 `/login`으로 이동합니다.
   - 로그인 완료 후 기존 로그인 페이지의 `from`/`fromState` 규칙으로 원래 화면에 복귀합니다.
     프로필 모달은 복귀 후 다시 클릭해 엽니다.
   - 닫기 버튼, Esc, 바깥 클릭으로 닫고 스크롤과 원래 버튼 포커스를 복구합니다.
   - 닫기/프로필 변경 시 이전 요청을 취소하여 늦은 응답이 덮어쓰지 않게 합니다.
3. `css/profileModal.css`: Figma 69:3127의 540px 모달, 반응형 크기, 패널·태그 스타일.
4. `assets`: Figma 원본 닫기·위치 SVG. 프로필 사진은 API의 `imageUrl`을 사용합니다.
5. `match/pages/MatchDetailPage.jsx`: 참가자 이름 버튼의 `onProfileClick`에서 `selectedProfileId`를 설정합니다.
   디자인 미리보기의 가상 참가자는 실제 조회에 연결하지 않습니다.

## API 응답

```json
{
  "id": 401,
  "nickname": "풋살메이트",
  "district": "SEONGDONG",
  "imageUrl": null,
  "preferenceSports": ["FUTSAL", "BADMINTON"]
}
```

자치구·종목 한글 표시는 기존 `auth/data/signUpOptions.js` 선택지를 재사용합니다.
서버 enum이 추가되면 해당 선택지도 함께 추가합니다.
이메일·실력·포지션·접속 상태는 API에 없어 표시하지 않습니다.
빈 선호 종목과 없는/깨진 프로필 이미지는 정상적인 빈 상태로 표시합니다.
