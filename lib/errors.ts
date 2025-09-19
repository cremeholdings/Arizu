// Typed error response system for consistent API error handling

export interface ErrorResponse {
  ok: false
  code: string
  message: string
  meta?: Record<string, any>
  retryAfterSec?: number
}

export interface LimitMeta {
  limit: number
  used: number
  resetTime?: number
  planType?: string
}

export interface FeatureMeta {
  feature: string
  requiredPlan?: string
  currentPlan?: string
}

export interface RateLimitMeta {
  retryAfterSec: number
  resetTime?: number
  endpoint?: string
}

// Plan and usage limit errors
export function planLimit(message: string, meta?: LimitMeta): ErrorResponse {
  return {
    ok: false,
    code: 'PLAN_LIMIT',
    message,
    meta
  }
}

export function featureLocked(message: string, meta?: FeatureMeta): ErrorResponse {
  return {
    ok: false,
    code: 'FEATURE_LOCKED',
    message,
    meta
  }
}

// Rate limiting and circuit breaker errors
export function rateLimit(message: string, retryAfterSec?: number, meta?: RateLimitMeta): ErrorResponse {
  return {
    ok: false,
    code: 'RATE_LIMIT',
    message,
    retryAfterSec: retryAfterSec || meta?.retryAfterSec,
    meta
  }
}

export function circuitOpen(message: string, meta?: Record<string, any>): ErrorResponse {
  return {
    ok: false,
    code: 'CIRCUIT_OPEN',
    message,
    meta
  }
}

// Standard HTTP errors
export function badRequest(message: string, meta?: Record<string, any>): ErrorResponse {
  return {
    ok: false,
    code: 'BAD_REQUEST',
    message,
    meta
  }
}

export function unauthorized(message: string = 'Authentication required', meta?: Record<string, any>): ErrorResponse {
  return {
    ok: false,
    code: 'UNAUTHORIZED',
    message,
    meta
  }
}

export function forbidden(message: string = 'Access forbidden', meta?: Record<string, any>): ErrorResponse {
  return {
    ok: false,
    code: 'FORBIDDEN',
    message,
    meta
  }
}

export function notFound(message: string = 'Resource not found', meta?: Record<string, any>): ErrorResponse {
  return {
    ok: false,
    code: 'NOT_FOUND',
    message,
    meta
  }
}

export function serverError(message: string = 'Internal server error', meta?: Record<string, any>): ErrorResponse {
  return {
    ok: false,
    code: 'SERVER_ERROR',
    message,
    meta
  }
}

// Validation and compilation errors
export function validationError(message: string, issues?: any[], meta?: Record<string, any>): ErrorResponse {
  return {
    ok: false,
    code: 'VALIDATION_ERROR',
    message,
    meta: {
      ...meta,
      issues
    }
  }
}

export function compilationError(message: string, details?: Record<string, any>): ErrorResponse {
  return {
    ok: false,
    code: 'COMPILATION_ERROR',
    message,
    meta: details
  }
}

// Error class for throwing typed errors
export class TypedError extends Error {
  public readonly response: ErrorResponse

  constructor(response: ErrorResponse) {
    super(response.message)
    this.response = response
    this.name = 'TypedError'
  }

  static isPlanLimit(error: any): error is TypedError {
    return error instanceof TypedError && error.response.code === 'PLAN_LIMIT'
  }

  static isFeatureLocked(error: any): error is TypedError {
    return error instanceof TypedError && error.response.code === 'FEATURE_LOCKED'
  }

  static isRateLimit(error: any): error is TypedError {
    return error instanceof TypedError && error.response.code === 'RATE_LIMIT'
  }

  static isCircuitOpen(error: any): error is TypedError {
    return error instanceof TypedError && error.response.code === 'CIRCUIT_OPEN'
  }

  static isBadRequest(error: any): error is TypedError {
    return error instanceof TypedError && error.response.code === 'BAD_REQUEST'
  }

