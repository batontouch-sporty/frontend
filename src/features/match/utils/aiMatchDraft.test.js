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
  expect(prepareAiMatchDraft('여성 풋살')).toEqual({ prompt: '여성 풋살', initialValues: {}, facility: undefined, facilityCandidates: [], interpreted: false });
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

test('maps AI facility candidates to selectable facilities and drops malformed ones', () => {
  const draft = prepareAiMatchDraft('송파 농구', { initialValues: { sportType: 'BASKETBALL' }, facilityCandidates: [
    { id: 304, name: '2026년 농구장4-광나루한강공원', locationName: '광나루 농구장', region: '송파구', isFree: false },
    { id: 0, name: 'ID가 잘못된 시설' },
    { id: 317, name: '' },
    null,
    { id: 305, name: '2026년 농구장3-광나루한강공원' },
  ] });
  expect(draft.facilityCandidates).toEqual([
    { serviceId: 304, name: '2026년 농구장4-광나루한강공원', region: '송파구', locationName: '광나루 농구장' },
    { serviceId: 305, name: '2026년 농구장3-광나루한강공원', region: '', locationName: '' },
  ]);
});

test.each([undefined, null, {}, '시설'])('treats missing or invalid facilityCandidates %p as no candidates', candidates => {
  expect(prepareAiMatchDraft('농구', { initialValues: {}, facilityCandidates: candidates }).facilityCandidates).toEqual([]);
});

test('keeps at most five facility candidates', () => {
  const candidates = Array.from({ length: 7 }, (_, index) => ({ id: index + 1, name: `시설 ${index + 1}` }));
  expect(prepareAiMatchDraft('농구', { initialValues: {}, facilityCandidates: candidates }).facilityCandidates).toHaveLength(5);
});
