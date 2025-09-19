import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import {
  storeIdempotent,
  invalidateIdempotent,
  existsIdempotent,
  generateRequestId,
  extractRequestId,
  extractWebhookDeliveryId,
  withIdempotency,
  cleanup
} from '@/lib/http/idempotency'

describe('Idempotency', () => {
  beforeEach(async () => {
    await cleanup()
  })

  afterEach(async () => {
    await cleanup()
  })

  describe('Basic Idempotent Storage', () => {
    test('should cache result and return cached value on subsequent calls', async () => {
      const requestId = 'test-request-1'
      let callCount = 0

      const computeFn = async () => {
        callCount++
        return { data: `result-${callCount}`, timestamp: Date.now() }
      }

      // First call should compute the result
      const result1 = await storeIdempotent(requestId, 60, computeFn)
      expect(result1.cached).toBe(false)
      expect(result1.value.data).toBe('result-1')
      expect(callCount).toBe(1)

      // Second call should return cached result
      const result2 = await storeIdempotent(requestId, 60, computeFn)
      expect(result2.cached).toBe(true)
      expect(result2.value.data).toBe('result-1') // Same as first call
      expect(callCount).toBe(1) // Function wasn't called again
    })

    test('should compute fresh result for different request IDs', async () => {
      let callCount = 0

      const computeFn = async () => {
        callCount++
        return { count: callCount }
      }

      const result1 = await storeIdempotent('request-1', 60, computeFn)
      const result2 = await storeIdempotent('request-2', 60, computeFn)

      expect(result1.cached).toBe(false)
      expect(result2.cached).toBe(false)
      expect(result1.value.count).toBe(1)
      expect(result2.value.count).toBe(2)
      expect(callCount).toBe(2)
    })

    test('should handle TTL expiration', async () => {
      const requestId = 'test-expiry'
      let callCount = 0

      const computeFn = async () => {
        callCount++
        return { count: callCount }
      }

      // Store with very short TTL
      const result1 = await storeIdempotent(requestId, 1, computeFn) // 1 second TTL
      expect(result1.cached).toBe(false)
      expect(callCount).toBe(1)

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Should compute fresh result after expiration
      const result2 = await storeIdempotent(requestId, 60, computeFn)
      expect(result2.cached).toBe(false)
      expect(result2.value.count).toBe(2)
      expect(callCount).toBe(2)
    })
  })

  describe('Idempotency Management', () => {
    test('should check if request exists', async () => {
      const requestId = 'test-exists'

      // Initially should not exist
      const existsBefore = await existsIdempotent(requestId)
      expect(existsBefore).toBe(false)

      // Store a result
      await storeIdempotent(requestId, 60, async () => ({ data: 'test' }))

      // Now should exist
      const existsAfter = await existsIdempotent(requestId)
      expect(existsAfter).toBe(true)
    })

    test('should invalidate cached results', async () => {
      const requestId = 'test-invalidate'
      let callCount = 0

      const computeFn = async () => {
        callCount++
        return { count: callCount }
      }

      // Store initial result
      const result1 = await storeIdempotent(requestId, 60, computeFn)
      expect(result1.cached).toBe(false)
      expect(callCount).toBe(1)

      // Invalidate the cache
      await invalidateIdempotent(requestId)

      // Should compute fresh result after invalidation
      const result2 = await storeIdempotent(requestId, 60, computeFn)
      expect(result2.cached).toBe(false)
      expect(result2.value.count).toBe(2)
      expect(callCount).toBe(2)
    })
  })

  describe('Request ID Generation', () => {
    test('should generate consistent request IDs for same input', async () => {
      const data = {
        method: 'POST',
        path: '/api/plan',
        body: { prompt: 'test automation' },
        userId: 'user-123',
        orgId: 'org-456'
      }

      const id1 = generateRequestId(data)
      const id2 = generateRequestId(data)

      expect(id1).toBe(id2)
      expect(id1).toContain('POST')
      expect(id1).toContain('/api/plan')
      expect(id1).toContain('user-123')
      expect(id1).toContain('org-456')
    })

    test('should generate different request IDs for different inputs', async () => {
      const data1 = {
        method: 'POST',
        path: '/api/plan',
        body: { prompt: 'automation 1' },
        userId: 'user-123',
        orgId: 'org-456'
      }

      const data2 = {
        method: 'POST',
        path: '/api/plan',
        body: { prompt: 'automation 2' },
        userId: 'user-123',
        orgId: 'org-456'
      }

      const id1 = generateRequestId(data1)
      const id2 = generateRequestId(data2)

      expect(id1).not.toBe(id2)
    })

    test('should include timestamp for time-based uniqueness', async () => {
      const baseData = {
        method: 'POST',
        path: '/api/plan',
        userId: 'user-123',
        orgId: 'org-456'
      }

      const id1 = generateRequestId({ ...baseData, timestamp: 1000 })
      const id2 = generateRequestId({ ...baseData, timestamp: 2000 })

      expect(id1).not.toBe(id2)
      expect(id1).toContain('1')
      expect(id2).toContain('2')
    })
  })

  describe('Header Extraction', () => {
    test('should extract request ID from headers', async () => {
      const headers = new Headers({
        'idempotency-key': 'test-key-123',
        'content-type': 'application/json'
      })

      const requestId = extractRequestId(headers)
      expect(requestId).toBe('test-key-123')
    })

    test('should try multiple header variations', async () => {
      const testCases = [
        { header: 'x-idempotency-key', value: 'x-key-123' },
        { header: 'x-request-id', value: 'x-req-456' },
        { header: 'idempotency-id', value: 'id-789' }
      ]

      for (const { header, value } of testCases) {
        const headers = new Headers({ [header]: value })
        const requestId = extractRequestId(headers)
        expect(requestId).toBe(value)
      }
    })

    test('should extract webhook delivery IDs', async () => {
      const testCases = [
        { header: 'x-github-delivery', value: 'github-123' },
        { header: 'x-gitlab-event-uuid', value: 'gitlab-456' },
        { header: 'x-hub-delivery', value: 'hub-789' }
      ]

      for (const { header, value } of testCases) {
        const headers = new Headers({ [header]: value })
        const deliveryId = extractWebhookDeliveryId(headers)
        expect(deliveryId).toBe(value)
      }
    })

    test('should return null when no headers present', async () => {
      const headers = new Headers({
        'content-type': 'application/json'
      })

      expect(extractRequestId(headers)).toBeNull()
      expect(extractWebhookDeliveryId(headers)).toBeNull()
    })
  })

  describe('Middleware Integration', () => {
    test('should work with Request objects', async () => {
      const request = new Request('https://example.com/api/test', {
        method: 'POST',
        headers: {
          'idempotency-key': 'middleware-test-123',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ data: 'test' })
      })

      let callCount = 0
      const computeFn = async () => {
        callCount++
        return { processed: true, count: callCount }
      }

      // First call
      const result1 = await withIdempotency(request, 60, computeFn)
      expect(result1.cached).toBe(false)
      expect(result1.value.processed).toBe(true)
      expect(result1.value.count).toBe(1)
      expect(callCount).toBe(1)

      // Create identical request
      const request2 = new Request('https://example.com/api/test', {
        method: 'POST',
        headers: {
          'idempotency-key': 'middleware-test-123',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ data: 'test' })
      })

      // Second call should be cached
      const result2 = await withIdempotency(request2, 60, computeFn)
      expect(result2.cached).toBe(true)
      expect(result2.value.count).toBe(1) // Same as first call
      expect(callCount).toBe(1) // Function not called again
    })

    test('should generate ID from body when no header present', async () => {
      const request = new Request('https://example.com/api/test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ data: 'unique-content' })
      })

      let callCount = 0
      const computeFn = async () => {
        callCount++
        return { count: callCount }
      }

      // Should generate ID from body content
      const result = await withIdempotency(request, 60, computeFn, {
        generateIdFromBody: true
      })

      expect(result.cached).toBe(false)
      expect(result.requestId).toContain('POST')
      expect(result.requestId).not.toBe('no-id-' + expect.any(Number))
    })

    test('should fallback to timestamped ID when no idempotency possible', async () => {
      const request = new Request('https://example.com/api/test', {
        method: 'GET'
      })

      const result = await withIdempotency(request, 60, async () => ({ data: 'test' }))

      expect(result.cached).toBe(false)
      expect(result.requestId).toMatch(/^no-id-\d+$/)
    })
  })

  describe('Error Handling', () => {
    test('should require valid request ID', async () => {
      await expect(storeIdempotent('', 60, async () => ({}))).rejects.toThrow('Request ID is required')
      await expect(storeIdempotent('   ', 60, async () => ({}))).rejects.toThrow('Request ID is required')
    })

    test('should require positive TTL', async () => {
      await expect(storeIdempotent('test', 0, async () => ({}))).rejects.toThrow('TTL must be greater than 0')
      await expect(storeIdempotent('test', -1, async () => ({}))).rejects.toThrow('TTL must be greater than 0')
    })

    test('should handle compute function errors gracefully', async () => {
      const requestId = 'error-test'
      const errorMessage = 'Computation failed'

      const computeFn = async () => {
        throw new Error(errorMessage)
      }

      await expect(storeIdempotent(requestId, 60, computeFn)).rejects.toThrow(errorMessage)

      // Should not cache error results
      const exists = await existsIdempotent(requestId)
      expect(exists).toBe(false)
    })

    test('should handle Redis failures gracefully', async () => {
      // This test assumes Redis might not be available
      // The implementation should fall back to computing without caching
      const result = await storeIdempotent('fallback-test', 60, async () => ({
        data: 'computed-without-cache'
      }))

      expect(result.value.data).toBe('computed-without-cache')
    })
  })
})