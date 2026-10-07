import { describe, expect, it } from 'vitest';
import { errMsg } from '../api/client.js';

// Rendering the raw `error` object crashed screens to blank; errMsg must always return a string.
describe('errMsg', () => {
  const res = (error) => ({ response: { data: { success: false, error } } });
  it('reads string, object and zod-issue error shapes', () => {
    expect(errMsg(res('Request not found'))).toBe('Request not found');
    expect(errMsg(res({ code: 'DONOR_NOT_ELIGIBLE', message: 'Not eligible yet' }))).toBe('Not eligible yet');
    expect(errMsg(res({ code: 'VALIDATION_ERROR', message: 'Invalid request', issues: [{ message: 'Too short' }, { message: 'Bad email' }] })))
      .toBe('Too short. Bad email');
  });
  it('falls back for network errors and unknown shapes', () => {
    expect(errMsg({ code: 'ERR_NETWORK' })).toMatch(/network/i);
    expect(errMsg(res({ code: 'X' }), 'fallback')).toBe('fallback');
    expect(typeof errMsg(undefined)).toBe('string');
  });
});
