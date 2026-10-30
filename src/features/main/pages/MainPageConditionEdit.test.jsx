import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MainPage from './MainPage';
import api from '../../../api/axios';

// AISearchBox, AIConditionSummary, AIConditionEditor는 실제 컴포넌트를 사용하고 서버 호출만 대체한다.
jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/MatchListSection', () => () => null);

const INPUT_LABEL = '원하는 매치 조건을 자연스럽게 설명해 주세요';
const SEARCH_RESPONSE = {
  conditions: [{ label: '종목', value: '풋살' }, { label: '자치구', value: '송파구' }, { label: '실력 수준', value: '초급' }],
  matches: [],
  criteria: { sportType: 'FUTSAL', genderGroup: null, region: '송파구', startAt: null, endAt: null, skillLevel: 'BEGINNER', status: null },
};

afterEach(() => jest.clearAllMocks());

async function searchAndOpenEditor() {
  api.post.mockResolvedValue({ data: SEARCH_RESPONSE });
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MainPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText(INPUT_LABEL), { target: { value: '송파구 초보 풋살' } });
  fireEvent.click(screen.getByRole('button', { name: 'AI 매치 검색' }));
  fireEvent.click(await screen.findByRole('button', { name: /조건 직접 수정/ }));
  return screen.getByRole('form', { name: '맞춤 조건 직접 수정' });
}

test('[AI-02] AI 검색 후 조건 직접 수정을 누르면 AI가 분석한 조건이 폼에 채워진다', async () => {
  const form = within(await searchAndOpenEditor());

  expect(form.getByLabelText('종목')).toHaveValue('FUTSAL');
  expect(form.getByLabelText('자치구')).toHaveValue('송파구');
  expect(form.getByLabelText('실력 수준')).toHaveValue('BEGINNER');
  expect(form.getByLabelText('성별')).toHaveValue('');
});

test('[AI-02] 조건을 바꿔 적용하면 AI 없이 일반 매치 검색을 다시 호출하고 요약을 갱신한다', async () => {
  const form = within(await searchAndOpenEditor());
  api.get.mockResolvedValue({ data: [] });

  fireEvent.change(form.getByLabelText('종목'), { target: { value: 'BASKETBALL' } });
  fireEvent.click(form.getByRole('button', { name: '이 조건으로 다시 찾기' }));

  const summary = within(await screen.findByRole('region', { name: 'AI가 분석한 나의 맞춤 조건' }));
  expect(api.get).toHaveBeenCalledWith('/api/matches', { params: { sportType: 'BASKETBALL', region: '송파구', skillLevel: 'BEGINNER' } });
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(summary.getByText('농구')).toBeInTheDocument();
});

test('[AI-02] AI 검색 전에도 빈 조건으로 직접 수정해 검색하고 예시 안내를 내린다', async () => {
  api.get.mockResolvedValue({ data: [] });
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MainPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: /조건 직접 수정/ }));
  const form = within(screen.getByRole('form', { name: '맞춤 조건 직접 수정' }));

  expect(form.getByLabelText('종목')).toHaveValue('');
  fireEvent.change(form.getByLabelText('종목'), { target: { value: 'TENNIS' } });
  fireEvent.click(form.getByRole('button', { name: '이 조건으로 다시 찾기' }));

  const summary = within(await screen.findByRole('region', { name: 'AI가 분석한 나의 맞춤 조건' }));
  expect(api.get).toHaveBeenCalledWith('/api/matches', { params: { sportType: 'TENNIS' } });
  expect(api.post).not.toHaveBeenCalled();
  expect(summary.getByText('테니스')).toBeInTheDocument();
  expect(screen.queryByText(/예시 매치 3개입니다/)).not.toBeInTheDocument();
});

test('[AI-02] AI가 추출한 모집 상태도 요약과 폼에 보이고, 미지정으로 바꾸면 재검색에서 뺀다', async () => {
  api.post.mockResolvedValue({ data: {
    ...SEARCH_RESPONSE,
    conditions: [...SEARCH_RESPONSE.conditions, { label: '모집 상태', value: '모집중' }],
    criteria: { ...SEARCH_RESPONSE.criteria, status: 'RECRUITING' },
  } });
  api.get.mockResolvedValue({ data: [] });
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MainPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText(INPUT_LABEL), { target: { value: '송파구 초보 풋살 모집중' } });
  fireEvent.click(screen.getByRole('button', { name: 'AI 매치 검색' }));

  const before = within(await screen.findByRole('region', { name: 'AI가 분석한 나의 맞춤 조건' }));
  expect(before.getByText('모집중')).toBeInTheDocument();
  fireEvent.click(before.getByRole('button', { name: /조건 직접 수정/ }));
  const form = within(screen.getByRole('form', { name: '맞춤 조건 직접 수정' }));
  expect(form.getByLabelText('모집 상태')).toHaveValue('RECRUITING');

  fireEvent.change(form.getByLabelText('모집 상태'), { target: { value: '' } });
  fireEvent.click(form.getByRole('button', { name: '이 조건으로 다시 찾기' }));

  const after = within(await screen.findByRole('region', { name: 'AI가 분석한 나의 맞춤 조건' }));
  expect(api.get).toHaveBeenCalledWith('/api/matches', { params: { sportType: 'FUTSAL', region: '송파구', skillLevel: 'BEGINNER' } });
  expect(after.queryByText('모집중')).not.toBeInTheDocument();
});

test('[AI-02] 재검색에 실패하면 폼 안에 오류를 보여주고 폼을 유지한다', async () => {
  const form = within(await searchAndOpenEditor());
  api.get.mockRejectedValue(new Error('network'));

  fireEvent.click(form.getByRole('button', { name: '이 조건으로 다시 찾기' }));

  expect(await form.findByRole('alert')).toHaveTextContent('매치를 다시 찾지 못했습니다.');
  expect(form.getByLabelText('종목')).toHaveValue('FUTSAL');
});
