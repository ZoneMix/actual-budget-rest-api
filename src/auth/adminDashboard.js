/**
 * Admin dashboard authentication middleware.
 * Protects the admin dashboard HTML page with session-based authentication.
 * Requires the user to be logged in via session and have admin role.
 */

import { getRow } from '../db/authDb.js';

/**
 * Middleware to protect admin dashboard page.
 * Checks for session authentication and admin role.
 * Redirects to login if not authenticated or not admin.
 */
export const authenticateAdminDashboard = async (req, res, next) => {
  // Check if user has a session
  if (!req.session || !req.session.user) {
    // Redirect to login with return_to parameter
    return res.redirect(`/login?return_to=${encodeURIComponent(req.originalUrl)}`);
  }

  // Get user's role from database
  const user = await getRow('SELECT role FROM users WHERE id = ? AND is_active = TRUE', [req.session.user.id]);
  
  if (!user || user.role !== 'admin') {
    // Non-admin user - redirect to login with error
    return res.redirect(`/login?error=admin_required&return_to=${encodeURIComponent(req.originalUrl)}`);
  }

  // User is authenticated and is admin - allow access
  next();
};

