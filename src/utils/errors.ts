import { v4 as uuidv4 } from 'uuid';

export type ErrorCode =
  | 'invalid_request'
  | 'invalid_tx'
  | 'rate_limited'
  | 'rpc_unavailable'
  | 'internal_error'
  | 'forbidden'
  | 'unauthorized';

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    trace_id: string;
    retry_after?: number;
  };
}

export function createApiError(
  code: ErrorCode,
  message: string,
  retryAfter?: number
): ApiError {
  const error: ApiError = {
    error: {
      code,
      message,
      trace_id: uuidv4(),
    },
  };
  if (retryAfter !== undefined) {
    error.error.retry_after = retryAfter;
  }
  return error;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly traceId: string;
  public readonly retryAfter?: number;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    retryAfter?: number
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.traceId = uuidv4();
    this.retryAfter = retryAfter;
  }

  toJSON(): ApiError {
    return createApiError(this.code, this.message, this.retryAfter);
  }
}

// Predefined errors
export function invalidRequest(message: string): AppError {
  return new AppError('invalid_request', message, 400);
}

export function invalidTx(message: string): AppError {
  return new AppError('invalid_tx', message, 400);
}

export function rateLimited(retryAfter: number): AppError {
  return new AppError(
    'rate_limited',
    'Too many requests. Please try again later.',
    429,
    retryAfter
  );
}

export function rpcUnavailable(): AppError {
  return new AppError(
    'rpc_unavailable',
    'All RPC endpoints are currently unavailable.',
    503
  );
}

export function internalError(message = 'An internal error occurred.'): AppError {
  return new AppError('internal_error', message, 500);
}
