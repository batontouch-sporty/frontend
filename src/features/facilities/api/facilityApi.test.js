import api from '../../../api/axios';
import { buildReservationDates, fetchFacilities, fetchFacility, toFacilityItem } from './facilityApi';

jest.mock('../../../api/axios', () => ({ get: jest.fn() }));
afterEach(() => jest.clearAllMocks());

test('sends FC-01 search params and maps the list DTO', async () => {
  api.get.mockResolvedValue({
    data: [{
      serviceId: 1,
      serviceName: '응봉공원 테니스장',
      serviceType: '테니스장',
      region: '성동구',
      locationName: '응봉공원',
      contact: '02-2293-7646',
      status: '접수중',
      startTime: '07:00:00',
      endTime: '19:00:00',
      isFree: false,
    }],
  });

  await expect(fetchFacilities({
    region: '성동구',
    serviceName: '테니스',
    serviceType: '테니스장',
  })).resolves.toEqual([expect.objectContaining({
    serviceId: 1,
    serviceName: '응봉공원 테니스장',
    locationName: '응봉공원',
    startTime: '07:00',
    closed: false,
  })]);

  expect(api.get).toHaveBeenCalledWith('/api/services', {
    params: { region: '성동구', serviceName: '테니스', serviceType: '테니스장' },
    signal: undefined,
    timeout: 15000,
  });
});

test('marks closed facilities and rejects a non-array payload', async () => {
  expect(toFacilityItem({
    serviceId: 2,
    serviceName: '풋살장',
    status: '예약마감',
  }).closed).toBe(true);

  api.get.mockResolvedValue({ data: { items: [] } });
  await expect(fetchFacilities()).rejects.toThrow('응답 형식');
});

test('loads FC-02 detail by DB id and maps 서비스 구분/서비스 ID', async () => {
  api.get.mockResolvedValue({
    data: {
      id: 12,
      serviceId: 'S251121100349891778',
      serviceName: '응봉공원 테니스장',
      status: '접수중',
      paymentMethod: '유료',
      locationName: '응봉공원',
      startTime: '07:00:00',
      reservationDeadlineAt: '2026-12-31T17:00:00',
    },
  });

  await expect(fetchFacility(12)).resolves.toEqual(expect.objectContaining({
    id: 12,
    serviceId: 'S251121100349891778',
    paymentMethod: '유료',
    startTime: '07:00',
    reservationDeadlineAt: '2026.12.31 17:00',
  }));
  expect(api.get).toHaveBeenCalledWith('/api/services/12', {
    signal: undefined,
    timeout: 15000,
  });
});

test('접수 마감일 기준으로 7일 예약 가능 여부를 만든다', () => {
  const now = new Date(2026, 8, 29, 10, 0, 0);
  const days = buildReservationDates({
    closed: false,
    reservationDeadlineAt: '2026.10.01 17:00',
  }, now);

  expect(days).toHaveLength(7);
  expect(days[0]).toEqual(expect.objectContaining({ label: '오늘', state: '접수가능', closed: false }));
  expect(days[2]).toEqual(expect.objectContaining({ displayDate: '2026.10.01', state: '마감일', closed: false }));
  expect(days[3]).toEqual(expect.objectContaining({ displayDate: '2026.10.02', state: '접수마감', closed: true }));
});

test('마감된 서비스는 날짜를 모두 접수마감으로 표시한다', () => {
  const days = buildReservationDates({
    closed: true,
    reservationDeadlineAt: '2099.12.31 17:00',
  }, new Date(2026, 8, 29, 10, 0, 0));

  expect(days.every((day) => day.state === '접수마감' && day.closed)).toBe(true);
});
