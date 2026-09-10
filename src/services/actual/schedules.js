/**
 * Schedule operations against the Actual engine.
 */

import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';

export const schedulesList = async () => {
  return runWithApi('schedulesList', async (apiInstance) => {
    logger.debug('[Actual] Getting schedules list');
    const schedules = await apiInstance.getSchedules();
    logger.info('[Actual] schedulesList result', { count: schedules.length });
    return schedules;
  });
};

/**
 * Creates a schedule.
 *
 * The SDK takes the schedule directly — createSchedule(schedule)
 * (@actual-app/api/@types/methods.d.ts:121, dist/index.js:130655, which posts
 * the argument itself as the payload). Wrapping it in `{ schedule }` sent the
 * engine an object with no schedule fields on it.
 */
export const scheduleCreate = async (schedule) => {
  return runWithApi(
    'scheduleCreate',
    async (apiInstance) => {
      logger.debug('[Actual] Creating schedule', { scheduleName: schedule.name });
      const id = await apiInstance.createSchedule(schedule);
      logger.info('[Actual] scheduleCreate result', { scheduleId: id, scheduleName: schedule.name });
      return id;
    },
    { mode: 'write' }
  );
};

/**
 * Updates a schedule.
 *
 * `resetNextDate` is the SDK's third parameter
 * (@actual-app/api/@types/methods.d.ts:122); it was never forwarded, so a
 * date change left the schedule's next occurrence stale. `undefined` is
 * passed through deliberately so the engine keeps its own default.
 */
export const scheduleUpdate = async (id, fields, resetNextDate = undefined) => {
  return runWithApi(
    'scheduleUpdate',
    async (apiInstance) => {
      logger.debug('[Actual] Updating schedule', { scheduleId: id, fields, resetNextDate });
      const result = await apiInstance.updateSchedule(id, fields, resetNextDate);
      logger.info('[Actual] scheduleUpdate completed', { scheduleId: id, result });
      return result;
    },
    { mode: 'write' }
  );
};

export const scheduleDelete = async (id) => {
  return runWithApi(
    'scheduleDelete',
    async (apiInstance) => {
      logger.debug('[Actual] Deleting schedule', { scheduleId: id });
      await apiInstance.deleteSchedule(id);
      logger.info('[Actual] scheduleDelete completed', { scheduleId: id });
    },
    { mode: 'write' }
  );
};
