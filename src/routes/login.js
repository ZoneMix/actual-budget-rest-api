/**
 * Login form routes for session-based authentication:
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

router.get('/login', (req, res) => {
  res.sendFile('./public/static/api-login.html', { root: process.cwd() });
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password, return_to } = req.body;

  try {
    const { userId } = await authenticateUser(username, password);
    req.session.user = { id: userId, username };

    res.redirect(return_to || '/');
  } catch (err) {
    res.redirect(`/login?error=Invalid credentials&return_to=${encodeURIComponent(return_to || '/')}`);
  }
});

export default router;