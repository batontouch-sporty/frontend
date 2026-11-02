import api from '../../../api/axios';
import { registerWaitlist, cancelWaitlist } from './waitlistApi';

jest.mock('../../../api/axios', () => ({ post: jest.fn(), delete: jest.fn() }));
afterEach(() => jest.resetAllMocks());

test('registers with A18 and returns the server position', async () => {
  const data = { matchId: 42, userId: 7, position: 2, registeredAt: '2099-01-01T12:00:00' };
  api.post.mockResolvedValue({ status: 201, data });
  await expect(registerWaitlist('42')).resolves.toEqual(data);
  expect(api.post).toHaveBeenCalledWith('/api/matches/42/waitlist');
});

test.each([{ status: 200, data: {} }, { status: 201, data: { matchId: 9, position: 1 } },
  { status: 201, data: { matchId: 42, position: 0 } }])('does not invent registration success for %p', async response => {
  api.post.mockResolvedValue(response);
  await expect(registerWaitlist(42)).rejects.toThrow('결과를 확인');
});

test('cancels only own waitlist entry with A19 and requires 204', async () => {
  api.delete.mockResolvedValue({ status: 204 });
  await expect(cancelWaitlist(42)).resolves.toBeUndefined();
  expect(api.delete).toHaveBeenCalledWith('/api/matches/42/waitlist/me');
  api.delete.mockResolvedValue({ status: 200 });
  await expect(cancelWaitlist(42)).rejects.toThrow('취소 결과');
});

test('preserves server errors for status-specific UI', async () => {
  const error = { response: { status: 409, data: { code: 'WAITLIST_ALREADY_JOINED' } } };
  api.post.mockRejectedValue(error);
  await expect(registerWaitlist(42)).rejects.toBe(error);
});
