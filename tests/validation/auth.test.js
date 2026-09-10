import { LoginSchema, LogoutSchema } from '../../src/validation/auth.js';

describe('auth schemas (unchanged, re-homed)', () => {
  it('LoginSchema accepts username+password', () => {
    expect(LoginSchema.safeParse({ username: 'a', password: 'b' }).success).toBe(true);
  });

  it('LoginSchema accepts a refresh_token alone', () => {
    expect(LoginSchema.safeParse({ refresh_token: 'r' }).success).toBe(true);
  });

  it('LoginSchema rejects an empty body', () => {
    expect(LoginSchema.safeParse({}).success).toBe(false);
  });

  it('LogoutSchema accepts an empty body', () => {
    expect(LogoutSchema.safeParse({}).success).toBe(true);
  });
});
