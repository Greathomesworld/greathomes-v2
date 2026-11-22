import { isProductionDeployment } from './config.ts';
import { isPersistenceUnavailableError } from './persistenceGuard.ts';
import { isRateLimitUnavailableError } from './rateLimit.ts';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_SERVER_ERROR';

export interface ApiErrorDetail {
  code: ApiErrorCode;
  message: string;
  requestId: string;
  details?: any;
}

export interface ApiErrorResponseBody {
  error: ApiErrorDetail;
}

export class AppError extends Error {
  statusCode: number;
  code: ApiErrorCode;
  details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: ApiErrorCode = 'INTERNAL_SERVER_ERROR',
    details?: any
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function createApiErrorResponse(
  error: unknown,
  requestId: string,
  overrideStatus?: number
): Response {
  let status = overrideStatus || 500;
  let code: ApiErrorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected server error occurred.';
  let details: any = undefined;
  const prod = isProductionDeployment();

  if (error instanceof AppError) {
    status = overrideStatus || error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (isPersistenceUnavailableError(error) || isRateLimitUnavailableError(error)) {
    status = overrideStatus || 503;
    code = 'SERVICE_UNAVAILABLE';
    message = 'The service is temporarily unavailable. Please try again in a moment.';
  } else if (error instanceof Error) {
    const errorName = error.name || '';
    const errorMsg = error.message || '';

    if (
      errorName === 'ValidationError' ||
      errorName === 'EnquiryValidationError' ||
      errorMsg.includes('ValidationError')
    ) {
      status = overrideStatus || 400;
      code = 'VALIDATION_ERROR';
      message = error.message;
    } else if (errorName === 'UnauthorizedError') {
      status = overrideStatus || 401;
      code = 'UNAUTHORIZED';
      message = error.message || 'Authentication required.';
    } else if (errorName === 'ForbiddenError') {
      status = overrideStatus || 403;
      code = 'FORBIDDEN';
      message = error.message || 'You do not have permission to perform this action.';
    } else if (
      errorName === 'NotFoundError' ||
      errorName === 'EnquiryNotFoundError' ||
      errorName === 'StaffNotFoundError' ||
      errorMsg.includes('NotFoundError')
    ) {
      status = overrideStatus || 404;
      code = 'RESOURCE_NOT_FOUND';
      message = error.message;
    } else if (
      errorName === 'DuplicateEmailError' ||
      errorName === 'DuplicateSlugError' ||
      errorName === 'LastSuperAdminError' ||
      errorMsg.includes('Duplicate')
    ) {
      status = overrideStatus || 409;
      code = 'CONFLICT';
      message = error.message;
    } else if (
      errorName === 'SelfDisableError' ||
      errorName === 'SelfEscalationError'
    ) {
      status = overrideStatus || 400;
      code = 'VALIDATION_ERROR';
      message = error.message;
    } else if (/SELECT|INSERT|UPDATE|DELETE|WHERE|FROM|relation|column|postgres|ECONN/i.test(errorMsg)) {
      status = overrideStatus || 500;
      code = 'INTERNAL_SERVER_ERROR';
      message = 'An internal server error occurred.';
    } else {
      message = prod ? 'An internal server error occurred.' : error.message;
    }
  }

  const payload: ApiErrorResponseBody = {
    error: {
      code,
      message,
      requestId,
      ...(details && !prod ? { details } : {}),
    },
  };

  const response = Response.json(payload, { status });
  response.headers.set('x-request-id', requestId);
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  return response;
}
