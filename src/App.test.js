import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { fetchMatchList } from './features/match/api/matchListApi';
import { fetchFacilities } from './features/facilities/api/facilityApi';

jest.mock('./features/match/api/matchListApi', () => ({ fetchMatchList: jest.fn(), fetchRecommendedMatches: jest.fn() }));
jest.mock('./features/facilities/api/facilityApi', () => ({
  fetchFacilities: jest.fn(),
  fetchFacility: jest.fn(),
  facilityRequestError: () => '체육시설을 불러오지 못했습니다.',
}));

beforeEach(() => {
  fetchMatchList.mockResolvedValue([]);
  fetchFacilities.mockResolvedValue([]);
  window.history.replaceState({}, '', '/');
});

test('renders the main page at the root route', () => {
  render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: "어떤 운동 찾아요?" })).toBeInTheDocument();
});

test('opens facility search with the entered query', async () => {
  render(<App />);
  userEvent.type(screen.getByRole('searchbox'), '강남 & 풋살');
  userEvent.click(screen.getByRole('button', { name: '검색', exact: true }));
  expect(await screen.findByText('시설 검색')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/facilities');
  expect(new URLSearchParams(window.location.search).get('query')).toBe('강남 & 풋살');
});

test('opens facility search without a query when submitted with Enter', async () => {
  render(<App />);
  userEvent.type(screen.getByRole('searchbox'), '{enter}');
  expect(await screen.findByText('시설 검색')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/facilities');
  expect(window.location.search).toBe('');
});

test('opens the match search page from the board link', async () => {
  render(<App />);
  userEvent.click(screen.getAllByRole('link', { name: '전체 일정 보기' })[0]);
  expect(screen.getByRole('heading', { name: '회원 맞춤 추천 매치' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/matches/search');
  expect(await screen.findByText(/조건에 맞는 매치가 없어요/)).toBeInTheDocument();
});
