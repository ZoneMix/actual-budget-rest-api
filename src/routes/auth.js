/**
 * Authentication routes:
 * - POST /auth/login  (password or refresh token)
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authenticateUser } from '../auth/user.js';
import { issueTokens } from '../auth/jwt.js';
import { isTokenRevoked, authenticateJWT } from '../auth/jwt.js';
import { getDb } from '../db/authDb.js';
import { ACCESS_TTL_SECONDS } from '../config/index.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again later.' },
});

// POST /auth/login – password login or refresh token exchange
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password, refresh_token } = req.body;

  // Refresh token flow
  if (refresh_token && !username && !password) {
    try {
      const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
      if (isTokenRevoked(decoded.jti)) {
        return res.status(401).json({ error: 'Refresh token revoked' });
      }

      const newJti = crypto.randomUUID();
      const accessToken = jwt.sign(
        { user_id: decoded.user_id, username: decoded.username, iss: 'actual-wrapper', aud: 'n8n' },
        process.env.JWT_SECRET,
        { expiresIn: `${ACCESS_TTL_SECONDS}s`, jwtid: newJti }
      );

      getDb().prepare('INSERT INTO tokens (jti) VALUES (?)').run(newJti);

      return res.json({
        access_token: accessToken,
        expires_in: ACCESS_TTL_SECONDS,
        token_type: 'Bearer',
      });
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  }

  // Password login flow
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const { userId, username: uname } = await authenticateUser(username, password);
    const tokens = issueTokens(userId, uname);
    res.json(tokens);
  } catch (err) {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

router.post('/logout', authenticateJWT, (req, res) => {
  const user = req.user;  // From middleware (has user_id, username, jti for access)

  // Always revoke the current access token JTI
  if (user?.jti) {
    revokeToken(user.jti);
    console.log(`Access token revoked for user '${user.username}' (JTI: ${user.jti})`);
  }

  // Require/strongly encourage refresh_token in body for full logout
  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(400).json({
      error: 'refresh_token required in body for complete logout (access token revoked only)'
    });
  }

  try {
    const decodedRefresh = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
    if (decodedRefresh?.jti) {
      revokeToken(decodedRefresh.jti);
      console.log(`Refresh token revoked for user '${user.username}' (JTI: ${decodedRefresh.jti})`);
    }
    res.json({ success: true, message: 'Logged out successfully – access and refresh tokens revoked' });
  } catch (err) {
    console.warn('Invalid/expired refresh_token provided on logout:', err.message);
    // Still succeed partially (access revoked)
    res.json({
      success: true,
      message: 'Access token revoked; invalid refresh_token ignored'
    });
  }
});

export default router;