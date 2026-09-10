import {
  RuleConditionSchema,
  RuleActionSchema,
  CreateRuleSchema,
  UpdateRuleSchema,
} from '../../src/validation/rules.js';

const condition = (overrides = {}) => ({
  field: 'amount', op: 'is', value: 100, ...overrides,
});
const action = (overrides = {}) => ({ op: 'set', field: 'category', value: 'cat-1', ...overrides });

describe('rules schemas', () => {
  describe('RuleConditionSchema', () => {
    it('accepts a minimal condition', () => {
      expect(RuleConditionSchema.safeParse(condition()).success).toBe(true);
    });

    it('rejects an unknown field', () => {
      expect(RuleConditionSchema.safeParse(condition({ field: 'not-a-field' })).success).toBe(false);
    });

    it('rejects an unknown op', () => {
      expect(RuleConditionSchema.safeParse(condition({ op: 'not-an-op' })).success).toBe(false);
    });

    it('accepts every documented op for a representative field (id-typed: payee)', () => {
      const idOps = ['is', 'contains', 'matches', 'oneOf', 'isNot', 'doesNotContain', 'notOneOf'];
      idOps.forEach((op) => {
        const value = op === 'oneOf' || op === 'notOneOf' ? ['p1'] : 'p1';
        expect(RuleConditionSchema.safeParse({ field: 'payee', op, value }).success).toBe(true);
      });
    });

    it('accepts optional type and options', () => {
      const result = RuleConditionSchema.safeParse(condition({ type: 'number', options: { inflow: true } }));
      expect(result.success).toBe(true);
    });

    it('rejects an invalid type literal', () => {
      expect(RuleConditionSchema.safeParse(condition({ type: 'float' })).success).toBe(false);
    });
  });

  describe('RuleActionSchema', () => {
    it('accepts a minimal set action', () => {
      expect(RuleActionSchema.safeParse(action()).success).toBe(true);
    });

    it('rejects an unknown op', () => {
      expect(RuleActionSchema.safeParse(action({ op: 'delete' })).success).toBe(false);
    });

    it('accepts every real action op (dist/index.js:108287-108294)', () => {
      const ops = ['set', 'set-split-amount', 'link-schedule', 'prepend-notes', 'append-notes', 'delete-transaction'];
      ops.forEach((op) => {
        expect(RuleActionSchema.safeParse({ op, value: 'x' }).success).toBe(true);
      });
    });

    it('field, value, type and options are all optional', () => {
      expect(RuleActionSchema.safeParse({ op: 'delete-transaction' }).success).toBe(true);
    });
  });

  describe('CreateRuleSchema', () => {
    it('accepts a full rule and defaults stage to "default"', () => {
      const result = CreateRuleSchema.safeParse({
        rule: { conditions: [condition()], actions: [action()] },
      });
      expect(result.success).toBe(true);
      expect(result.data.rule.stage).toBe('default');
    });

    it('accepts an explicit stage and conditionsOp', () => {
      const result = CreateRuleSchema.safeParse({
        rule: {
          stage: 'pre',
          conditionsOp: 'or',
          conditions: [condition()],
          actions: [action()],
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects an empty conditions array', () => {
      const result = CreateRuleSchema.safeParse({ rule: { conditions: [], actions: [action()] } });
      expect(result.success).toBe(false);
    });

    it('rejects an empty actions array', () => {
      const result = CreateRuleSchema.safeParse({ rule: { conditions: [condition()], actions: [] } });
      expect(result.success).toBe(false);
    });

    it('rejects an invalid stage', () => {
      const result = CreateRuleSchema.safeParse({
        rule: { stage: 'bogus', conditions: [condition()], actions: [action()] },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateRuleSchema', () => {
    it('accepts updating only actions', () => {
      expect(UpdateRuleSchema.safeParse({ fields: { actions: [action()] } }).success).toBe(true);
    });

    it('does not inject a default stage when stage is omitted', () => {
      const result = UpdateRuleSchema.safeParse({ fields: { actions: [action()] } });
      expect(result.data.fields).not.toHaveProperty('stage');
    });

    it('rejects an empty fields object', () => {
      expect(UpdateRuleSchema.safeParse({ fields: {} }).success).toBe(false);
    });
  });
});
