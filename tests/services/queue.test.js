/**
 * Engine queue: FIFO serialisation of every call into the single embedded
 * Actual engine, with backpressure, a caller-side timeout and reentrancy.
 */

import { createEngineQueue, withEngine, withEngineExclusive } from '../../src/services/actual/queue.js';
import { ServiceUnavailableError, GatewayTimeoutError } from '../../src/errors/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const openGate = () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  return { gate, release: (value) => release(value) };
};

describe('createEngineQueue', () => {
  describe('ordering', () => {
    it('runs queued tasks one at a time in FIFO order', async () => {
      const queue = createEngineQueue();
      const order = [];

      const enqueue = (n, delayMs) =>
        queue.withEngine(`task-${n}`, async () => {
          await sleep(delayMs);
          order.push(n);
          return n;
        });

      // Slowest first: without serialisation the results would land 3, 2, 1.
      const results = await Promise.all([enqueue(1, 20), enqueue(2, 10), enqueue(3, 0)]);

      expect(order).toEqual([1, 2, 3]);
      expect(results).toEqual([1, 2, 3]);
      expect(queue.getQueueDepth()).toBe(0);
    });

    it('keeps the chain alive when a task rejects', async () => {
      const queue = createEngineQueue();

      const failing = queue.withEngine('boom', async () => {
        throw new Error('engine exploded');
      });
      const next = queue.withEngine('after-boom', async () => 'still running');

      await expect(failing).rejects.toThrow('engine exploded');
      await expect(next).resolves.toBe('still running');
      expect(queue.getQueueDepth()).toBe(0);
    });
  });

  describe('reentrancy', () => {
    it('runs a nested engine call inline instead of deadlocking on itself', async () => {
      const queue = createEngineQueue();

      const result = await queue.withEngine('outer', async () => {
        const inner = await queue.withEngine('inner', async () => 'inner-value');
        return `outer:${inner}`;
      });

      expect(result).toBe('outer:inner-value');
      expect(queue.getQueueDepth()).toBe(0);
    });
  });

  describe('backpressure', () => {
    it('rejects with a 503 once the pending depth reaches the cap', async () => {
      const queue = createEngineQueue({ maxDepth: 2 });
      const { gate, release } = openGate();

      const first = queue.withEngine('first', () => gate);
      const second = queue.withEngine('second', async () => 'second');

      expect(queue.getQueueDepth()).toBe(2);

      const rejected = queue.withEngine('third', async () => 'third');
      await expect(rejected).rejects.toBeInstanceOf(ServiceUnavailableError);
      await expect(rejected).rejects.toMatchObject({ status: 503 });

      release('first');
      await expect(first).resolves.toBe('first');
      await expect(second).resolves.toBe('second');
      expect(queue.getQueueDepth()).toBe(0);
    });
  });

  describe('per-call timeout', () => {
    // POST /v2/budget/load is network-bound and legitimately slower than
    // ACTUAL_OP_TIMEOUT_MS. A timeout there holds the queue slot forever by
    // design, so the wedge is avoided by giving the slow call a longer budget
    // rather than by shortening everything else.
    it('honours a per-call timeoutMs over the queue default', async () => {
      const queue = createEngineQueue({ timeoutMs: 5000 });

      const slow = queue.withEngine('slow', () => sleep(40), { timeoutMs: 20 });

      await expect(slow).rejects.toBeInstanceOf(GatewayTimeoutError);
      await expect(slow).rejects.toMatchObject({ status: 504 });
    });

    it('lets a per-call timeoutMs raise the budget above the queue default', async () => {
      const queue = createEngineQueue({ timeoutMs: 20 });

      await expect(
        queue.withEngine('slow-but-allowed', async () => {
          await sleep(40);
          return 'finished';
        }, { timeoutMs: 500 })
      ).resolves.toBe('finished');
    });

    it('leaves the default path on the queue timeout when no option is given', async () => {
      const queue = createEngineQueue({ timeoutMs: 20 });

      await expect(queue.withEngine('slow', () => sleep(40))).rejects.toBeInstanceOf(GatewayTimeoutError);
      await expect(queue.withEngine('fast', async () => 'quick')).resolves.toBe('quick');
    });
  });

  describe('timeout', () => {
    it('rejects the caller with a 504 but keeps the slot until the engine call settles', async () => {
      const queue = createEngineQueue({ timeoutMs: 30 });
      const { gate, release } = openGate();
      const started = [];

      const slow = queue.withEngine('slow', () => {
        started.push('slow');
        return gate;
      });

      await expect(slow).rejects.toBeInstanceOf(GatewayTimeoutError);
      await expect(slow).rejects.toMatchObject({ status: 504 });

      // The timeout does not cancel the engine call: the slot is still held.
      const later = queue.withEngine('later', async () => {
        started.push('later');
        return 'later';
      });
      await sleep(10);

      expect(started).toEqual(['slow']);
      expect(queue.getQueueDepth()).toBe(2);

      release('engine finished late');
      await expect(later).resolves.toBe('later');
      expect(started).toEqual(['slow', 'later']);
      expect(queue.getQueueDepth()).toBe(0);
    });
  });
});

describe('default engine queue', () => {
  it('exposes withEngineExclusive as an alias of withEngine', () => {
    expect(withEngineExclusive).toBe(withEngine);
  });

  it('serialises through a module-level default instance', async () => {
    await expect(withEngine('default-queue', async () => 'ran')).resolves.toBe('ran');
  });
});
