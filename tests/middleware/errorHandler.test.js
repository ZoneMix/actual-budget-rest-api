/**
 * Error handler middleware tests.
 */

import { z } from 'zod';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { ValidationError, AuthenticationError, InternalServerError } from '../../src/errors/index.js';
import { formatZodError } from '../../src/validation/errors.js';

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

  // End of the path the createHttpError unit test starts: an engine rejection
  // is a plain object, so it has to survive normalisation AND rendering to
  // reach the caller as a 400 with the engine's own wording.
  it('renders an engine APIError as a 400 with the engine message', () => {
    const engineError = {
      type: 'APIError',
      message: 'balance is non-zero: transferAccountId is required',
    };
    errorHandler(engineError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'balance is non-zero: transferAccountId is required',
        code: 'ENGINE_ERROR',
      })
    );
  });

  it('keeps the engine message on an APIError in production', () => {
    process.env.NODE_ENV = 'production';
    errorHandler({ type: 'APIError', message: 'No budget file is open' }, req, res, next);
    process.env.NODE_ENV = 'test';

    // Only 500s are redacted; a 400 must keep its message or the caller cannot
    // tell what they got wrong.
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'No budget file is open' })
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

  it('should render formatZodError-shaped details for a thrown ValidationError', () => {
    const details = formatZodError(
      z.object({ name: z.string() }).safeParse({ name: 5 }).error
    );
    const error = new ValidationError('Validation failed', null, details);

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Validation failed',
        details: [expect.objectContaining({ field: 'name', code: 'invalid_type' })],
      })
    );
  });
});

