# FC-01 체육시설 목록

`/facilities`에서 `GET /api/services`로 공공체육시설 목록을 조회합니다.

- 헤더 검색어는 URL `query`로 전달되고, 백엔드 `serviceName` 조건으로 사용합니다.
- 지역은 회원가입과 같은 자치구 한글명(`성동구`)을 보냅니다.
- 종목 칩은 서울시 소분류명(`테니스장`)을 `serviceType`으로 보냅니다.
- 거리 정렬/표시는 구현하지 않습니다.
- `상세보기`는 `/facilities/:serviceId`로 이동합니다.
- `매치 생성`은 `/matches/new`로 시설 정보를 state로 넘깁니다.

# FC-02 체육시설 상세

`/facilities/:serviceId`에서 `GET /api/services/{serviceId}`를 호출합니다. Path의 serviceId는 목록의 숫자 DB PK입니다.

- 화면에는 시설명, 종목, 상태, 결제, 장소, 운영시간, 연락처를 보여줍니다.
- 서비스 구분(DB PK)과 서울시 서비스 ID는 사용자 화면에 표시하지 않습니다.
- 날짜 선택은 오늘부터 7일을 보여 주고, 가능 여부는 서비스 상태와 `reservationDeadlineAt`만 사용합니다.
- 코트별 실시간 대관 현황은 API에 없어 표시하지 않습니다. 예약 신청은 서울시 예약 페이지로 이동합니다.
