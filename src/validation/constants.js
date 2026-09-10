/**
 * Every enum literal used by a validation schema lives here — the single
 * source of truth, whether it's shared by several schema files or used by
 * only one. Schema files import from here rather than inlining a literal
 * array; see tests/validation/constants.test.js for how the rule-engine
 * lists are pinned against the installed SDK.
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

// A rule's `conditionsOp` (how its `conditions` combine) — NewRuleEntity
// ['conditionsOp'] (rule.d.ts:4): 'or' | 'and'.
export const RULE_CONDITIONS_OP = ['and', 'or'];

// RuleConditionSchema/RuleActionSchema's optional `type` hint — the four
// primitive value kinds Condition/Action parse against, plus 'id'
// (BaseConditionEntity['type'], rule.d.ts:43).
export const RULE_CONDITION_VALUE_TYPES = ['id', 'string', 'number', 'date', 'boolean'];

// ScheduleDateSchema's recurring-date `frequency`.
export const SCHEDULE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

// ScheduleDateSchema's recurring-date `weekendSolveMode`.
export const SCHEDULE_WEEKEND_SOLVE_MODES = ['before', 'after'];

// CreateScheduleSchema/UpdateScheduleSchema's `amountOp` — AmountOPType
// (api-models.d.ts:97): 'is' | 'isapprox' | 'isbetween'.
export const SCHEDULE_AMOUNT_OPS = ['is', 'isapprox', 'isbetween'];

// QuerySchema's `options.splits`.
export const QUERY_SPLIT_MODES = ['inline', 'grouped', 'all'];

// OAuth client scopes (this wrapper's own admin API, not an Actual SDK concept).
export const SCOPES = ['read', 'write', 'admin', 'api'];

// ActualQL read-only table whitelist — unchanged from the pre-Phase-E schema.
export const QUERY_TABLES = [
  'transactions', 'accounts', 'categories', 'category_groups',
  'payees', 'schedules', 'rules', 'budgets', 'budget_months',
];

// TransactionsImportSchema.opts.payeeNameNormalization values.
export const PAYEE_NAME_NORMALIZATIONS = ['title-case', 'original'];
