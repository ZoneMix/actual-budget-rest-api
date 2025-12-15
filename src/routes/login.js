/**
 * Login form routes for OAuth consent flow (at root level):
 * - GET /login   (renders form)
 * - POST /login  (handles submission, sets session)
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateUser } from '../auth/user.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again later.' },
});

// GET /login – Simple login form
router.get('/login', (req, res) => {
  const returnTo = req.query.return_to || '/';
  const error = req.query.error ? `Error: ${req.query.error}` : '';
  res.send(`
    <!DOCTYPE html>
    <html><body>
      <h2>Login</h2>
      ${error ? `<p style="color:red;">${error}</p>` : ''}
      <form method="POST" action="/login">
        <input name="username" placeholder="Username" required><br><br>
        <input name="password" type="password" placeholder="Password" required><br><br>
        <input type="hidden" name="return_to" value="${returnTo}">
        <button type="submit">Login</button>
      </form>
    </body></html>
  `);
});

// POST /login – Authenticate and set session.user
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password, return_to } = req.body;

  try {
    const { userId } = await authenticateUser(username, password);
    req.session.user = { id: userId, username };

    res.redirect(return_to || '/');
  } catch (err) {
    res.redirect(`/login?error=invalid_creds&return_to=${encodeURIComponent(return_to || '/')}`);
  }
});

export default router;