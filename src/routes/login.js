/**
 * Login form routes for session-based authentication:
 * - GET /login   (renders form)
 * - POST /login  (handles submission, sets session)
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateUser } from '../auth/user.js';
import { authenticateAdminDashboard } from '../auth/adminDashboard.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import logger, { logAuthEvent } from '../logging/logger.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again later.' },
});

router.get('/login', (req, res) => {
  res.sendFile('./src/public/static/api-login.html', { root: process.cwd() });
});

router.get('/admin', asyncHandler(authenticateAdminDashboard), (req, res) => {
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

  logger.debug('[Session] Login attempt', { username, hasReturnTo: !!return_to, ip: req.ip });

  try {
    const { userId } = await authenticateUser(username, password);
    req.session.user = { id: userId, username };

    logAuthEvent('SESSION_LOGIN', userId, { username, ip: req.ip }, true);
    logger.info('[Session] Login successful', { userId, username });

    // Validate return_to to prevent open redirect attacks
    const safeReturnTo = validateReturnTo(return_to, req.get('origin') || req.protocol + '://' + req.get('host'));
    
    if (return_to && return_to !== safeReturnTo) {
      logger.warn('[Session] Invalid return_to URL sanitized', { 
        original: return_to, 
        sanitized: safeReturnTo,
        username 
      });
    }
    
    res.redirect(safeReturnTo);
  } catch (error) {
    logAuthEvent('SESSION_LOGIN_FAILED', null, { username, reason: error.message, ip: req.ip }, false);
    logger.warn('[Session] Login failed', { username, error: error.message, ip: req.ip });
    // Re-throw to be handled by error middleware
    throw error;
  }
});

/**
 * POST /logout
 * 
 * Destroys the session for session-based authentication.
 * Used by the admin dashboard and other session-based flows.
 */
router.post('/logout', (req, res) => {
  const sessionCookieName = req.session.cookie.name || 'sessionId';
  const userId = req.session.user?.id;
  const username = req.session.user?.username;
  
  req.session.destroy((err) => {
    if (err) {
      logger.error('[Session] Logout failed', { userId, username, error: err.message });
      return res.status(500).json({ error: 'Failed to logout' });
    }
    
    if (userId) {
      logAuthEvent('SESSION_LOGOUT', userId, { username }, true);
      logger.info('[Session] Logout successful', { userId, username });
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