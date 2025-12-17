/**
 * API Documentation authentication and login routes.
 * Provides session-based authentication for Swagger UI access.
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { authenticateUser } from './user.js';
import { isTokenRevoked } from './jwt.js';

const router = express.Router();

// Custom middleware for docs that accepts JWT or session auth
export const authenticateForDocs = (req, res, next) => {
  // First try JWT authentication
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    // Use existing JWT middleware logic
    try {
      const decoded = jwt.decode(token);
      if (decoded && !isTokenRevoked(decoded.jti)) {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload;
        return next();
      }
    } catch (err) {
      // JWT invalid, continue to session check
    }
  }

  // Fallback to session authentication
  if (req.session && req.session.user) {
    req.user = { user_id: req.session.user.id, username: req.session.user.username, scope: 'api' };
    return next();
  }

  // Neither JWT nor session - redirect to login
  res.redirect('/docs/login');
};

// Docs login page
router.get('/login', (req, res) => {
  const error = req.query.error ? `Error: ${req.query.error}` : '';
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>API Documentation Login</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; }
        form { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 3px; }
        button { background: #007bff; color: white; padding: 10px; border: none; border-radius: 3px; width: 100%; cursor: pointer; }
        button:hover { background: #0056b3; }
        .error { color: red; margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <h2>API Documentation Login</h2>
      <p>Please log in to access the API documentation.</p>
      ${error ? `<div class="error">${error}</div>` : ''}
      <form method="POST" action="/docs/login">
        <input name="username" placeholder="Username" required>
        <input name="password" type="password" placeholder="Password" required>
        <button type="submit">Login</button>
      </form>
    </body>
    </html>
  `);
});

// Process login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const { userId } = await authenticateUser(username, password);
    req.session.user = { id: userId, username };
    res.redirect('/docs');
  } catch (err) {
    res.redirect('/docs/login?error=invalid_credentials');
  }
});

export default router;