import { prepareAiMatchDraft } from './aiMatchDraft';

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
