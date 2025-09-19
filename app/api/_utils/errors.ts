import { NextResponse } from "next/server"
import { ZodError } from "zod"

export interface ApiError {
  error: string
  code?: string
  details?: any
  timestamp?: string
}

export interface ApiSuccess<T = any> {
  ok: true
  data: T
  timestamp?: string
}

export interface ApiResponse<T = any> {
  ok: boolean
  data?: T
  error?: string
  code?: string
  details?: any
  timestamp: string
}

// Standard error codes
export const ERROR_CODES = {
  // Authentication & Authorization
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  ORG_REQUIRED: "ORG_REQUIRED",
  INSUFFICIENT_ROLE: "INSUFFICIENT_ROLE",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  ORG_NOT_FOUND: "ORG_NOT_FOUND",
  NOT_MEMBER: "NOT_MEMBER",

  // Validation
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",

  // Resource Management
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  RESOURCE_ALREADY_EXISTS: "RESOURCE_ALREADY_EXISTS",
  RESOURCE_CONFLICT: "RESOURCE_CONFLICT",

  // Usage & Limits
  USAGE_LIMIT_EXCEEDED: "USAGE_LIMIT_EXCEEDED",
  PLAN_LIMIT_EXCEEDED: "PLAN_LIMIT_EXCEEDED",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",

  // External Services
  EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR",
  N8N_ERROR: "N8N_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",

  // Generic
  INTERNAL_ERROR: "INTERNAL_ERROR",
  BAD_REQUEST: "BAD_REQUEST",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
} as const

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]

// Error response builders
export function createErrorResponse(
  message: string,
  status: number = 500,
  code?: ErrorCode,
  details?: any
): NextResponse {
  const response: ApiError = {
    error: message,
    timestamp: new Date().toISOString(),
  }

  if (code) {
    response.code = code
  }

  if (details) {
    response.details = details
  }

  return NextResponse.json(response, { status })
}

export function createSuccessResponse<T>(
  data: T,
  status: number = 200
): NextResponse {
  const response: ApiSuccess<T> = {
    ok: true,
    data,
    timestamp: new Date().toISOString(),
  }

  return NextResponse.json(response, { status })
}

// Specific error handlers
export function unauthorizedError(
  message: string = "Authentication required"
): NextResponse {
  return createErrorResponse(message, 401, ERROR_CODES.UNAUTHORIZED)
}

export function forbiddenError(
  message: string = "Access denied",
  code: ErrorCode = ERROR_CODES.FORBIDDEN
): NextResponse {
  return createErrorResponse(message, 403, code)
}

export function orgRequiredError(
  message: string = "Organization context required"
): NextResponse {
  return createErrorResponse(message, 403, ERROR_CODES.ORG_REQUIRED)
}

export function insufficientRoleError(
  requiredRole: string,
  userRole: string
): NextResponse {
  return createErrorResponse(
    `Insufficient permissions. Required: ${requiredRole}, Current: ${userRole}`,
    403,
    ERROR_CODES.INSUFFICIENT_ROLE,
    { requiredRole, userRole }
  )
}

export function notFoundError(
  resource: string = "Resource"
): NextResponse {
  return createErrorResponse(
    `${resource} not found`,
    404,
    ERROR_CODES.RESOURCE_NOT_FOUND
  )
}

export function validationError(
  message: string = "Validation failed",
  details?: any
): NextResponse {
  return createErrorResponse(
    message,
    400,
    ERROR_CODES.VALIDATION_ERROR,
    details
  )
}

export function conflictError(
  message: string = "Resource conflict"
): NextResponse {
  return createErrorResponse(
    message,
    409,
    ERROR_CODES.RESOURCE_CONFLICT
  )
}

export function usageLimitError(
  usageType: string,
  limit: number,
  current: number
): NextResponse {
  return createErrorResponse(
    `Usage limit exceeded for ${usageType}`,
    429,
    ERROR_CODES.USAGE_LIMIT_EXCEEDED,
    {
      usageType,
      limit,
      current,
      message: `You have reached your monthly limit of ${limit} ${usageType}. Current usage: ${current}`,
    }
  )
}

export function rateLimitError(
  message: string = "Rate limit exceeded"
): NextResponse {
  return createErrorResponse(message, 429, ERROR_CODES.RATE_LIMIT_EXCEEDED)
}

export function methodNotAllowedError(
  allowedMethods: string[] = []
): NextResponse {
  const response = createErrorResponse(
    "Method not allowed",
    405,
    ERROR_CODES.METHOD_NOT_ALLOWED,
    { allowedMethods }
  )

  if (allowedMethods.length > 0) {
    response.headers.set("Allow", allowedMethods.join(", "))
  }

  return response
}

export function internalServerError(
  message: string = "Internal server error",
  details?: any
): NextResponse {
  // Log the actual error for debugging (don't expose to client)
  console.error("Internal server error:", { message, details })

  return createErrorResponse(
    "An unexpected error occurred",
    500,
    ERROR_CODES.INTERNAL_ERROR
  )
}

// Error handler for common patterns
export function handleApiError(error: unknown): NextResponse {
  console.error("API Error:", error)

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    return validationError("Validation failed", {
      issues: error.issues.map(issue => ({
        path: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      })),
    })
  }

  // Handle Prisma errors
  if (error && typeof error === "object" && "code" in error) {
    const prismaError = error as any

    switch (prismaError.code) {
      case "P2002":
        return conflictError("A record with this information already exists")
      case "P2025":
        return notFoundError("Record")
      case "P2003":
        return validationError("Foreign key constraint failed")
      default:
        return internalServerError("Database error")
    }
  }

  // Handle known error objects
  if (error && typeof error === "object" && "message" in error) {
    const err = error as Error

    // Check for specific error messages that should be exposed
    if (err.message.includes("Insufficient permissions")) {
      return forbiddenError(err.message, ERROR_CODES.INSUFFICIENT_ROLE)
    }

    if (err.message.includes("not found")) {
      return notFoundError()
    }
  }

  // Default to internal server error
  return internalServerError()
}

// Type guards
export function isApiError(obj: any): obj is ApiError {
  return obj && typeof obj === "object" && "error" in obj
}

export function isApiSuccess<T>(obj: any): obj is ApiSuccess<T> {
  return obj && typeof obj === "object" && obj.ok === true && "data" in obj
}

// Utility to parse API responses on client side
export function parseApiResponse<T>(response: any): ApiResponse<T> {
  const timestamp = new Date().toISOString()

  if (isApiSuccess<T>(response)) {
    return {
      ok: true,
      data: response.data,
      timestamp: response.timestamp || timestamp,
    }
  }

  if (isApiError(response)) {
    return {
      ok: false,
      error: response.error,
      code: response.code,
      details: response.details,
      timestamp: response.timestamp || timestamp,
    }
  }

  // Fallback for unknown response format
  return {
    ok: false,
    error: "Unknown response format",
    code: ERROR_CODES.INTERNAL_ERROR,
    timestamp,
  }
}