  static isUnauthorized(error: any): error is TypedError {
    return error instanceof TypedError && error.response.code === 'UNAUTHORIZED'
  }

  static isForbidden(error: any): error is TypedError {
    return error instanceof TypedError && error.response.code === 'FORBIDDEN'
  }

  static isNotFound(error: any): error is TypedError {
    return error instanceof TypedError && error.response.code === 'NOT_FOUND'
  }

  static isServerError(error: any): error is TypedError {
    return error instanceof TypedError && error.response.code === 'SERVER_ERROR'
  }
}

// Helper functions for throwing typed errors
export function throwPlanLimit(message: string, meta?: LimitMeta): never {
  throw new TypedError(planLimit(message, meta))
}

export function throwFeatureLocked(message: string, meta?: FeatureMeta): never {
  throw new TypedError(featureLocked(message, meta))
}

export function throwRateLimit(message: string, retryAfterSec?: number, meta?: RateLimitMeta): never {
  throw new TypedError(rateLimit(message, retryAfterSec, meta))
}

export function throwCircuitOpen(message: string, meta?: Record<string, any>): never {
  throw new TypedError(circuitOpen(message, meta))
}

export function throwBadRequest(message: string, meta?: Record<string, any>): never {
  throw new TypedError(badRequest(message, meta))
}

export function throwUnauthorized(message?: string, meta?: Record<string, any>): never {
  throw new TypedError(unauthorized(message, meta))
}

export function throwForbidden(message?: string, meta?: Record<string, any>): never {
  throw new TypedError(forbidden(message, meta))
}

export function throwNotFound(message?: string, meta?: Record<string, any>): never {
  throw new TypedError(notFound(message, meta))
}

export function throwServerError(message?: string, meta?: Record<string, any>): never {
  throw new TypedError(serverError(message, meta))
}

// Helper to check if error should trigger upgrade dialog
export function shouldShowUpgradeDialog(error: any): boolean {
  if (error instanceof TypedError) {
    return error.response.code === 'PLAN_LIMIT' || error.response.code === 'FEATURE_LOCKED'
  }

  if (typeof error === 'object' && error?.code) {
    return error.code === 'PLAN_LIMIT' || error.code === 'FEATURE_LOCKED'
  }

  return false
}

// Helper to extract upgrade dialog props from error
export function getUpgradeDialogProps(error: any): {
  code: 'PLAN_LIMIT' | 'FEATURE_LOCKED'
  detail?: LimitMeta | FeatureMeta
} | null {
  let response: ErrorResponse | null = null

  if (error instanceof TypedError) {
    response = error.response
  } else if (typeof error === 'object' && error?.code) {
    response = error as ErrorResponse
  }

  if (!response || !shouldShowUpgradeDialog({ code: response.code })) {
    return null
  }

  return {
    code: response.code as 'PLAN_LIMIT' | 'FEATURE_LOCKED',
    detail: response.meta as LimitMeta | FeatureMeta
  }
}

// Helper to format error for user display
export function formatErrorMessage(error: any): string {
  if (error instanceof TypedError) {
    return error.response.message
  }

  if (typeof error === 'object' && error?.message) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'An unexpected error occurred'
}

// Helper to get HTTP status code for error response
export function getErrorStatusCode(response: ErrorResponse): number {
  switch (response.code) {
    case 'BAD_REQUEST':
    case 'VALIDATION_ERROR':
      return 400
    case 'UNAUTHORIZED':
      return 401
    case 'FORBIDDEN':
    case 'PLAN_LIMIT':
    case 'FEATURE_LOCKED':
      return 403
    case 'NOT_FOUND':
      return 404
    case 'COMPILATION_ERROR':
      return 422
    case 'RATE_LIMIT':
      return 429
    case 'SERVER_ERROR':
      return 500
    case 'CIRCUIT_OPEN':
      return 503
    default:
      return 500
  }
}