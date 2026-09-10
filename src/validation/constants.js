/**
 * Shared literal lists for validation schemas — the single source of truth
 * for every enum used across more than one schema file.
 */

// Fields a rule condition/action may reference — FIELD_INFO's keys
// (node_modules/@actual-app/api/dist/index.js:104756-104789).
export const RULE_FIELDS = [
  'imported_payee', 'payee', 'payee_name', 'date', 'notes', 'amount',
  'category', 'category_group', 'account', 'cleared', 'reconciled',
  'saved', 'transfer', 'parent',
];

// Condition operators — union of every TYPE_INFO[*].ops array
// (dist/index.js:104695-104754), cross-checked against the exported
// RuleConditionEntity op union in
// node_modules/@actual-app/core/@types/src/types/models/rule.d.ts:49
// (identical set). 'and' is deliberately excluded: it is only ever
// synthesised internally by the engine for category/category_group
// conditions (FIELD_INFO.category.internalOps, dist/index.js:104775,
// 104780; validated in Condition's constructor via isValidOp,
// dist/index.js:104791-104796/108646) when normalising a
// category-is-empty condition (dist/index.js:109487-109492) — it never
// appears in RuleConditionEntity's public op union, so a REST client
// should never author it directly.
export const RULE_CONDITION_OPS = [
  'is', 'isNot', 'oneOf', 'notOneOf', 'contains', 'doesNotContain', 'matches',
  'gt', 'gte', 'lt', 'lte', 'isapprox', 'isbetween', 'hasTags', 'hasAnyTag',
  'onBudget', 'offBudget',
];

// Action operators — ACTION_OPS (dist/index.js:108287-108294), matches
// RuleActionEntity's op union exactly (rule.d.ts:50).
export const RULE_ACTION_OPS = [
  'set', 'set-split-amount', 'link-schedule', 'prepend-notes', 'append-notes', 'delete-transaction',
];

// APIRuleEntity adds 'default' on top of RuleEntity['stage'] ('pre'|null|'post')
// (node_modules/@actual-app/core/@types/src/server/api-models.d.ts:71-73).
export const RULE_STAGES = ['pre', 'default', 'post'];

// OAuth client scopes (this wrapper's own admin API, not an Actual SDK concept).
export const SCOPES = ['read', 'write', 'admin', 'api'];

// ActualQL read-only table whitelist — unchanged from the pre-Phase-E schema.
export const QUERY_TABLES = [
  'transactions', 'accounts', 'categories', 'category_groups',
  'payees', 'schedules', 'rules', 'budgets', 'budget_months',
];

// TransactionsImportSchema.opts.payeeNameNormalization values.
export const PAYEE_NAME_NORMALIZATIONS = ['title-case', 'original'];
