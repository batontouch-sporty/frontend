import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fetchFacility } from '../api/facilityApi';
import FacilityDetailPage from './FacilityDetailPage';
import MatchCreatePage, { RequireMatchAuth } from '../../match/pages/MatchCreatePage';

jest.mock('../api/facilityApi', () => {
  const actual = jest.requireActual('../api/facilityApi');
  return {
    ...actual,
    fetchFacility: jest.fn(),
    facilityRequestError: (_error, kind) => (
      kind === 'detail' ? '체육서비스를 찾을 수 없습니다.' : '체육시설을 불러오지 못했습니다.'
    ),
  };
});

jest.mock('../../match/api/matchApi', () => ({
  createMatch: jest.fn(),
  searchMatchFacilities: jest.fn(),
}));

function renderPage(path) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/facilities/:serviceId" element={<FacilityDetailPage />} />
        <Route path="/matches/new" element={<RequireMatchAuth><MatchCreatePage /></RequireMatchAuth>} />
        <Route path="/login" element={<p>로그인 화면</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const detail = {
  id: 12,
  serviceId: 'S251121100349891778',
  serviceName: '응봉공원 테니스장',
  serviceType: '테니스장',
  status: '접수중',
  paymentMethod: '유료',
  locationName: '응봉공원',
  region: '성동구',
  contact: '02-2293-7646',
  startTime: '07:00',
  endTime: '19:00',
  url: 'https://example.com',
  reservationDeadlineAt: '2099.12.31 17:00',
  closed: false,
};

afterEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

test('상세 화면은 예약에 필요한 정보와 날짜를 보여준다', async () => {
  fetchFacility.mockResolvedValue(detail);

  renderPage('/facilities/12');
  expect(await screen.findByRole('heading', { name: '응봉공원 테니스장' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sporty 홈' })).toBeInTheDocument();
  expect(screen.getByText('테니스장')).toBeInTheDocument();
  expect(screen.getByText('접수중')).toBeInTheDocument();
  expect(screen.getByText('유료')).toBeInTheDocument();
  expect(screen.getByText('장소 성동구 응봉공원')).toBeInTheDocument();
  expect(screen.getByText('운영시간 07:00 ~ 19:00')).toBeInTheDocument();
  expect(screen.getByText('연락처 02-2293-7646')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /날짜 선택/ })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: /오늘/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText(/코트별 실시간 대관 현황은/)).toBeInTheDocument();
  expect(screen.getByText(/접수 마감:/)).toHaveTextContent('2099.12.31 17:00');
  expect(screen.getByRole('link', { name: '예약 신청' })).toHaveAttribute('href', 'https://example.com');
  expect(screen.queryByText('서비스 구분')).not.toBeInTheDocument();
  expect(screen.queryByText('서비스 ID')).not.toBeInTheDocument();
  expect(screen.queryByText('서비스 상세 정보')).not.toBeInTheDocument();
  expect(fetchFacility).toHaveBeenCalledWith(12, expect.any(AbortSignal));
});

test('로그인 후 상세의 매치 생성은 해당 시설이 선택된 개설 화면으로 이동한다', async () => {
  localStorage.setItem('at', 'test-token');
  fetchFacility.mockResolvedValue(detail);
  renderPage('/facilities/12');
  fireEvent.click(await screen.findByRole('button', { name: '매치 생성' }));
  expect(screen.getByRole('heading', { name: '새로운 매치 개설하기' })).toBeInTheDocument();
  expect(screen.getByText('선택한 시설')).toBeInTheDocument();
  expect(screen.getByText('응봉공원 테니스장')).toBeInTheDocument();
  expect(screen.getByText('성동구 · 응봉공원')).toBeInTheDocument();
});

test('잘못된 형식의 서비스 ID는 API를 호출하지 않는다', async () => {
  renderPage('/facilities/abc');
  expect(await screen.findByRole('alert')).toHaveTextContent('잘못된 서비스 ID입니다.');
  expect(fetchFacility).not.toHaveBeenCalled();
});

test('없는 서비스는 다시 시도할 수 있다', async () => {
  fetchFacility.mockRejectedValueOnce({ response: { status: 404 } });
  fetchFacility.mockResolvedValueOnce(detail);
  renderPage('/facilities/12');
  expect(await screen.findByRole('alert')).toHaveTextContent('체육서비스를 찾을 수 없습니다.');
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByRole('heading', { name: '응봉공원 테니스장' })).toBeInTheDocument();
});
