import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MatchListView as MatchListPage } from './MatchListPage';

function renderPage(props = {}) {
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MatchListPage {...props} /></MemoryRouter>);
}

test('sports apply directly and region and fee controls are enabled', () => {
  const onSportChange = jest.fn();
  const onFilterChange = jest.fn();
  renderPage({ onSportChange, onFilterChange, profileStatus: 'loading' });
  expect(screen.getByText('프로필 불러오는 중')).toBeInTheDocument();
  expect(screen.queryByText('로그인 후 확인해주세요')).not.toBeInTheDocument();
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

test('preview data cannot trigger participation or navigate to fictional match IDs', () => {
  const onJoin = jest.fn();
  renderPage({ preview: true, onJoin });
  expect(screen.getByRole('note')).toHaveTextContent('실제 모집 정보가 아니며');
  expect(screen.getAllByRole('article')).toHaveLength(9);
  screen.getAllByRole('button', { name: '참가 신청하기' }).forEach(button => {
    expect(button).toBeDisabled();
    fireEvent.click(button);
  });
  expect(onJoin).not.toHaveBeenCalled();
  expect(screen.queryByRole('link', { name: /상세 보기/ })).not.toBeInTheDocument();
});

test('real empty results do not fall back to preview data', () => {
  renderPage({ preview: false, status: 'success', recommendationStatus: 'success' });
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(screen.getByText(/조건에 맞는 매치가 없습니다/)).toBeInTheDocument();
  expect(screen.getByText('추천 매치가 없습니다.')).toBeInTheDocument();
});

test('list failure and retry are independent from recommendation loading', () => {
  const onRetry = jest.fn();
  renderPage({ preview: false, status: 'error', recommendationStatus: 'loading', onRetry });
  expect(screen.getByRole('status')).toHaveTextContent('추천 매치를 찾고 있습니다.');
  fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: '다시 시도' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('real cards pass match IDs to the callback and prevent joining closed matches', () => {
  const onJoin = jest.fn();
  renderPage({ preview: false, onJoin, matches: [
    { id: 42, title: '열린 매치', status: '모집중' },
    { id: 43, title: '마감 매치', status: '마감', closed: true },
  ] });
  fireEvent.click(screen.getByRole('button', { name: '참가 신청하기' }));
  expect(onJoin).toHaveBeenCalledWith(42);
  expect(screen.getByRole('button', { name: '모집 마감' })).toBeDisabled();
  expect(screen.getByRole('link', { name: '열린 매치 상세 보기' })).toHaveAttribute('href', '/matches/42');
});
