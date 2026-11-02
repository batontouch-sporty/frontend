import { prepareAiMatchDraft } from './aiMatchDraft';
import { initialMatchValues } from './matchValidation';

test.each(['MALE', 'FEMALE', 'MIXED'])('preserves gender %s in the AI draft', genderGroup => {
  const draft = prepareAiMatchDraft('매치 만들어줘', { initialValues: { genderGroup, title: '풋살', serviceId: 99, extra: true } });
  expect(draft.initialValues).toEqual({ genderGroup, title: '풋살' });
  expect(draft.interpreted).toBe(true);
  expect(draft.facility).toBeUndefined();
});

test.each([null, 123, {}, []])('does not copy a non-string gender %p', genderGroup => {
  expect(prepareAiMatchDraft('매치', { initialValues: { genderGroup } }).initialValues).not.toHaveProperty('genderGroup');
});

test('keeps an uninterpreted prompt without inventing conditions', () => {
  expect(prepareAiMatchDraft('여성 풋살')).toEqual({ prompt: '여성 풋살', initialValues: {}, facility: undefined, interpreted: false });
});

test.each([[2, 2], [10, 10]])('copies maxParticipant %p when it is 2 or more', (value, expected) => {
  expect(prepareAiMatchDraft('매치', { initialValues: { maxParticipant: value } }).initialValues.maxParticipant).toBe(expected);
});

test.each([0, 1, -3, 1.5])('clears maxParticipant %p below 2 so the form starts empty', value => {
  expect(prepareAiMatchDraft('매치', { initialValues: { maxParticipant: value } }).initialValues.maxParticipant).toBe('');
});

test('keeps the form default when AI did not mention maxParticipant', () => {
  const draft = prepareAiMatchDraft('매치', { initialValues: { sportType: 'FUTSAL' } });
  expect(draft.initialValues).not.toHaveProperty('maxParticipant');
  expect(initialMatchValues(draft.initialValues).maxParticipant).toBe(12);
});

test('shows an empty maxParticipant in the form when AI gave less than 2', () => {
  const draft = prepareAiMatchDraft('매치', { initialValues: { maxParticipant: 1 } });
  expect(initialMatchValues(draft.initialValues).maxParticipant).toBe('');
});
