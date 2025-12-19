/**
 * Wraps async route handlers to automatically catch errors and pass them to the error handler middleware.
 *
 * Without this wrapper, unhandled promise rejections in async route handlers would not be caught
 * by Express error handling middleware. This ensures all errors are properly logged and formatted.
 *
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware function
 *
 * @example
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await getUsers(); // If this throws, error handler catches it
 *   res.json(users);
 * }));
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
