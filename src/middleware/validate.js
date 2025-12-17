/**
 * Basic body validation helpers to reduce repetition.
 */
export const requireBodyKeys = (keys) => (req, res, next) => {
  const missing = keys.filter((k) => req.body[k] === undefined || req.body[k] === null);
  if (missing.length) {
    return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
  }
  next();
};
