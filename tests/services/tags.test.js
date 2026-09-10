/**
 * Tag service functions — the exact engine method and argument list each one
 * forwards, and the sync mode it runs under.
 */

import actualApi, { __reset } from '../mocks/actual-api.js';
import { tagsList, tagCreate, tagUpdate, tagDelete } from '../../src/services/actual/tags.js';
import * as barrel from '../../src/services/actualApi.js';

const TAG_ID = '3f2c1b9a-1111-4a2b-8c3d-4e5f60718293';

describe('tag services', () => {
  beforeEach(() => {
    __reset();
  });

  it('tagsList() calls getTags() with no arguments', async () => {
    actualApi.getTags.mockResolvedValueOnce([{ id: TAG_ID, tag: 'vacation' }]);

    await expect(tagsList()).resolves.toEqual([{ id: TAG_ID, tag: 'vacation' }]);
    expect(actualApi.getTags).toHaveBeenCalledWith();
  });

  it('tagCreate(tag) calls createTag(tag) and returns the new id', async () => {
    actualApi.createTag.mockResolvedValueOnce(TAG_ID);

    await expect(tagCreate({ tag: 'vacation', color: '#ff7043' })).resolves.toBe(TAG_ID);
    expect(actualApi.createTag).toHaveBeenCalledWith({ tag: 'vacation', color: '#ff7043' });
  });

  it('tagUpdate(id, fields) calls updateTag(id, fields)', async () => {
    await tagUpdate(TAG_ID, { color: '#66bb6a' });

    expect(actualApi.updateTag).toHaveBeenCalledWith(TAG_ID, { color: '#66bb6a' });
  });

  it('tagDelete(id) calls deleteTag(id)', async () => {
    await tagDelete(TAG_ID);

    expect(actualApi.deleteTag).toHaveBeenCalledWith(TAG_ID);
  });

  it('runs every mutation as a write, so each one syncs afterwards', async () => {
    await tagCreate({ tag: 'a' });
    await tagUpdate(TAG_ID, { tag: 'b' });
    await tagDelete(TAG_ID);

    // One post-write sync per mutation. The reads above this test do not sync
    // again once the policy is fresh, so this count belongs to the writes.
    expect(actualApi.sync).toHaveBeenCalledTimes(3);
  });

  it('is re-exported from the service barrel', () => {
    expect(barrel.tagsList).toBe(tagsList);
    expect(barrel.tagCreate).toBe(tagCreate);
    expect(barrel.tagUpdate).toBe(tagUpdate);
    expect(barrel.tagDelete).toBe(tagDelete);
  });
});
