/**
 * Login form routes for session-based authentication:
 * - GET /login   (renders form)
 * - POST /login  (handles submission, sets session)
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateUser } from '../auth/user.js';
import { authenticateAdminDashboard } from '../auth/adminDashboard.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again later.' },
});

router.get('/login', (req, res) => {
  res.sendFile('./src/public/static/api-login.html', { root: process.cwd() });
});

router.get('/admin', authenticateAdminDashboard, (req, res) => {
  res.sendFile('./src/public/static/admin.html', { root: process.cwd() });
});

/**
 * Validate return_to URL to prevent open redirect vulnerabilities.
 * Only allows relative URLs or URLs from the same origin.
 */
const validateReturnTo = (returnTo, baseUrl = '') => {
  if (!returnTo) return '/';
  
  // Allow relative URLs (starting with /)
  if (returnTo.startsWith('/')) {
    return returnTo;
  }
  
  // Allow absolute URLs only from the same origin
  try {
    const url = new URL(returnTo, baseUrl || 'http://localhost:3000');
    // Only allow same origin redirects
    if (url.origin === new URL(baseUrl || 'http://localhost:3000').origin) {
      return returnTo;
    }
  } catch {
    // Invalid URL, use default
  }
  
  // Default to root if invalid
  return '/';
};

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password, return_to } = req.body;

  const { userId } = await authenticateUser(username, password);
  req.session.user = { id: userId, username };

  // Validate return_to to prevent open redirect attacks
  const safeReturnTo = validateReturnTo(return_to, req.get('origin') || req.protocol + '://' + req.get('host'));
  res.redirect(safeReturnTo);
});

/**
 * POST /logout
 * 
 * Destroys the session for session-based authentication.
 * Used by the admin dashboard and other session-based flows.
 */
router.post('/logout', (req, res) => {
  const sessionCookieName = req.session.cookie.name || 'sessionId';
  
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    
    // Clear the session cookie with the same options used when creating it
    res.clearCookie(sessionCookieName, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
    });
    
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

export default router;