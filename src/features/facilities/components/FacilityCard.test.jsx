import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import FacilityCard from './FacilityCard';

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

test('매치 생성은 시설 ID를 생성 화면으로 전달한다', () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<FacilityCard facility={facility} />} />
        <Route path="/matches/new" element={<LocationState />} />
      </Routes>
    </MemoryRouter>
  );

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
