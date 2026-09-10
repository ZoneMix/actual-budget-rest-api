/**
 * Rule schemas — field/op enums come from constants.js, derived from the
 * real @actual-app/api rule engine (see constants.js for line references).
 */
import { z } from 'zod';
import { RULE_FIELDS, RULE_CONDITION_OPS, RULE_ACTION_OPS, RULE_STAGES } from './constants.js';

const CONDITION_VALUE_TYPES = ['id', 'string', 'number', 'date', 'boolean'];

export const RuleConditionSchema = z.object({
  field: z.enum(RULE_FIELDS),
  op: z.enum(RULE_CONDITION_OPS),
  value: z.unknown(),
  type: z.enum(CONDITION_VALUE_TYPES).optional(),
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
const ConditionsOpSchema = z.enum(['and', 'or']);

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
  fields: z.object({
    stage: z.enum(RULE_STAGES).optional(),
    conditionsOp: ConditionsOpSchema.optional(),
    conditions: ConditionsSchema.optional(),
    actions: ActionsSchema.optional(),
  }).refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field must be updated' }),
});
