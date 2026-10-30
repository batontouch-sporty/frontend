import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MatchForm from '../components/MatchForm';
import MatchCreatePage from '../pages/MatchCreatePage';
import { initialMatchValues, validateMatch, toMatchPayload } from './matchValidation';
import { prepareAiMatchDraft } from './aiMatchDraft';

const match = { serviceId: 1, title: '주말 풋살', description: '함께 운동해요', startAt: '2026-09-26T19:00', endAt: '2026-09-26T21:00', sportType: 'FUTSAL', skillLevel: 'BEGINNER', maxParticipant: 12 };

test.each(['MALE', 'FEMALE', 'MIXED'])('validates and submits selected gender %s', async genderGroup => {
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  render(<MatchForm initialValues={match} onSubmit={onSubmit} />);
  fireEvent.change(screen.getByRole('combobox', { name: '성별 구성' }), { target: { value: genderGroup } });
  fireEvent.click(screen.getByRole('button', { name: '매치 개설 완료하기' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ ...match, genderGroup }));
});

test.each(['', 'male', 'female', 'mixed', undefined, null, 123])('rejects invalid gender %p', genderGroup => {
  expect(validateMatch({ ...initialMatchValues(match), genderGroup }).genderGroup).toBe('성별 구성을 선택해주세요.');
});

test('AI gender survives draft mapping, form initialization and payload conversion', () => {
  const aiDraft = prepareAiMatchDraft('여성 풋살', { initialValues: { ...match, genderGroup: 'FEMALE' }, facility: { serviceId: 1, name: '풋살장' } });
  expect(toMatchPayload(initialMatchValues(aiDraft.initialValues)).genderGroup).toBe('FEMALE');
  render(<MemoryRouter initialEntries={[{ pathname: '/matches/new', state: { aiDraft } }]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MatchCreatePage /></MemoryRouter>);
  expect(screen.getByRole('combobox', { name: '성별 구성' })).toHaveValue('FEMALE');
  expect(screen.getByLabelText('매치 제목')).toHaveValue(match.title);
});
