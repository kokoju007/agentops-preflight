import { describe, it, expect } from 'vitest';
import {
  createApiError,
  AppError,
  invalidRequest,
  invalidTx,
  rateLimited,
  rpcUnavailable,
  internalError,
} from '../src/utils/errors';

describe('Error utilities', () => {
  describe('createApiError', () => {
    it('should create error with required fields', () => {
      const error = createApiError('invalid_request', 'Test message');

      expect(error.error.code).toBe('invalid_request');
      expect(error.error.message).toBe('Test message');
      expect(error.error.trace_id).toBeDefined();
      expect(error.error.trace_id.length).toBeGreaterThan(0);
    });

    it('should include retry_after when provided', () => {
      const error = createApiError('rate_limited', 'Too many requests', 60);

      expect(error.error.retry_after).toBe(60);
    });
  });

  describe('AppError', () => {
    it('should create error with all properties', () => {
      const error = new AppError('invalid_tx', 'Invalid transaction', 400);

      expect(error.code).toBe('invalid_tx');
      expect(error.message).toBe('Invalid transaction');
      expect(error.statusCode).toBe(400);
      expect(error.traceId).toBeDefined();
    });

    it('should serialize to JSON correctly', () => {
      const error = new AppError('rate_limited', 'Too many', 429, 30);
      const json = error.toJSON();

      expect(json.error.code).toBe('rate_limited');
      expect(json.error.message).toBe('Too many');
      expect(json.error.retry_after).toBe(30);
    });
  });

  describe('Error factory functions', () => {
    it('invalidRequest should return 400 error', () => {
      const error = invalidRequest('Bad input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('invalid_request');
    });

    it('invalidTx should return 400 error', () => {
      const error = invalidTx('Cannot decode');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('invalid_tx');
    });

    it('rateLimited should return 429 error with retry_after', () => {
      const error = rateLimited(60);
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('rate_limited');
      expect(error.retryAfter).toBe(60);
    });

    it('rpcUnavailable should return 503 error', () => {
      const error = rpcUnavailable();
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('rpc_unavailable');
    });

    it('internalError should return 500 error', () => {
      const error = internalError();
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('internal_error');
    });
  });
});
