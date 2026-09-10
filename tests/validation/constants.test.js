/**
 * Pins the rule-engine enums to what @actual-app/api actually implements.
 * If the SDK adds/removes a member, this test is the tripwire — see
 * src/validation/constants.js for the dist/index.js line references.
 */
import {
  RULE_FIELDS,
  RULE_CONDITION_OPS,
  RULE_ACTION_OPS,
  RULE_STAGES,
  SCOPES,
  QUERY_TABLES,
  PAYEE_NAME_NORMALIZATIONS,
} from '../../src/validation/constants.js';

describe('rule engine enums (pinned to node_modules/@actual-app/api/dist/index.js)', () => {
  it('RULE_FIELDS matches FIELD_INFO keys (dist/index.js:104756-104789)', () => {
    const expected = [
      'imported_payee', 'payee', 'payee_name', 'date', 'notes', 'amount',
      'category', 'category_group', 'account', 'cleared', 'reconciled',
      'saved', 'transfer', 'parent',
    ];
    expect(RULE_FIELDS.slice().sort()).toEqual(expected.slice().sort());
  });

  it('RULE_CONDITION_OPS matches the union of TYPE_INFO[*].ops (dist/index.js:104695-104754)', () => {
    const expected = [
      'is', 'isNot', 'oneOf', 'notOneOf', 'contains', 'doesNotContain', 'matches',
      'gt', 'gte', 'lt', 'lte', 'isapprox', 'isbetween', 'hasTags', 'hasAnyTag',
      'onBudget', 'offBudget',
    ];
    expect(RULE_CONDITION_OPS.slice().sort()).toEqual(expected.slice().sort());
  });

  it('does not include the internal-only "and" condition op', () => {
    // "and" is synthesised internally by the rule engine (FIELD_INFO.category
    // .internalOps, dist/index.js:104775) — RuleConditionEntity's own public
    // op union (@actual-app/core rule.d.ts:49) never includes it either.
    expect(RULE_CONDITION_OPS).not.toContain('and');
  });

  it('RULE_ACTION_OPS matches ACTION_OPS exactly (dist/index.js:108287-108294)', () => {
    expect(RULE_ACTION_OPS).toEqual([
      'set', 'set-split-amount', 'link-schedule', 'prepend-notes', 'append-notes', 'delete-transaction',
    ]);
  });

  it('RULE_STAGES matches APIRuleEntity[\'stage\'] (api-models.d.ts:71-73)', () => {
    expect(RULE_STAGES.slice().sort()).toEqual(['default', 'post', 'pre']);
  });

  it('SCOPES is the four OAuth client scopes', () => {
    expect(SCOPES).toEqual(['read', 'write', 'admin', 'api']);
  });

  it('QUERY_TABLES is the same nine-table whitelist as before', () => {
    expect(QUERY_TABLES).toEqual([
      'transactions', 'accounts', 'categories', 'category_groups',
      'payees', 'schedules', 'rules', 'budgets', 'budget_months',
    ]);
  });

  it('PAYEE_NAME_NORMALIZATIONS has the two import-opts values', () => {
    expect(PAYEE_NAME_NORMALIZATIONS).toEqual(['title-case', 'original']);
  });
});
