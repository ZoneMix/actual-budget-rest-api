/**
 * Rule operations against the Actual engine.
 */

import logger from '../../logging/logger.js';
import { NotFoundError } from '../../errors/index.js';
import { runWithApi } from './runner.js';

// The engine rejects a rule with no stage; Actual's own UI treats an unset
// stage as the middle one.
const DEFAULT_RULE_STAGE = 'default';

export const rulesList = async () => {
  return runWithApi('rulesList', async (apiInstance) => {
    logger.debug('[Actual] Getting rules list');
    const rules = await apiInstance.getRules();
    logger.info('[Actual] rulesList result', { count: rules.length });
    return rules;
  });
};

export const payeeRulesList = async (payeeId) => {
  return runWithApi('payeeRulesList', async (apiInstance) => {
    logger.debug('[Actual] Getting payee rules', { payeeId });
    const rules = await apiInstance.getPayeeRules(payeeId);
    logger.info('[Actual] payeeRulesList result', { payeeId, count: rules.length });
    return rules;
  });
};

export const ruleCreate = async (rule) => {
  return runWithApi(
    'ruleCreate',
    async (apiInstance) => {
      logger.debug('[Actual] Creating rule', { ruleStage: rule.stage });
      const result = await apiInstance.createRule(rule);
      logger.info('[Actual] ruleCreate result', { ruleId: result.id, ruleStage: rule.stage });
      return result;
    },
    { mode: 'write' }
  );
};

/**
 * Updates a rule.
 *
 * The SDK has no (id, fields) overload: updateRule takes the WHOLE rule and
 * replaces it (@actual-app/api/@types/methods.d.ts:115, dist/index.js:130640).
 * A partial update therefore has to be merged onto the current rule first.
 * The read and the write share one runWithApi call so the engine queue cannot
 * interleave another operation between them, and `syncBefore` forces a sync
 * ahead of the read so the merge is never built on a copy that is behind the
 * server — the post-write sync would otherwise push the clobbered rule
 * upstream.
 */
export const ruleUpdate = async (id, fields) => {
  return runWithApi(
    'ruleUpdate',
    async (apiInstance) => {
      logger.debug('[Actual] Updating rule', { ruleId: id });
      const rules = await apiInstance.getRules();
      const existing = rules.find((rule) => rule.id === id);

      if (!existing) {
        logger.warn('[Actual] Rule not found for ruleUpdate', { ruleId: id, ruleCount: rules.length });
        throw new NotFoundError(`Rule ${id}`);
      }

      // New object: the entry inside `rules` is never mutated. `id` sits after
      // the spread so a client cannot retarget the write through the body.
      const merged = {
        ...existing,
        ...fields,
        id,
        stage: fields.stage ?? existing.stage ?? DEFAULT_RULE_STAGE,
      };

      const result = await apiInstance.updateRule(merged);
      logger.info('[Actual] ruleUpdate completed', { ruleId: id, stage: merged.stage });
      return result;
    },
    { mode: 'write', syncBefore: true }
  );
};

export const ruleDelete = async (id) => {
  return runWithApi(
    'ruleDelete',
    async (apiInstance) => {
      logger.debug('[Actual] Deleting rule', { ruleId: id });
      const result = await apiInstance.deleteRule(id);
      logger.info('[Actual] ruleDelete completed', { ruleId: id, result });
      return result;
    },
    { mode: 'write' }
  );
};
