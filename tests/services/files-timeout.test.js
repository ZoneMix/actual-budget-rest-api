/**
 * The load/export timeout budget.
 *
 * `POST /v2/budget/load` and `GET /v2/budget/export` are network-bound and can
 * legitimately outrun ACTUAL_OP_TIMEOUT_MS (60 s). A timeout does NOT cancel
 * the engine call — the queue slot stays held until it settles (queue.js
 * `withTimeout`) — so timing one of these out wedges the queue for as long as
 * the engine takes. They get their own, longer ACTUAL_LOAD_TIMEOUT_MS instead.
 *
 * The runner is mocked here because the option is invisible from outside: a
 * 300 s budget has no observable effect inside a test.
 */

import { jest } from '@jest/globals';

const runWithApi = jest.fn(async (_label, fn) => fn({
  loadBudget: jest.fn(),
  exportBudget: jest.fn(),
  getBudgets: jest.fn(async () => []),
}));

jest.unstable_mockModule('../../src/services/actual/runner.js', () => ({ runWithApi }));

const { budgetLoad, budgetExport, budgetFilesList } = await import('../../src/services/actual/files.js');
const { ACTUAL_LOAD_TIMEOUT_MS, ACTUAL_OP_TIMEOUT_MS } = await import('../../src/config/index.js');

const optionsFor = (label) => runWithApi.mock.calls.find(([name]) => name === label)?.[2];

describe('budget load/export timeout budget', () => {
  beforeEach(() => {
    runWithApi.mockClear();
  });

  it('is longer than the ordinary per-operation timeout', () => {
    expect(ACTUAL_LOAD_TIMEOUT_MS).toBeGreaterThan(ACTUAL_OP_TIMEOUT_MS);
  });

  it('budgetLoad runs under ACTUAL_LOAD_TIMEOUT_MS, still as a write', async () => {
    await budgetLoad('c3d4e5f6-9999-40a1-b2c3-d4e5f6708192');

    expect(optionsFor('budgetLoad')).toStrictEqual({ mode: 'write', timeoutMs: ACTUAL_LOAD_TIMEOUT_MS });
  });

  it('budgetExport runs under ACTUAL_LOAD_TIMEOUT_MS', async () => {
    await budgetExport();

    expect(optionsFor('budgetExport')).toStrictEqual({ timeoutMs: ACTUAL_LOAD_TIMEOUT_MS });
  });

  it('leaves an ordinary file operation on the default timeout', async () => {
    await budgetFilesList();

    expect(optionsFor('budgetFilesList')?.timeoutMs).toBeUndefined();
  });
});
