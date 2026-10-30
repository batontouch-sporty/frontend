import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import MainPage from './MainPage';

jest.mock('../components/AISearchBox', () => () => null);
jest.mock('../components/AIConditionSummary', () => () => null);
jest.mock('../components/MatchListSection', () => () => null);

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

function show() {
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/login" element={<><h1>로그인 화면</h1><Link to="/">메인으로</Link></>} />
      <Route path="/signup" element={<h1>회원가입 화면</h1>} />
      <Route path="/mypage" element={<h1>마이페이지 화면</h1>} />
    </Routes>
  </MemoryRouter>);
}

test('비로그인 메뉴는 로그인·회원가입으로 연결하고 계정 종료 버튼은 없다', () => {
  show();
  const menu = within(screen.getByRole('navigation', { name: '회원 메뉴' }));
  expect(menu.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login');
  expect(menu.getByRole('link', { name: '회원가입' })).toHaveAttribute('href', '/signup');
  expect(menu.queryByRole('link', { name: '마이페이지' })).not.toBeInTheDocument();
  expect(menu.queryByText('로그아웃')).not.toBeInTheDocument();
  expect(menu.queryByText('회원탈퇴')).not.toBeInTheDocument();
  fireEvent.click(menu.getByRole('link', { name: '회원가입' }));
  expect(screen.getByRole('heading', { name: '회원가입 화면' })).toBeInTheDocument();
});

test('로그인 상태로 새로 진입하면 마이페이지 메뉴만 표시한다', () => {
  localStorage.setItem('at', 'test-token');
  show();
  const menu = within(screen.getByRole('navigation', { name: '회원 메뉴' }));
  expect(menu.getAllByRole('link')).toHaveLength(1);
  fireEvent.click(menu.getByRole('link', { name: '마이페이지' }));
  expect(screen.getByRole('heading', { name: '마이페이지 화면' })).toBeInTheDocument();
});

test('로그인 화면에서 토큰을 저장하고 메인으로 복귀하면 메뉴가 변경된다', () => {
  show();
  fireEvent.click(screen.getByRole('link', { name: '로그인' }));
  localStorage.setItem('at', 'test-token');
  fireEvent.click(screen.getByRole('link', { name: '메인으로' }));
  expect(screen.getByRole('link', { name: '마이페이지' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument();
});

test('다른 탭의 로그인·로그아웃과 창 복귀를 반영한다', () => {
  show();
  act(() => { localStorage.setItem('at', 'test-token'); window.dispatchEvent(new StorageEvent('storage', { key: 'at' })); });
  expect(screen.getByRole('link', { name: '마이페이지' })).toBeInTheDocument();
  act(() => { localStorage.clear(); window.dispatchEvent(new StorageEvent('storage', { key: null })); });
  expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();
  act(() => { localStorage.setItem('at', 'test-token'); window.dispatchEvent(new Event('focus')); });
  expect(screen.getByRole('link', { name: '마이페이지' })).toBeInTheDocument();
});
