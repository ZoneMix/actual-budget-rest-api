/**
 * Schedule service call shapes against @actual-app/api 26.9.0.
 *
 * Upstream signatures being pinned here:
 *   createSchedule(schedule)                     — @types/methods.d.ts:121,
 *      dist/index.js:130655 → send('api/schedule-create', schedule)
 *   updateSchedule(id, fields, resetNextDate?)   — @types/methods.d.ts:122,
 *      dist/index.js:130658
 */

import actualApi, { __reset } from '../mocks/actual-api.js';
import { scheduleCreate, scheduleUpdate } from '../../src/services/actual/schedules.js';

const SCHEDULE = Object.freeze({ name: 'Rent', date: '2026-02-01', amountOp: 'is' });

describe('schedule service call shapes', () => {
  beforeEach(() => {
    __reset();
  });

  describe('scheduleCreate', () => {
    it('forwards the bare schedule, not a { schedule } wrapper', async () => {
      await scheduleCreate(SCHEDULE);

      expect(actualApi.createSchedule).toHaveBeenCalledWith(SCHEDULE);
    });

    it('resolves with the new id the engine returned', async () => {
      actualApi.createSchedule.mockResolvedValueOnce('sch-42');

      await expect(scheduleCreate(SCHEDULE)).resolves.toBe('sch-42');
    });
  });

  describe('scheduleUpdate', () => {
    it('forwards resetNextDate as the third argument', async () => {
      await scheduleUpdate('sch-1', { name: 'Rent (new)' }, true);

      expect(actualApi.updateSchedule).toHaveBeenCalledWith('sch-1', { name: 'Rent (new)' }, true);
    });

    it('forwards an explicit false', async () => {
      await scheduleUpdate('sch-1', { name: 'Rent' }, false);

      expect(actualApi.updateSchedule).toHaveBeenCalledWith('sch-1', { name: 'Rent' }, false);
    });

    it('passes undefined through when the caller omits the flag', async () => {
      await scheduleUpdate('sch-1', { name: 'Rent' });

      expect(actualApi.updateSchedule).toHaveBeenCalledWith('sch-1', { name: 'Rent' }, undefined);
    });
  });
});
