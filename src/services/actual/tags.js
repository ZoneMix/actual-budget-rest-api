/**
 * Tag operations against the Actual engine.
 *
 * Tags are the 26.9.0 addition that lets transactions carry free-form labels
 * independent of categories (methods.d.ts:105-108).
 */

import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';

export const tagsList = async () => {
  return runWithApi('tagsList', async (apiInstance) => {
    logger.debug('[Actual] Getting tags list');
    const tags = await apiInstance.getTags();
    logger.info('[Actual] tagsList result', { count: tags.length });
    return tags;
  });
};

export const tagCreate = async (tag) => {
  return runWithApi(
    'tagCreate',
    async (apiInstance) => {
      logger.debug('[Actual] Creating tag', { tagName: tag.tag });
      const id = await apiInstance.createTag(tag);
      logger.info('[Actual] tagCreate result', { tagId: id, tagName: tag.tag });
      return id;
    },
    { mode: 'write' }
  );
};

export const tagUpdate = async (id, fields) => {
  return runWithApi(
    'tagUpdate',
    async (apiInstance) => {
      logger.debug('[Actual] Updating tag', { tagId: id, fields });
      await apiInstance.updateTag(id, fields);
      logger.info('[Actual] tagUpdate completed', { tagId: id });
    },
    { mode: 'write' }
  );
};

export const tagDelete = async (id) => {
  return runWithApi(
    'tagDelete',
    async (apiInstance) => {
      logger.debug('[Actual] Deleting tag', { tagId: id });
      await apiInstance.deleteTag(id);
      logger.info('[Actual] tagDelete completed', { tagId: id });
    },
    { mode: 'write' }
  );
};
