import { createClient } from "redis"

export interface IdempotentResult<T> {
  value: T
  cached: boolean
  requestId: string
}

export interface IdempotencyConfig {
  ttlSec: number
  redisUrl?: string
}

class RedisIdempotency {
  private client: ReturnType<typeof createClient> | null = null
  private connecting = false

  constructor(private redisUrl?: string) {}

  private async getClient() {
    if (this.client?.isOpen) {
      return this.client
    }

    if (this.connecting) {
      // Wait for existing connection attempt
      await new Promise(resolve => setTimeout(resolve, 100))
      return this.getClient()
    }

    try {
      this.connecting = true

      const url = this.redisUrl || process.env.REDIS_URL || "redis://localhost:6379"
      this.client = createClient({ url })

      this.client.on('error', (error) => {
        console.error('Redis idempotency error:', {
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      })

      await this.client.connect()
      this.connecting = false

      return this.client
    } catch (error) {
      this.connecting = false
      console.error('Failed to connect to Redis for idempotency:', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  async store<T>(
    requestId: string,
    ttlSec: number,
    computeFn: () => Promise<T>
  ): Promise<IdempotentResult<T>> {
    const key = `idempotent:${requestId}`

    try {
      const client = await this.getClient()

      // Check if result already exists
      const cached = await client.get(key)

      if (cached) {
        console.log('Idempotency cache hit:', {
          requestId: requestId.substring(0, 20) + '...',
          key: key.substring(0, 30) + '...'
        })

        try {
          const parsedResult = JSON.parse(cached)
          return {
            value: parsedResult,
            cached: true,
            requestId
          }
        } catch (parseError) {
          console.warn('Failed to parse cached idempotent result:', {
            requestId: requestId.substring(0, 20) + '...',
            error: parseError instanceof Error ? parseError.message : 'Unknown error'
          })
          // Continue to compute fresh result
        }
      }

      // Compute new result
      console.log('Idempotency cache miss, computing result:', {
        requestId: requestId.substring(0, 20) + '...',
        ttlSec
      })

      const result = await computeFn()

      // Store result in cache
      try {
        const serialized = JSON.stringify(result)
        await client.setEx(key, ttlSec, serialized)

        console.log('Idempotency result cached:', {
          requestId: requestId.substring(0, 20) + '...',
          ttlSec,
          resultSize: serialized.length
        })
      } catch (storeError) {
        console.warn('Failed to store idempotent result in cache:', {
          requestId: requestId.substring(0, 20) + '...',
          error: storeError instanceof Error ? storeError.message : 'Unknown error'
        })
        // Continue with the computed result even if caching fails
      }

      return {
        value: result,
        cached: false,
        requestId
      }

    } catch (error) {
      console.error('Idempotency operation failed, computing without cache:', {
        requestId: requestId.substring(0, 20) + '...',
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      // Fallback: compute without caching if Redis is down
      const result = await computeFn()
      return {
        value: result,
        cached: false,
        requestId
      }
    }
  }

  async invalidate(requestId: string): Promise<void> {
    const key = `idempotent:${requestId}`

    try {
      const client = await this.getClient()
      await client.del(key)

      console.log('Idempotency cache invalidated:', {
        requestId: requestId.substring(0, 20) + '...',
        key: key.substring(0, 30) + '...'
      })
    } catch (error) {
      console.warn('Failed to invalidate idempotency cache:', {
        requestId: requestId.substring(0, 20) + '...',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  async exists(requestId: string): Promise<boolean> {
    const key = `idempotent:${requestId}`

    try {
      const client = await this.getClient()
      const exists = await client.exists(key)
      return exists === 1
    } catch (error) {
      console.warn('Failed to check idempotency cache existence:', {
        requestId: requestId.substring(0, 20) + '...',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false
    }
  }

  async disconnect() {
    if (this.client?.isOpen) {
      await this.client.disconnect()
    }
  }
}

// Global idempotency instance
let globalIdempotency: RedisIdempotency | null = null

function getIdempotency(): RedisIdempotency {
  if (!globalIdempotency) {
    globalIdempotency = new RedisIdempotency()
  }
  return globalIdempotency
}

export async function storeIdempotent<T>(
  requestId: string,
  ttlSec: number,
  computeFn: () => Promise<T>
): Promise<IdempotentResult<T>> {
  if (!requestId || requestId.trim().length === 0) {
    throw new Error('Request ID is required for idempotency')
  }

  if (ttlSec <= 0) {
    throw new Error('TTL must be greater than 0')
  }

  const idempotency = getIdempotency()
  return await idempotency.store(requestId, ttlSec, computeFn)
}

export async function invalidateIdempotent(requestId: string): Promise<void> {
  if (!requestId || requestId.trim().length === 0) {
    throw new Error('Request ID is required for invalidation')
  }

  const idempotency = getIdempotency()
  await idempotency.invalidate(requestId)
}

export async function existsIdempotent(requestId: string): Promise<boolean> {
  if (!requestId || requestId.trim().length === 0) {
    return false
  }

  const idempotency = getIdempotency()
  return await idempotency.exists(requestId)
}

// Helper to generate request ID from request data
export function generateRequestId(data: {
  method: string
  path: string
  body?: any
  userId?: string
  orgId?: string
  timestamp?: number
}): string {
  const components = [
    data.method,
    data.path,
    data.userId || 'anonymous',
    data.orgId || 'no-org'
  ]

  // Include body hash if provided
  if (data.body) {
    try {
      const bodyStr = typeof data.body === 'string' ? data.body : JSON.stringify(data.body)
      const hash = require('crypto').createHash('sha256').update(bodyStr).digest('hex')
      components.push(hash.substring(0, 16)) // Use first 16 chars of hash
    } catch {
      components.push('body-hash-failed')
    }
  }

  // Include timestamp for time-based uniqueness (optional)
  if (data.timestamp) {
    components.push(Math.floor(data.timestamp / 1000).toString()) // Round to second
  }

  return components.join(':')
}

// Helper to extract request ID from headers
export function extractRequestId(headers: Headers): string | null {
  // Common idempotency key headers
  const idempotencyHeaders = [
    'idempotency-key',
    'idempotency-id',
    'x-idempotency-key',
    'x-idempotency-id',
    'x-request-id',
    'x-delivery-id', // For webhooks
    'delivery-id'
  ]

  for (const header of idempotencyHeaders) {
    const value = headers.get(header)
    if (value && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
}

// Webhook-specific helpers
export function extractWebhookDeliveryId(headers: Headers): string | null {
  // GitHub, GitLab, and similar services use these headers
  const deliveryHeaders = [
    'x-hub-delivery',
    'x-github-delivery',
    'x-gitlab-event-uuid',
    'x-delivery-id',
    'delivery-id'
  ]

  for (const header of deliveryHeaders) {
    const value = headers.get(header)
    if (value && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
}

// Middleware helper for automatic idempotency
export async function withIdempotency<T>(
  request: Request,
  ttlSec: number,
  computeFn: () => Promise<T>,
  options: {
    generateIdFromBody?: boolean
    requiredHeaders?: string[]
  } = {}
): Promise<IdempotentResult<T>> {
  const headers = request.headers
  let requestId = extractRequestId(headers)

  // If no explicit request ID, try to generate one
  if (!requestId && options.generateIdFromBody) {
    try {
      const body = await request.text()
      const url = new URL(request.url)

      requestId = generateRequestId({
        method: request.method,
        path: url.pathname,
        body: body,
        timestamp: Date.now()
      })
    } catch (error) {
      console.warn('Failed to generate request ID from body:', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  if (!requestId) {
    // No idempotency possible, compute directly
    const result = await computeFn()
    return {
      value: result,
      cached: false,
      requestId: 'no-id-' + Date.now()
    }
  }

  return await storeIdempotent(requestId, ttlSec, computeFn)
}

// Idempotency configurations for different endpoints
export const IDEMPOTENCY_CONFIG = {
  // Webhook processing - should be cached for longer to handle retries
  WEBHOOK_PROCESSING: { ttlSec: 3600 }, // 1 hour

  // Plan generation - cache briefly to handle duplicate requests
  PLAN_GENERATION: { ttlSec: 300 }, // 5 minutes

  // Plan validation - shorter cache as it's less expensive
  PLAN_VALIDATION: { ttlSec: 60 }, // 1 minute

  // Deployment - cache longer as it has side effects
  DEPLOYMENT: { ttlSec: 1800 }, // 30 minutes

  // Default for other operations
  DEFAULT: { ttlSec: 300 } // 5 minutes
} as const

// Cleanup function for testing
export async function cleanup() {
  if (globalIdempotency) {
    await globalIdempotency.disconnect()
    globalIdempotency = null
  }
}