/**
 * Rule schemas — field/op/type enums come from constants.js, derived from
 * the real @actual-app/api rule engine (see constants.js for line
 * references; tests/validation/constants.test.js pins them against the
 * installed SDK's own source).
 */
import { z } from 'zod';
import { atLeastOneKey } from './common.js';
import {
  RULE_FIELDS, RULE_CONDITION_OPS, RULE_ACTION_OPS, RULE_STAGES,
  RULE_CONDITIONS_OP, RULE_CONDITION_VALUE_TYPES,
} from './constants.js';

export const RuleConditionSchema = z.object({
  field: z.enum(RULE_FIELDS),
  op: z.enum(RULE_CONDITION_OPS),
  value: z.unknown(),
  type: z.enum(RULE_CONDITION_VALUE_TYPES).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

export const RuleActionSchema = z.object({
  op: z.enum(RULE_ACTION_OPS),
  field: z.string().optional(),
  value: z.unknown().optional(),
  type: z.string().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

const ConditionsSchema = z.array(RuleConditionSchema).min(1);
const ActionsSchema = z.array(RuleActionSchema).min(1);
const ConditionsOpSchema = z.enum(RULE_CONDITIONS_OP);

export const CreateRuleSchema = z.object({
  rule: z.object({
    stage: z.enum(RULE_STAGES).default('default'),
    conditionsOp: ConditionsOpSchema.optional(),
    conditions: ConditionsSchema,
    actions: ActionsSchema,
  }),
});

export const UpdateRuleSchema = z.object({
  // stage has no .default() here on purpose: a default would silently
  // inject `stage: 'default'` into a partial update that never touched it.
  fields: atLeastOneKey(z.object({
    stage: z.enum(RULE_STAGES).optional(),
    conditionsOp: ConditionsOpSchema.optional(),
    conditions: ConditionsSchema.optional(),
    actions: ActionsSchema.optional(),
  })),
});
