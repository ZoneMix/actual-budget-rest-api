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

export const scheduleCreate = async (schedule) => {
  return runWithApi(
    'scheduleCreate',
    async (apiInstance) => {
      logger.debug('[Actual] Creating schedule', { scheduleName: schedule.name });
      const id = await apiInstance.createSchedule({ schedule });
      logger.info('[Actual] scheduleCreate result', { scheduleId: id, scheduleName: schedule.name });
      return id;
    },
    { mode: 'write' }
  );
};

export const scheduleUpdate = async (id, fields) => {
  return runWithApi(
    'scheduleUpdate',
    async (apiInstance) => {
      logger.debug('[Actual] Updating schedule', { scheduleId: id, fields });
      const result = await apiInstance.updateSchedule(id, fields);
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
