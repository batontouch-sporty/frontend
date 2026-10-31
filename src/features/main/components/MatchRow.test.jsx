import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MatchRow from './MatchRow';

const base = { id: 3, title: '성수 저녁 풋살', format: '풋살', region: '성동구', level: '루키', genderGroupLabel: '혼성', isFree: true, startAt: '2026-11-01T19:30:00', currentParticipant: 7, maxParticipant: 12 };
const show = props => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MatchRow match={base} {...props} /></MemoryRouter>);

test('시각, 제목, 남은 자리, 인원을 함께 보여 주고 참가를 부모에게 넘긴다', () => {
  const onJoin = jest.fn();
  show({ onJoin });
  expect(screen.getByText('19:30')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '성수 저녁 풋살' })).toHaveAttribute('href', '/matches/3');
  expect(screen.getByText('5자리 남음')).toBeInTheDocument();
  expect(screen.getByText('7/12명')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '12명 중 7명 참여');
  fireEvent.click(screen.getByRole('button', { name: '참가' }));
  expect(onJoin).toHaveBeenCalledWith(base);
});

test.each([
  [11, true],
  [10, false],
])('%i명이면 마지막 자리 강조 %s', (currentParticipant, last) => {
  const { container } = show({ match: { ...base, currentParticipant } });
  expect(container.querySelector('.match-row-seats').classList.contains('is-last')).toBe(last);
});

test('정원이 차면 마감으로 표시하고 참가를 막는다', () => {
  show({ match: { ...base, currentParticipant: 12 }, onJoin: jest.fn() });
  expect(screen.getByText('마감')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '모집 마감' })).toBeDisabled();
});

test('신청이 끝나면 취소 경로를 안내한다', () => {
  show({ joinState: { status: 'done' }, onJoin: jest.fn() });
  expect(screen.getByRole('button', { name: '신청 완료' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('취소는 매치 상세에서 해요.');
});

test('새로고침으로 복원한 신청은 버튼만 보여 준다', () => {
  show({ joinState: { status: 'done', restored: true }, onJoin: jest.fn() });
  expect(screen.getByRole('button', { name: '신청 완료' })).toBeDisabled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('내가 만든 매치는 참가를 막고 신청 완료로 표시하지 않는다', () => {
  const { container } = show({ joinState: { status: 'owner' }, onJoin: jest.fn() });
  expect(screen.getByRole('button', { name: '내 매치' })).toBeDisabled();
  expect(container.querySelector('.match-row')).not.toHaveClass('is-done');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('인원과 요금을 모르면 추측하지 않고 안내한다', () => {
  show({ match: { ...base, currentParticipant: undefined, maxParticipant: undefined, isFree: null } });
  expect(screen.getByText('인원 정보 없음')).toBeInTheDocument();
  expect(screen.getByText(/요금 정보 없음/)).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});

test('설명은 showDescription을 준 행에만 보여 준다', () => {
  const { unmount } = show({ match: { ...base, description: '초보 환영' } });
  expect(screen.queryByText('초보 환영')).not.toBeInTheDocument();
  unmount();
  show({ match: { ...base, description: '초보 환영' }, showDescription: true });
  expect(screen.getByText('초보 환영')).toBeInTheDocument();
});
