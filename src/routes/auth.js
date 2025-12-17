/**
 * Authentication routes:
 * - POST /auth/login  (password or refresh token)
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authenticateUser } from '../auth/user.js';
import { issueTokens, revokeToken, isTokenRevoked, authenticateJWT } from '../auth/jwt.js';
import { insertToken } from '../db/authDb.js';
import { ACCESS_TTL_SECONDS } from '../config/index.js';
import { validateBody } from '../middleware/validation-schemas.js';
import { LoginSchema, LogoutSchema } from '../middleware/validation-schemas.js';
import logger, { logAuthEvent } from '../logging/logger.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logAuthEvent('RATE_LIMITED', null, { ip: req.ip, endpoint: '/auth/login' }, false);
    res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  },
});

router.post('/login', loginLimiter, validateBody(LoginSchema), async (req, res) => {
  const { username, password, refresh_token } = req.validatedBody;

  // Refresh token flow
  if (refresh_token && !username && !password) {
    try {
      const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
      if (isTokenRevoked(decoded.jti)) {
        logAuthEvent('REFRESH_FAILED', decoded.user_id, { reason: 'token_revoked' }, false);
        return res.status(401).json({ error: 'Refresh token revoked' });
      }

      const newJti = crypto.randomUUID();
      const accessExpiresAt = new Date(Date.now() + ACCESS_TTL_SECONDS * 1000).toISOString();
      const accessToken = jwt.sign(
        { user_id: decoded.user_id, username: decoded.username, iss: 'actual-wrapper', aud: 'n8n' },
        process.env.JWT_SECRET,
        { expiresIn: `${ACCESS_TTL_SECONDS}s`, jwtid: newJti }
      );

      insertToken(newJti, 'access', accessExpiresAt);

      logAuthEvent('TOKEN_REFRESHED', decoded.user_id, { username: decoded.username }, true);

      return res.json({
        access_token: accessToken,
        expires_in: ACCESS_TTL_SECONDS,
        token_type: 'Bearer',
      });
    } catch (err) {
      logAuthEvent('REFRESH_FAILED', null, { reason: 'invalid_token', error: err.message }, false);
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  }

  // Password login flow
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const { userId, username: uname } = await authenticateUser(username, password);
  const tokens = issueTokens(userId, uname);
  res.json(tokens);
});

router.post('/logout', authenticateJWT, validateBody(LogoutSchema), (req, res) => {
  const user = req.user;  // From middleware (has user_id, username, jti for access)

  // Always revoke the current access token JTI
  if (user?.jti) {
    revokeToken(user.jti);
    logAuthEvent('LOGOUT', user.user_id, { username: user.username, jti: user.jti }, true);
  }

  // Optionally revoke refresh token if provided
  const { refresh_token } = req.validatedBody;
  if (refresh_token) {
    try {
      const decodedRefresh = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
      if (decodedRefresh?.jti) {
        revokeToken(decodedRefresh.jti);
        logAuthEvent('REFRESH_REVOKED', user.user_id, { jti: decodedRefresh.jti }, true);
      }
      res.json({ success: true, message: 'Logged out successfully – access and refresh tokens revoked' });
    } catch (err) {
      logger.warn('Invalid refresh_token provided on logout', { error: err.message, userId: user.user_id });
      // Still succeed partially (access revoked)
      res.json({
        success: true,
        message: 'Access token revoked; refresh_token was invalid or already expired'
      });
    }
  } else {
    res.json({ success: true, message: 'Access token revoked (no refresh_token provided)' });
  }
});

export default router;