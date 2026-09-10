/**
 * Authorization-code expiry.
 *
 * A code is valid for ten minutes, and that ceiling used to be enforced ONLY by
 * `pruneExpiredCodes()` deleting the row: the lookup itself matched on code,
 * client and redirect_uri with no predicate on `expires_at`. Expiry is a
 * security property of the grant, so it belongs in the query that reads the
 * row, not in a housekeeping delete that happens to run first.
 *
 * `getUnexpiredAuthCode` is exercised directly here on purpose —
 * `validateAuthCode` prunes before it reads, so going through it would delete
 * the very row under test and pass either way.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import crypto from 'crypto';
import { executeQuery, getRow, getUnexpiredAuthCode } from '../../src/db/authDb.js';
import { validateAuthCode } from '../../src/auth/oauth2/code.js';

const REDIRECT_URI = 'http://localhost:5678/rest/oauth2-credential/callback';
const CLIENT_ID = 'test-code-expiry-client';

/** A 64-hex code, the format validateAuthCode requires. */
const freshCode = () => crypto.randomBytes(32).toString('hex');

/** Insert a code that expires `offsetMs` from now (negative = already expired). */
const insertCode = async (code, offsetMs) => {
  await executeQuery(
    `INSERT INTO auth_codes (code, client_id, user_id, redirect_uri, scope, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [code, CLIENT_ID, 1, REDIRECT_URI, 'api', new Date(Date.now() + offsetMs).toISOString()]
  );
};

describe('getUnexpiredAuthCode', () => {
  beforeEach(async () => {
    await executeQuery('DELETE FROM auth_codes WHERE client_id = ?', [CLIENT_ID]);
  });

  it('returns a code that has not expired yet', async () => {
    const code = freshCode();
    await insertCode(code, 10 * 60 * 1000);

    const row = await getUnexpiredAuthCode(code, CLIENT_ID, REDIRECT_URI);

    expect(row).toMatchObject({ user_id: 1, scope: 'api' });
  });

  it('does not return a code that expired, even though the row is still there', async () => {
    const code = freshCode();
    await insertCode(code, -60 * 1000);

    // The row exists: nothing has pruned it. Only the predicate can reject it.
    expect(await getRow('SELECT code FROM auth_codes WHERE code = ?', [code])).toBeTruthy();
    expect(await getUnexpiredAuthCode(code, CLIENT_ID, REDIRECT_URI)).toBeNull();
  });

  it('still requires the code, client and redirect_uri to match', async () => {
    const code = freshCode();
    await insertCode(code, 10 * 60 * 1000);

    expect(await getUnexpiredAuthCode(code, 'another-client', REDIRECT_URI)).toBeNull();
    expect(await getUnexpiredAuthCode(code, CLIENT_ID, 'http://evil.example/cb')).toBeNull();
  });
});

describe('validateAuthCode', () => {
  beforeEach(async () => {
    await executeQuery('DELETE FROM auth_codes WHERE client_id = ?', [CLIENT_ID]);
  });

  it('rejects an expired code', async () => {
    const code = freshCode();
    await insertCode(code, -60 * 1000);

    await expect(validateAuthCode(code, CLIENT_ID, REDIRECT_URI))
      .rejects.toThrow('Invalid or expired authorization code');
  });

  it('consumes a live code exactly once', async () => {
    const code = freshCode();
    await insertCode(code, 10 * 60 * 1000);

    await expect(validateAuthCode(code, CLIENT_ID, REDIRECT_URI))
      .resolves.toEqual({ userId: 1, scope: 'api' });
    await expect(validateAuthCode(code, CLIENT_ID, REDIRECT_URI))
      .rejects.toThrow('Invalid or expired authorization code');
  });

  it('rejects anything that is not 64 hex characters before touching the DB', async () => {
    await expect(validateAuthCode('not-a-code', CLIENT_ID, REDIRECT_URI))
      .rejects.toThrow('Invalid authorization code format');
  });
});
