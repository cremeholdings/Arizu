import { createClient } from "redis"

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetTime: number
  retryAfter?: number
}

export interface RateLimitConfig {
  max: number
  windowSec: number
  redisUrl?: string
}

class RedisRateLimiter {
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
        console.error('Redis rate limiter error:', {
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      })

      await this.client.connect()
      this.connecting = false

      return this.client
    } catch (error) {
      this.connecting = false
      console.error('Failed to connect to Redis for rate limiting:', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  async slidingWindow(
    key: string,
    max: number,
    windowSec: number
  ): Promise<RateLimitResult> {
    try {
      const client = await this.getClient()
      const now = Date.now()
      const windowMs = windowSec * 1000
      const windowStart = now - windowMs

      // Use Redis pipeline for atomic operations
      const pipeline = client.multi()

      // Remove expired entries
      pipeline.zRemRangeByScore(key, 0, windowStart)

      // Count current requests in window
      pipeline.zCard(key)

      // Add current request
      pipeline.zAdd(key, { score: now, value: `${now}-${Math.random()}` })

      // Set expiration for cleanup
      pipeline.expire(key, windowSec * 2)

      const results = await pipeline.exec()

      if (!results) {
        throw new Error('Redis pipeline failed')
      }

      const currentCount = (results[1] as number) || 0
      const allowed = currentCount < max
      const remaining = Math.max(0, max - currentCount - 1)
      const resetTime = now + windowMs

      let retryAfter: number | undefined
      if (!allowed) {
        // Calculate when the oldest request in window will expire
        const oldestEntries = await client.zRange(key, 0, 0, { REV: false })
        if (oldestEntries.length > 0) {
          const oldestTime = await client.zScore(key, oldestEntries[0])
          if (oldestTime) {
            retryAfter = Math.ceil((oldestTime + windowMs - now) / 1000)
          }
        }
        retryAfter = retryAfter || windowSec
      }

      console.log('Rate limit check:', {
        key: key.substring(0, 20) + '...',
        allowed,
        currentCount: currentCount + 1,
        limit: max,
        remaining,
        windowSec
      })

      return {
        allowed,
        limit: max,
        remaining,
        resetTime,
        retryAfter
      }

    } catch (error) {
      console.error('Rate limiting error:', {
        key: key.substring(0, 20) + '...',
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      // Fail open - allow request if Redis is down
      return {
        allowed: true,
        limit: max,
        remaining: max - 1,
        resetTime: Date.now() + windowSec * 1000
      }
    }
  }

  async disconnect() {
    if (this.client?.isOpen) {
      await this.client.disconnect()
    }
  }
}

// Global limiter instance
let globalLimiter: RedisRateLimiter | null = null

function getLimiter(): RedisRateLimiter {
  if (!globalLimiter) {
    globalLimiter = new RedisRateLimiter()
  }
  return globalLimiter
}

export async function limitByIp(
  path: string,
  ip: string,
  max: number,
  windowSec: number
): Promise<RateLimitResult> {
  const limiter = getLimiter()
  const key = `rate_limit:ip:${ip}:${path}`

  return await limiter.slidingWindow(key, max, windowSec)
}

export async function limitByOrg(
  path: string,
  orgId: string,
  max: number,
  windowSec: number
): Promise<RateLimitResult> {
  const limiter = getLimiter()
  const key = `rate_limit:org:${orgId}:${path}`

  return await limiter.slidingWindow(key, max, windowSec)
}

export async function limitByUser(
  path: string,
  userId: string,
  max: number,
  windowSec: number
): Promise<RateLimitResult> {
  const limiter = getLimiter()
  const key = `rate_limit:user:${userId}:${path}`

  return await limiter.slidingWindow(key, max, windowSec)
}

// Combined rate limiting for multiple dimensions
export async function limitMultiple(
  path: string,
  limits: Array<{
    type: 'ip' | 'org' | 'user'
    id: string
    max: number
    windowSec: number
  }>
): Promise<RateLimitResult[]> {
  const results = await Promise.all(
    limits.map(async (limit) => {
      switch (limit.type) {
        case 'ip':
          return await limitByIp(path, limit.id, limit.max, limit.windowSec)
        case 'org':
          return await limitByOrg(path, limit.id, limit.max, limit.windowSec)
        case 'user':
          return await limitByUser(path, limit.id, limit.max, limit.windowSec)
        default:
          throw new Error(`Unknown limit type: ${limit.type}`)
      }
    })
  )

  return results
}

// Helper to check if any limit is exceeded
export function isAnyLimitExceeded(results: RateLimitResult[]): boolean {
  return results.some(result => !result.allowed)
}

// Helper to get the most restrictive limit
export function getMostRestrictive(results: RateLimitResult[]): RateLimitResult {
  const blocked = results.find(result => !result.allowed)
  if (blocked) {
    return blocked
  }

  // Return the limit with least remaining requests
  return results.reduce((most, current) =>
    current.remaining < most.remaining ? current : most
  )
}

// Rate limit configurations for different endpoints
export const RATE_LIMITS = {
  // Planner API - expensive LLM calls
  PLAN_GENERATE: {
    ip: { max: 10, windowSec: 60 },      // 10 per minute per IP
    org: { max: 100, windowSec: 3600 },  // 100 per hour per org
    user: { max: 20, windowSec: 300 }    // 20 per 5 minutes per user
  },

  // Validator API - moderate cost
  PLAN_VALIDATE: {
    ip: { max: 30, windowSec: 60 },      // 30 per minute per IP
    org: { max: 500, windowSec: 3600 },  // 500 per hour per org
    user: { max: 60, windowSec: 300 }    // 60 per 5 minutes per user
  },

  // Deploy API - affects external systems
  DEPLOY: {
    ip: { max: 5, windowSec: 60 },       // 5 per minute per IP
    org: { max: 50, windowSec: 3600 },   // 50 per hour per org
    user: { max: 10, windowSec: 300 }    // 10 per 5 minutes per user
  },

  // Webhook ingestion - should be less restrictive
  WEBHOOK_INGEST: {
    ip: { max: 100, windowSec: 60 },     // 100 per minute per IP
    org: { max: 1000, windowSec: 3600 }, // 1000 per hour per org
  },

  // Health checks - very permissive
  HEALTH_CHECK: {
    ip: { max: 60, windowSec: 60 },      // 60 per minute per IP
  },

  // General API fallback
  API_DEFAULT: {
    ip: { max: 100, windowSec: 60 },     // 100 per minute per IP
    org: { max: 1000, windowSec: 3600 }, // 1000 per hour per org
    user: { max: 200, windowSec: 300 }   // 200 per 5 minutes per user
  }
} as const

// Helper to apply rate limiting based on endpoint
export async function applyRateLimit(
  endpoint: keyof typeof RATE_LIMITS,
  path: string,
  context: {
    ip: string
    orgId?: string
    userId?: string
  }
): Promise<RateLimitResult[]> {
  const config = RATE_LIMITS[endpoint]
  const limits: Array<{
    type: 'ip' | 'org' | 'user'
    id: string
    max: number
    windowSec: number
  }> = []

  // Always apply IP limiting
  if (config.ip) {
    limits.push({
      type: 'ip',
      id: context.ip,
      max: config.ip.max,
      windowSec: config.ip.windowSec
    })
  }

  // Apply org limiting if available
  if (config.org && context.orgId) {
    limits.push({
      type: 'org',
      id: context.orgId,
      max: config.org.max,
      windowSec: config.org.windowSec
    })
  }

  // Apply user limiting if available
  if (config.user && context.userId) {
    limits.push({
      type: 'user',
      id: context.userId,
      max: config.user.max,
      windowSec: config.user.windowSec
    })
  }

  return await limitMultiple(path, limits)
}

// Cleanup function for testing
export async function cleanup() {
  if (globalLimiter) {
    await globalLimiter.disconnect()
    globalLimiter = null
  }
}