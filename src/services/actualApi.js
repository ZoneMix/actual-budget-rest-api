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

/**
 * Ensure latest data before reads.
 */
const ensureSynced = async () => {
  const api = await getActualApi();
  await api.sync();
};

/**
 * Fetch transactions for an account.
 * Syncs first for freshness.
 */
export const getTransactions = async (accountId) => {
  await ensureSynced();
  const api = await getActualApi();
  return api.getTransactions(accountId);
};

/**
 * Add transactions to an account.
 * Syncs before/after for consistency.
 */
export const addTransactions = async (accountId, transactions) => {
  await ensureSynced();
  const api = await getActualApi();
  await api.addTransactions(accountId, transactions);
  await api.sync();  // Push changes
};

/**
 * Get all accounts.
 * Syncs first.
 */
export const getAccounts = async () => {
  await ensureSynced();
  const api = await getActualApi();
  return api.getAccounts();
};