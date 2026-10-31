import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MatchListView as MatchListPage } from './MatchListPage';

function renderPage(props = {}) {
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MatchListPage {...props} /></MemoryRouter>);
}

test('sports apply directly and region and fee controls are enabled', () => {
  const onSportChange = jest.fn();
  const onFilterChange = jest.fn();
  renderPage({ onSportChange, onFilterChange });
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /테니스/ }));
  expect(onSportChange).toHaveBeenCalledWith('TENNIS');
  expect(onFilterChange).not.toHaveBeenCalled();
  const district = screen.getByRole('combobox', { name: '자치구' });
  expect(district).toBeEnabled();
  expect(within(district).getAllByRole('option')).toHaveLength(26);
  fireEvent.change(district, { target: { value: '마포구' } });
  expect(onFilterChange).toHaveBeenCalledWith('region', '마포구');
  const fee = screen.getByRole('button', { name: '유료 대관' });
  expect(fee).toBeEnabled();
  fireEvent.click(fee);
  expect(onFilterChange).toHaveBeenCalledWith('isFree', 'N');
});

test('date tabs report the selected tab and keep the current one pressed', () => {
  const onDateTab = jest.fn();
  renderPage({ onDateTab, dateTab: 'today' });
  const tabs = within(screen.getByRole('group', { name: '날짜' }));
  expect(tabs.getAllByRole('button').map(tab => tab.textContent)).toEqual(['전체', '오늘', '내일', '이번 주말']);
  expect(tabs.getByRole('button', { name: '오늘' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(tabs.getByRole('button', { name: '이번 주말' }));
  expect(onDateTab).toHaveBeenCalledWith('weekend');
});

test('preferred sports stay locked until the profile is loaded, and reset and apply remain available', () => {
  const onApply = jest.fn();
  const onReset = jest.fn();
  const { unmount } = renderPage({ onFilterChange: jest.fn(), onApply, onReset });
  expect(screen.getByRole('switch', { name: '내 선호 종목만' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '조건 적용' }));
  fireEvent.click(screen.getByRole('button', { name: '전체 초기화' }));
  expect(onApply).toHaveBeenCalledTimes(1);
  expect(onReset).toHaveBeenCalledTimes(1);
  unmount();
  renderPage({ onFilterChange: jest.fn(), profile: { region: '마포구', sports: '테니스' } });
  expect(screen.getByRole('switch', { name: '내 선호 종목만' })).toBeEnabled();
});

test('real empty results do not fall back to example data', () => {
  renderPage({ status: 'success', recommendationStatus: 'success' });
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(screen.getByText(/조건에 맞는 매치가 없어요/)).toBeInTheDocument();
  expect(screen.getByText('추천 매치가 없어요.')).toBeInTheDocument();
});

test('list failure and retry are independent from recommendation loading', () => {
  const onRetry = jest.fn();
  renderPage({ status: 'error', recommendationStatus: 'loading', onRetry });
  expect(screen.getByRole('status')).toHaveTextContent('추천 매치를 찾고 있어요.');
  fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: '다시 시도' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('rows pass match IDs to the callback, link to detail and prevent joining closed matches', () => {
  const onJoin = jest.fn();
  renderPage({ onJoin, status: 'success', matches: [
    { id: 42, title: '열린 매치' },
    { id: 43, title: '마감 매치', closed: true },
  ] });
  fireEvent.click(screen.getByRole('button', { name: '참가' }));
  expect(onJoin).toHaveBeenCalledWith(42);
  expect(screen.getByRole('button', { name: '모집 마감' })).toBeDisabled();
  expect(screen.getByRole('link', { name: '열린 매치' })).toHaveAttribute('href', '/matches/42');
});

test('groups the schedule by day and shows the same join states as the main page', () => {
  renderPage({ status: 'success', onJoin: jest.fn(), matches: [
    { id: 1, title: '첫째 날 매치', startAt: '2099-03-02T19:00:00' },
    { id: 2, title: '둘째 날 매치', startAt: '2099-03-03T19:00:00' },
    { id: 3, title: '첫째 날 두 번째', startAt: '2099-03-02T21:00:00' },
  ], joins: { 1: { status: 'done' }, 2: { status: 'error', message: '이미 참가 중인 매치예요.' }, 3: { status: 'joining' } } });
  const days = screen.getAllByRole('heading', { level: 3 }).filter(heading => /월/.test(heading.textContent));
  expect(days.map(day => day.textContent)).toEqual([expect.stringContaining('3월 2일'), expect.stringContaining('3월 3일')]);
  expect(within(days[0].parentElement).getAllByRole('article')).toHaveLength(2);
  expect(screen.getByRole('button', { name: '신청 완료' })).toBeDisabled();
  expect(screen.getByText('취소는 매치 상세에서 해요.')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('이미 참가 중인 매치예요.');
  expect(screen.getByRole('button', { name: '참가 신청 중…' })).toBeDisabled();
});

test('recommendations use the same schedule rows on the ink board', () => {
  const onJoin = jest.fn();
  renderPage({ onJoin, recommendationStatus: 'success', recommendations: [{ id: 7, title: '추천 매치', startAt: '2099-03-02T19:00:00' }] });
  const board = screen.getByRole('region', { name: '회원 맞춤 추천 매치' });
  expect(within(board).getByRole('article')).toHaveClass('match-row--board');
  expect(within(board).getByText('03.02')).toBeInTheDocument();
  fireEvent.click(within(board).getByRole('button', { name: '참가' }));
  expect(onJoin).toHaveBeenCalledWith(7);
});

test('load more appears only while more rows remain', () => {
  const onLoadMore = jest.fn();
  renderPage({ status: 'success', hasMore: true, onLoadMore, matches: [{ id: 1, title: '매치' }] });
  fireEvent.click(screen.getByRole('button', { name: '매치 더 보기' }));
  expect(onLoadMore).toHaveBeenCalledTimes(1);
});

test('profile panel shows member details and the logged-out state', () => {
  const { unmount } = renderPage();
  expect(within(screen.getByRole('region', { name: '내 프로필' })).getByText('로그인 후 확인해 주세요')).toBeInTheDocument();
  unmount();
  renderPage({ profile: { nickname: '호성', region: '마포구', sports: '테니스' } });
  const panel = screen.getByRole('region', { name: '내 프로필' });
  expect(within(panel).getByText('호성')).toBeInTheDocument();
  expect(within(panel).getByText('마포구')).toBeInTheDocument();
  expect(within(panel).getByText('테니스')).toBeInTheDocument();
});

test('recommendation expander appears past two rows and filter toggle counts hidden conditions', () => {
  const row = id => ({ id, title: `매치 ${id}`, startAt: '2026-11-01T19:30:00' });
  const { container } = renderPage({ recommendationStatus: 'success', recommendations: [row(1), row(2), row(3)], filters: { region: '마포구', isFree: 'Y' } });
  const more = screen.getByRole('button', { name: '추천 더 보기' });
  fireEvent.click(more);
  expect(container.querySelector('.ml-board-rows')).toHaveClass('is-all');
  expect(more).toHaveAttribute('aria-expanded', 'true');
  const toggle = screen.getByRole('button', { name: '조건 더 보기 (2)' });
  fireEvent.click(toggle);
  expect(container.querySelector('.ml-filter-row')).toHaveClass('is-open');
  expect(toggle).toHaveTextContent('조건 접기');
});
