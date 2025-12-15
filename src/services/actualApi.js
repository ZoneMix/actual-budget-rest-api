/**
 * Actual Budget API client initialization and lifecycle management.
 */

let api = null;

/**
 * Initialize the Actual API client (idempotent).
 */
export const initActualApi = async () => {
  if (api) return api;

  const { default: actualApi } = await import('@actual-app/api');
  api = actualApi;

  console.log('Initializing Actual Budget API client...');
  await api.init({
    dataDir: '/app/.actual-cache',
    serverURL: process.env.ACTUAL_SERVER_URL,
    password: process.env.ACTUAL_PASSWORD,
  });

  await api.downloadBudget(process.env.ACTUAL_SYNC_ID);
  console.log('Actual API initialized and budget synced.');

  return api;
};

/**
 * Get the initialized API instance.
 */
export const getActualApi = async () => {
  if (!api) await initActualApi();
  return api;
};

/**
 * Graceful shutdown.
 */
export const shutdownActualApi = async () => {
  if (api) {
    await api.shutdown();
    console.log('Actual API shutdown complete.');
    api = null;
  }
};