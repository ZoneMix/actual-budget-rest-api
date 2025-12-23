/**
 * Response helpers tests.
 */

import { sendSuccess, sendCreated, throwBadRequest, throwUnauthorized, throwForbidden, throwNotFound, throwInternalError } from '../../src/middleware/responseHelpers.js';
import { ValidationError, AuthenticationError, AuthorizationError, NotFoundError, InternalServerError } from '../../src/errors/index.js';

describe('Response Helpers', () => {
  let res;

  beforeEach(() => {
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
  });

  describe('sendSuccess', () => {
    it('should send success response with data object', () => {
      sendSuccess(res, { accounts: [] });
      
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        accounts: [],
      });
    });

    it('should send success response with data array', () => {
      sendSuccess(res, { items: [1, 2, 3] });
      
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        items: [1, 2, 3],
      });
    });

    it('should send success response with primitive data', () => {
      sendSuccess(res, 'test');
      
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: 'test',
      });
    });

    it('should send success response with message', () => {
      sendSuccess(res, { id: '123' }, 'Operation successful');
      
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        id: '123',
        message: 'Operation successful',
      });
    });

    it('should send success response without data', () => {
      sendSuccess(res);
      
      expect(res.json).toHaveBeenCalledWith({
        success: true,
      });
    });
  });

  describe('sendCreated', () => {
    it('should send 201 response with data object', () => {
      sendCreated(res, { id: '123', name: 'Test' });
      
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        id: '123',
        name: 'Test',
      });
    });

    it('should send 201 response with primitive data as id', () => {
      sendCreated(res, '123');
      
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        id: '123',
      });
    });

    it('should send 201 response without data', () => {
      sendCreated(res);
      
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
      });
    });
  });

  describe('Error throwers', () => {
    it('throwBadRequest should throw ValidationError', () => {
      expect(() => throwBadRequest('Invalid input')).toThrow(ValidationError);
      expect(() => throwBadRequest('Invalid input')).toThrow('Invalid input');
    });

    it('throwUnauthorized should throw AuthenticationError', () => {
      expect(() => throwUnauthorized('Unauthorized')).toThrow(AuthenticationError);
      expect(() => throwUnauthorized('Unauthorized')).toThrow('Unauthorized');
    });

    it('throwForbidden should throw AuthorizationError', () => {
      expect(() => throwForbidden('Forbidden')).toThrow(AuthorizationError);
      expect(() => throwForbidden('Forbidden')).toThrow('Forbidden');
    });

    it('throwNotFound should throw NotFoundError', () => {
      expect(() => throwNotFound('Not found')).toThrow(NotFoundError);
      expect(() => throwNotFound('Not found')).toThrow('Not found');
    });

    it('throwInternalError should throw InternalServerError', () => {
      expect(() => throwInternalError('Internal error')).toThrow(InternalServerError);
      expect(() => throwInternalError('Internal error')).toThrow('Internal error');
    });

    it('should support details parameter', () => {
      try {
        throwBadRequest('Error', 'field', { extra: 'info' });
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.details).toEqual({ extra: 'info' });
      }
    });
  });
});

