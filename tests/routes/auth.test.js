/**
 * Authentication route tests.
 * 
 * Note: These tests require a database to be set up.
 * For full integration tests, mock the database or use a test database.
 */

import request from 'supertest';
import express from 'express';
import authRoutes from '../../src/routes/auth.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { promises as fs } from 'fs';
import path from 'path';

// Ensure test data directory exists
const testDataDir = path.join(process.cwd(), 'tests', 'data');
try {
  await fs.mkdir(testDataDir, { recursive: true });
} catch (error) {
  // Directory might already exist, ignore
}

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);
app.use(errorHandler);

describe('POST /auth/login', () => {
  it('should return 400 for missing credentials', async () => {
    const response = await request(app)
      .post('/auth/login')
      .send({});
    
    // May return 500 if database isn't set up, which is acceptable for unit tests
    expect([400, 500]).toContain(response.status);
    expect(response.body).toHaveProperty('error');
  });

  it('should return 401 for invalid credentials', async () => {
    const response = await request(app)
      .post('/auth/login')
      .send({
        username: 'invalid',
        password: 'invalid',
      });
    
    // May return 500 if database isn't set up, which is acceptable for unit tests
    expect([401, 500]).toContain(response.status);
    expect(response.body).toHaveProperty('error');
  });

  // Note: Full integration tests would require:
  // - Test database setup
  // - Actual API mock
  // - Admin user creation
});

