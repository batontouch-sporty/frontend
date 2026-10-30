import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';
import Header from './Header';

function Location() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}|{new URLSearchParams(location.search).get('query')}</p>;
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

function show() {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Header /><Location /><Link to="/other">다른 화면</Link>
  </MemoryRouter>);
}

test.each([' 성동구 & 풋살 ', '   '])('공통 헤더 검색은 공백을 정리하고 검색어를 안전하게 전달한다: %s', query => {
  show();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } });
  fireEvent.submit(screen.getByRole('search'));
  expect(screen.getByTestId('location')).toHaveTextContent(`/facilities|${query.trim()}`);
});

test('헤더가 마운트된 채 경로가 바뀌어도 로그인 상태를 갱신한다', () => {
  show();
  expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();
  localStorage.setItem('at', 'test-token');
  fireEvent.click(screen.getByRole('link', { name: '다른 화면' }));
  expect(screen.getByRole('link', { name: '마이페이지' })).toBeInTheDocument();
  localStorage.removeItem('at');
  fireEvent.click(screen.getByRole('link', { name: 'Sporty 홈' }));
  expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();
});
