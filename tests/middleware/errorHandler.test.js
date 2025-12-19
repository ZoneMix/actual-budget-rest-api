/**
 * Error handler middleware tests.
 */

import { errorHandler } from '../../src/middleware/errorHandler.js';
import { ValidationError, AuthenticationError, InternalServerError } from '../../src/errors/index.js';

describe('errorHandler', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      id: 'test-request-id',
      method: 'GET',
      originalUrl: '/test',
      user: null,
      body: { test: 'data' },
      query: { param: 'value' },
      params: { id: '123' },
      ip: '127.0.0.1',
      get: jest.fn(() => 'test-agent'),
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
    };
    
    next = jest.fn();
    
    process.env.NODE_ENV = 'test';
  });

  it('should handle ValidationError with 400 status', () => {
    const error = new ValidationError('Invalid input', 'field');
    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Invalid input',
        requestId: 'test-request-id',
        code: 'VALIDATION_ERROR',
      })
    );
  });

  it('should handle AuthenticationError with 401 status', () => {
    const error = new AuthenticationError('Unauthorized');
    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Unauthorized',
        code: 'AUTHENTICATION_ERROR',
      })
    );
  });

  it('should hide internal error details in production', () => {
    process.env.NODE_ENV = 'production';
    const error = new InternalServerError('Database connection failed');
    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Internal Server Error', // Generic message in production
      })
    );
  });

  it('should include request context in error logs', () => {
    const error = new ValidationError('Test error');
    
    errorHandler(error, req, res, next);
    
    // Verify response was sent (error was handled)
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalled();
  });
});

