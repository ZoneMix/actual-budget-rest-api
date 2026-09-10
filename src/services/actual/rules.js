/**
 * Rule operations against the Actual engine.
 */

import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';

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

export const ruleUpdate = async (id, fields) => {
  return runWithApi(
    'ruleUpdate',
    async (apiInstance) => {
      logger.debug('[Actual] Updating rule', { ruleId: id });
      const result = await apiInstance.updateRule(id, fields);
      logger.info('[Actual] ruleUpdate completed', { ruleId: id, result });
      return result;
    },
    { mode: 'write' }
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
