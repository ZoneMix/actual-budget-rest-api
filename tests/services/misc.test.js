/**
 * Cross-cutting engine lookups.
 *
 * Upstream signature being pinned here:
 *   getIDByName(type, name)  — @types/methods.d.ts:125, dist/index.js:130671
 *      (the SDK builds the { type, name } payload itself)
 */

import actualApi, { __reset } from '../mocks/actual-api.js';
import { getIdByName } from '../../src/services/actual/misc.js';

describe('misc service call shapes', () => {
  beforeEach(() => {
    __reset();
  });

  it('calls getIDByName positionally, not with a { type, name } object', async () => {
    await getIdByName('accounts', 'Checking');

    expect(actualApi.getIDByName).toHaveBeenCalledWith('accounts', 'Checking');
  });

  it.each(['accounts', 'schedules', 'categories', 'payees'])(
    'forwards the %s lookup type unchanged',
    async (type) => {
      await getIdByName(type, 'Some Name');

      expect(actualApi.getIDByName).toHaveBeenCalledWith(type, 'Some Name');
    }
  );

  it('resolves with the id the engine returned', async () => {
    actualApi.getIDByName.mockResolvedValueOnce('acc-7');

    await expect(getIdByName('accounts', 'Checking')).resolves.toBe('acc-7');
  });
});
