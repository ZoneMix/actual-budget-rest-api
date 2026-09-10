/**
 * Rule service call shapes against @actual-app/api 26.9.0.
 *
 * Upstream signature being pinned here:
 *   updateRule(rule: APIRuleEntity)  — @types/methods.d.ts:115,
 *                                      dist/index.js:130640 (`send('api/rule-update', { rule })`)
 * There is no (id, fields) overload: the SDK replaces the whole rule, so the
 * wrapper has to read the current rule and merge before it writes.
 */

import actualApi, { __reset } from '../mocks/actual-api.js';
import { ruleUpdate } from '../../src/services/actual/rules.js';
import { NotFoundError } from '../../src/errors/index.js';

const CONDITIONS = [{ field: 'payee', op: 'is', value: 'p-1' }];
const ACTIONS = [{ op: 'set', field: 'category', value: 'c-1' }];

const existingRule = (overrides = {}) => ({
  id: 'r-1',
  stage: 'pre',
  conditionsOp: 'and',
  conditions: CONDITIONS,
  actions: ACTIONS,
  ...overrides,
});

describe('rule service call shapes', () => {
  beforeEach(() => {
    __reset();
  });

  it('reads the current rule and writes back one merged whole-rule object', async () => {
    actualApi.getRules.mockResolvedValue([existingRule(), existingRule({ id: 'r-2' })]);

    await ruleUpdate('r-1', { actions: [{ op: 'set', field: 'notes', value: 'x' }] });

    expect(actualApi.getRules).toHaveBeenCalledWith();
    expect(actualApi.updateRule).toHaveBeenCalledWith({
      id: 'r-1',
      stage: 'pre',
      conditionsOp: 'and',
      conditions: CONDITIONS,
      actions: [{ op: 'set', field: 'notes', value: 'x' }],
    });
  });

  it('throws NotFoundError and never writes when the rule is absent', async () => {
    actualApi.getRules.mockResolvedValue([existingRule({ id: 'r-2' })]);

    await expect(ruleUpdate('r-1', { stage: 'post' })).rejects.toThrow(NotFoundError);
    expect(actualApi.updateRule).not.toHaveBeenCalled();
  });

  it('does not mutate the rule object the engine handed back', async () => {
    const original = existingRule();
    const snapshot = JSON.parse(JSON.stringify(original));
    actualApi.getRules.mockResolvedValue([original]);

    await ruleUpdate('r-1', { stage: 'post', conditionsOp: 'or' });

    expect(original).toEqual(snapshot);
    expect(actualApi.updateRule.mock.calls[0][0]).not.toBe(original);
  });

  it('prefers the stage in the update over the existing stage', async () => {
    actualApi.getRules.mockResolvedValue([existingRule({ stage: 'pre' })]);

    await ruleUpdate('r-1', { stage: 'post' });

    expect(actualApi.updateRule).toHaveBeenCalledWith(expect.objectContaining({ stage: 'post' }));
  });

  it('keeps the existing stage when the update omits it', async () => {
    actualApi.getRules.mockResolvedValue([existingRule({ stage: 'post' })]);

    await ruleUpdate('r-1', { conditionsOp: 'or' });

    expect(actualApi.updateRule).toHaveBeenCalledWith(expect.objectContaining({ stage: 'post' }));
  });

  it("falls back to 'default' when neither the update nor the rule has a stage", async () => {
    const { stage: _ignored, ...stageless } = existingRule();
    actualApi.getRules.mockResolvedValue([stageless]);

    await ruleUpdate('r-1', { conditionsOp: 'or' });

    expect(actualApi.updateRule).toHaveBeenCalledWith(expect.objectContaining({ stage: 'default' }));
  });

  it('keeps the path id authoritative over an id smuggled in via fields', async () => {
    actualApi.getRules.mockResolvedValue([existingRule()]);

    await ruleUpdate('r-1', { id: 'r-999', stage: 'post' });

    expect(actualApi.updateRule).toHaveBeenCalledWith(expect.objectContaining({ id: 'r-1' }));
  });
});
