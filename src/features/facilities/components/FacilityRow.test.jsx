import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import FacilityRow from './FacilityRow';

function LocationState() {
  const location = useLocation();
  return <p data-testid="state">{JSON.stringify(location.state)}</p>;
}

const facility = {
  serviceId: 12,
  serviceName: '응봉공원 테니스장',
  serviceType: '테니스장',
  region: '성동구',
  locationName: '응봉공원',
  contact: '02-2293-7646',
  status: '접수중',
  startTime: '07:00',
  endTime: '19:00',
  isFree: false,
  closed: false,
};

function renderRow(item = facility) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<FacilityRow facility={item} />} />
        <Route path="/matches/new" element={<LocationState />} />
      </Routes>
    </MemoryRouter>
  );
}

test('매치 생성은 시설 ID를 생성 화면으로 전달한다', () => {
  renderRow();

  fireEvent.click(screen.getByRole('button', { name: '매치 생성' }));
  expect(JSON.parse(screen.getByTestId('state').textContent)).toEqual({
    facility: {
      serviceId: 12,
      name: '응봉공원 테니스장',
      region: '성동구',
      locationName: '응봉공원',
    },
  });
});

test('행은 종류, 장소, 운영시간, 상태를 보여주고 제목이 상세로 간다', () => {
  renderRow();

  expect(screen.getByRole('link', { name: '응봉공원 테니스장' })).toHaveAttribute('href', '/facilities/12');
  expect(screen.getByText('테니스장')).toBeInTheDocument();
  expect(screen.getByText('응봉공원 · 유료')).toBeInTheDocument();
  expect(screen.getByText('07:00 ~ 19:00')).toBeInTheDocument();
  expect(screen.getByText('접수중')).toBeInTheDocument();
});

test('마감된 시설은 매치를 만들 수 없다', () => {
  renderRow({ ...facility, status: '접수마감', closed: true });

  expect(screen.queryByRole('button', { name: '매치 생성' })).not.toBeInTheDocument();
  expect(screen.getByText('마감')).toBeInTheDocument();
});

test('연락처를 행에 보여 주고 값이 없으면 정보없음으로 둔다', () => {
  const { unmount } = renderRow();
  expect(screen.getByText('연락처 02-2293-7646')).toBeInTheDocument();
  unmount();
  renderRow({ ...facility, contact: '' });
  expect(screen.getByText('연락처 정보없음')).toBeInTheDocument();
});
