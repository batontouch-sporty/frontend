import api from '../../../api/axios';

const SEARCH_FIELDS = ['region', 'serviceName', 'serviceType', 'status'];

export function toFacilityItem(dto) {
  if (!dto || !Number.isSafeInteger(dto.serviceId) || dto.serviceId < 1 || typeof dto.serviceName !== 'string') {
    throw new Error('시설 목록 응답 형식이 올바르지 않습니다.');
  }

  const status = dto.status || '정보없음';
  return {
    serviceId: dto.serviceId,
    serviceName: dto.serviceName,
    serviceType: dto.serviceType || '정보없음',
    region: dto.region || '',
    locationName: dto.locationName || '',
    contact: dto.contact || '',
    status,
    startTime: formatClock(dto.startTime),
    endTime: formatClock(dto.endTime),
    isFree: dto.isFree,
    url: dto.url || '',
    closed: isClosedStatus(status),
  };
}

export async function fetchFacilities(filters = {}, signal) {
  const params = Object.fromEntries(
    SEARCH_FIELDS
      .filter((key) => filters[key] != null && String(filters[key]).trim() !== '')
      .map((key) => [key, String(filters[key]).trim()])
  );
  const { data } = await api.get('/api/services', { params, signal, timeout: 15000 });
  if (!Array.isArray(data)) {
    throw new Error('시설 목록 응답 형식이 올바르지 않습니다.');
  }
  return data.map(toFacilityItem);
}

export function toFacilityDetail(dto) {
  if (!dto || !Number.isSafeInteger(dto.id) || dto.id < 1 || typeof dto.serviceName !== 'string') {
    throw new Error('시설 상세 응답 형식이 올바르지 않습니다.');
  }

  const status = dto.status || '정보없음';
  return {
    id: dto.id,
    serviceId: dto.serviceId || '정보없음',
    serviceName: dto.serviceName,
    serviceType: dto.serviceType || '정보없음',
    status,
    paymentMethod: dto.paymentMethod || '정보없음',
    locationName: dto.locationName || '정보없음',
    region: dto.region || '정보없음',
    contact: dto.contact || '정보없음',
    startTime: formatClock(dto.startTime),
    endTime: formatClock(dto.endTime),
    url: dto.url && dto.url !== '정보없음' ? dto.url : '',
    reservationDeadlineAt: formatDateTime(dto.reservationDeadlineAt),
    closed: isClosedStatus(status),
  };
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function parseReservationDeadline(value) {
  if (typeof value !== 'string' || value.length < 10) return null;
  const normalized = value.includes('T')
    ? value
    : value.replace(/^(\d{4})[.-](\d{2})[.-](\d{2})[ T](\d{2}):(\d{2}).*$/, '$1-$2-$3T$4:$5');
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildReservationDates(facility, now = new Date()) {
  const deadline = parseReservationDeadline(facility?.reservationDeadlineAt);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    const onDeadlineDay = deadline != null
      && date.getFullYear() === deadline.getFullYear()
      && date.getMonth() === deadline.getMonth()
      && date.getDate() === deadline.getDate();
    const deadlineDay = deadline && new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
    const afterDeadlineDay = deadlineDay != null && date > deadlineDay;
    const deadlinePassedToday = onDeadlineDay && now > deadline;
    const closed = Boolean(facility?.closed) || afterDeadlineDay || deadlinePassedToday;
    let state = facility?.status || '정보없음';
    if (closed) state = '접수마감';
    else if (onDeadlineDay) state = '마감일';
    else state = '접수가능';

    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      offset,
      label: offset === 0 ? '오늘' : offset === 1 ? '내일' : WEEKDAYS[date.getDay()],
      weekday: WEEKDAYS[date.getDay()],
      day: date.getDate(),
      displayDate: `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`,
      state,
      closed,
    };
  });
}

export async function fetchFacility(serviceId, signal) {
  const { data } = await api.get(`/api/services/${serviceId}`, { signal, timeout: 15000 });
  return toFacilityDetail(data);
}

export function facilityRequestError(error, kind = 'list') {
  const status = error.response?.status;
  if (kind === 'detail' && status === 400) return '잘못된 서비스 ID입니다.';
  if (kind === 'detail' && status === 404) return '체육서비스를 찾을 수 없습니다.';
  if (status === 400) return '검색 조건을 확인해주세요.';
  if (status === 503) return '공공데이터 연결이 원활하지 않습니다. 잠시 후 다시 검색해주세요.';
  return '체육시설을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
}

function formatClock(value) {
  if (typeof value !== 'string' || value.length < 5) return '';
  return value.slice(0, 5);
}

function formatDateTime(value) {
  if (typeof value !== 'string' || value.length < 16) return '';
  return `${value.slice(0, 10).replaceAll('-', '.')} ${value.slice(11, 16)}`;
}

function isClosedStatus(status) {
  return status.includes('마감');
}
