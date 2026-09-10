import {
  ScheduleDateSchema,
  CreateScheduleSchema,
  UpdateScheduleSchema,
  ScheduleUpdateQuerySchema,
} from '../../src/validation/schedules.js';

describe('schedules schemas', () => {
  describe('ScheduleDateSchema', () => {
    it('accepts a plain YYYY-MM-DD string', () => {
      expect(ScheduleDateSchema.safeParse('2024-01-01').success).toBe(true);
    });

    it('accepts a recurring date object', () => {
      const result = ScheduleDateSchema.safeParse({
        start: '2024-01-01', frequency: 'monthly', interval: 2, skipWeekend: true, weekendSolveMode: 'after',
      });
      expect(result.success).toBe(true);
    });

    it('rejects an invalid frequency', () => {
      const result = ScheduleDateSchema.safeParse({ start: '2024-01-01', frequency: 'hourly' });
      expect(result.success).toBe(false);
    });

    it('rejects an interval below 1', () => {
      const result = ScheduleDateSchema.safeParse({ start: '2024-01-01', frequency: 'daily', interval: 0 });
      expect(result.success).toBe(false);
    });
  });

  describe('CreateScheduleSchema', () => {
    it('accepts a one-time schedule with a plain date', () => {
      const result = CreateScheduleSchema.safeParse({ schedule: { date: '2024-01-01' } });
      expect(result.success).toBe(true);
      expect(result.data.schedule.amountOp).toBe('is');
    });

    it('accepts the legacy _date key as an alias for date', () => {
      const result = CreateScheduleSchema.safeParse({ schedule: { name: 'Rent', _date: '2024-01-01' } });
      expect(result.success).toBe(true);
      expect(result.data.schedule.date).toBe('2024-01-01');
      expect(result.data.schedule).not.toHaveProperty('_date');
    });

    it('prefers date over _date when both are present', () => {
      const result = CreateScheduleSchema.safeParse({
        schedule: { date: '2024-02-02', _date: '2024-01-01' },
      });
      expect(result.success).toBe(true);
      expect(result.data.schedule.date).toBe('2024-02-02');
    });

    it('rejects a schedule missing both date and _date', () => {
      const result = CreateScheduleSchema.safeParse({ schedule: { name: 'Rent' } });
      expect(result.success).toBe(false);
    });

    it('accepts a between-amount range', () => {
      const result = CreateScheduleSchema.safeParse({
        schedule: { date: '2024-01-01', amount: { num1: 10, num2: 20 }, amountOp: 'isbetween' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects an invalid amountOp', () => {
      const result = CreateScheduleSchema.safeParse({
        schedule: { date: '2024-01-01', amountOp: 'greater-than' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateScheduleSchema', () => {
    it('accepts updating only posts_transaction', () => {
      const result = UpdateScheduleSchema.safeParse({ fields: { posts_transaction: true } });
      expect(result.success).toBe(true);
    });

    it('accepts the _date alias on update', () => {
      const result = UpdateScheduleSchema.safeParse({ fields: { _date: '2024-03-03' } });
      expect(result.success).toBe(true);
      expect(result.data.fields.date).toBe('2024-03-03');
    });

    it('rejects an empty fields object', () => {
      expect(UpdateScheduleSchema.safeParse({ fields: {} }).success).toBe(false);
    });
  });

  describe('ScheduleUpdateQuerySchema', () => {
    it('coerces "true"/"false" strings correctly', () => {
      expect(ScheduleUpdateQuerySchema.safeParse({ resetNextDate: 'true' }).data).toEqual({ resetNextDate: true });
      expect(ScheduleUpdateQuerySchema.safeParse({ resetNextDate: 'false' }).data).toEqual({ resetNextDate: false });
    });

    it('accepts a missing resetNextDate', () => {
      expect(ScheduleUpdateQuerySchema.safeParse({}).success).toBe(true);
    });
  });
});
