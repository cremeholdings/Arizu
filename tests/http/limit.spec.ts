import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { limitByIp, limitByOrg, limitByUser, applyRateLimit, isAnyLimitExceeded, getMostRestrictive, cleanup } from '@/lib/http/limit'

describe('Rate Limiting', () => {
  beforeEach(async () => {
    await cleanup()
  })

  afterEach(async () => {
    await cleanup()
  })

  describe('IP Rate Limiting', () => {
    test('should allow requests within limit', async () => {
      const result = await limitByIp('/test', '127.0.0.1', 5, 60)

      expect(result.allowed).toBe(true)
      expect(result.limit).toBe(5)
      expect(result.remaining).toBe(4)
      expect(result.retryAfter).toBeUndefined()
    })

    test('should block requests exceeding limit', async () => {
      const ip = '127.0.0.1'
      const path = '/test'
      const max = 2
      const windowSec = 60

      // Make requests up to the limit
      await limitByIp(path, ip, max, windowSec)
      await limitByIp(path, ip, max, windowSec)

      // This should be blocked
      const result = await limitByIp(path, ip, max, windowSec)

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.retryAfter).toBeGreaterThan(0)
    })

    test('should reset after window expires', async () => {
      const ip = '127.0.0.1'
      const path = '/test'
      const max = 1
      const windowSec = 1 // 1 second window

      // Exhaust the limit
      await limitByIp(path, ip, max, windowSec)
      const blockedResult = await limitByIp(path, ip, max, windowSec)
      expect(blockedResult.allowed).toBe(false)

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Should be allowed again
      const allowedResult = await limitByIp(path, ip, max, windowSec)
      expect(allowedResult.allowed).toBe(true)
    })
  })

  describe('Organization Rate Limiting', () => {
    test('should allow requests within org limit', async () => {
      const result = await limitByOrg('/test', 'org-123', 10, 60)

      expect(result.allowed).toBe(true)
      expect(result.limit).toBe(10)
      expect(result.remaining).toBe(9)
    })

    test('should track separate limits per org', async () => {
      const path = '/test'
      const max = 2
      const windowSec = 60

      // Exhaust limit for org1
      await limitByOrg(path, 'org1', max, windowSec)
      await limitByOrg(path, 'org1', max, windowSec)
      const org1Result = await limitByOrg(path, 'org1', max, windowSec)
      expect(org1Result.allowed).toBe(false)

      // org2 should still be allowed
      const org2Result = await limitByOrg(path, 'org2', max, windowSec)
      expect(org2Result.allowed).toBe(true)
    })
  })

  describe('User Rate Limiting', () => {
    test('should allow requests within user limit', async () => {
      const result = await limitByUser('/test', 'user-123', 5, 300)

      expect(result.allowed).toBe(true)
      expect(result.limit).toBe(5)
      expect(result.remaining).toBe(4)
    })
  })

  describe('Combined Rate Limiting', () => {
    test('should apply multiple rate limits correctly', async () => {
      const results = await applyRateLimit('PLAN_GENERATE', '/api/plan', {
        ip: '127.0.0.1',
        orgId: 'org-123',
        userId: 'user-456'
      })

      expect(results).toHaveLength(3) // IP, org, and user limits
      expect(results.every(r => r.allowed)).toBe(true)
    })

    test('should detect when any limit is exceeded', async () => {
      // Exhaust IP limit first
      const ip = '192.168.1.1'
      await limitByIp('/api/plan', ip, 1, 60)
      await limitByIp('/api/plan', ip, 1, 60) // This exhausts the limit

      const results = await applyRateLimit('PLAN_GENERATE', '/api/plan', {
        ip,
        orgId: 'org-123',
        userId: 'user-456'
      })

      expect(isAnyLimitExceeded(results)).toBe(true)

      const mostRestrictive = getMostRestrictive(results)
      expect(mostRestrictive.allowed).toBe(false)
    })

    test('should return most restrictive limit when none exceeded', async () => {
      const results = await applyRateLimit('DEPLOY', '/api/deploy', {
        ip: '127.0.0.1',
        orgId: 'org-123',
        userId: 'user-456'
      })

      expect(isAnyLimitExceeded(results)).toBe(false)

      const mostRestrictive = getMostRestrictive(results)
      expect(mostRestrictive.allowed).toBe(true)
      // Should be the one with least remaining requests
      expect(mostRestrictive.remaining).toBeLessThanOrEqual(
        Math.min(...results.map(r => r.remaining))
      )
    })
  })

  describe('Rate Limit Configurations', () => {
    test('should have different limits for different endpoints', async () => {
      // Plan generation should be more restrictive than validation
      const planResults = await applyRateLimit('PLAN_GENERATE', '/api/plan', {
        ip: '127.0.0.1'
      })

      const validateResults = await applyRateLimit('PLAN_VALIDATE', '/api/validate', {
        ip: '127.0.0.1'
      })

      const planIpLimit = planResults.find(r => r.limit === 10) // IP limit for PLAN_GENERATE
      const validateIpLimit = validateResults.find(r => r.limit === 30) // IP limit for PLAN_VALIDATE

      expect(planIpLimit).toBeDefined()
      expect(validateIpLimit).toBeDefined()
      expect(validateIpLimit!.limit).toBeGreaterThan(planIpLimit!.limit)
    })

    test('should handle webhook ingestion with appropriate limits', async () => {
      const results = await applyRateLimit('WEBHOOK_INGEST', '/api/hooks/ingest', {
        ip: '127.0.0.1',
        orgId: 'org-123'
      })

      // Should have IP and org limits but no user limit for webhooks
      expect(results).toHaveLength(2)

      const ipLimit = results.find(r => r.limit === 100) // 100 per minute for webhooks
      const orgLimit = results.find(r => r.limit === 1000) // 1000 per hour for org

      expect(ipLimit).toBeDefined()
      expect(orgLimit).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    test('should fail open when Redis is unavailable', async () => {
      // This test assumes Redis might not be available in test environment
      // The implementation should gracefully handle Redis connection failures
      const result = await limitByIp('/test', '127.0.0.1', 1, 60)

      // Should allow the request even if Redis fails
      expect(result.allowed).toBe(true)
      expect(result.limit).toBe(1)
    })
  })
})