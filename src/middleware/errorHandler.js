/**
 * Shared error utilities and global Express error handler.
 */
export const httpError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

export const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  console.error(`[Error] ${req.method} ${req.originalUrl}`, err);
  res.status(status).json({ error: err.message || 'Internal Server Error' });
};
