import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  CircuitBreaker,
  CircuitState,
  CircuitBreakerError,
  withCircuitBreaker,
  getCircuitBreaker,
  resetAllCircuitBreakers,
  CIRCUIT_CONFIGS
} from '@/lib/http/circuit'

describe('Circuit Breaker', () => {
  beforeEach(() => {
    resetAllCircuitBreakers()
    vi.clearAllTimers()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllTimers()
    resetAllCircuitBreakers()
  })

  describe('Basic Circuit Breaker Functionality', () => {
    test('should start in closed state and allow requests', async () => {
      const breaker = new CircuitBreaker('test', CIRCUIT_CONFIGS.LLM_API)

      const operation = vi.fn().mockResolvedValue('success')
      const result = await breaker.execute(operation)

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledOnce()
      expect(breaker.getState().state).toBe(CircuitState.CLOSED)
    })

    test('should track successful requests', async () => {
      const breaker = new CircuitBreaker('test', CIRCUIT_CONFIGS.LLM_API)

      const operation = vi.fn().mockResolvedValue('success')
      await breaker.execute(operation)

      const state = breaker.getState()
      expect(state.requests).toBe(1)
      expect(state.failures).toBe(0)
    })

    test('should track failed requests', async () => {
      const breaker = new CircuitBreaker('test', CIRCUIT_CONFIGS.LLM_API)

      const operation = vi.fn().mockRejectedValue(new Error('operation failed'))

      await expect(breaker.execute(operation)).rejects.toThrow('operation failed')

      const state = breaker.getState()
      expect(state.requests).toBe(1)
      expect(state.failures).toBe(1)
    })
  })

  describe('Circuit States Transitions', () => {
    test('should open circuit when failure threshold is reached', async () => {
      const config = {
        ...CIRCUIT_CONFIGS.LLM_API,
        failureThreshold: 3,
        minimumRequests: 2,
        errorPercentageThreshold: 50
      }
      const breaker = new CircuitBreaker('test', config)

      const failingOperation = vi.fn().mockRejectedValue(new Error('fail'))

      // Generate enough requests to trigger circuit opening
      await expect(breaker.execute(failingOperation)).rejects.toThrow('fail')
      await expect(breaker.execute(failingOperation)).rejects.toThrow('fail')

      // Circuit should now be open
      expect(breaker.getState().state).toBe(CircuitState.OPEN)
    })

    test('should reject requests immediately when circuit is open', async () => {
      const breaker = new CircuitBreaker('test', {
        ...CIRCUIT_CONFIGS.LLM_API,
        failureThreshold: 1,
        minimumRequests: 1,
        errorPercentageThreshold: 50,
        resetTimeoutMs: 30000
      })

      // Force circuit to open
      const failingOperation = vi.fn().mockRejectedValue(new Error('fail'))
      await expect(breaker.execute(failingOperation)).rejects.toThrow('fail')

      expect(breaker.getState().state).toBe(CircuitState.OPEN)

      // Subsequent requests should be rejected immediately
      const operation = vi.fn().mockResolvedValue('success')
      await expect(breaker.execute(operation)).rejects.toThrow(CircuitBreakerError)

      // Operation should not have been called
      expect(operation).not.toHaveBeenCalled()
    })

    test('should transition to half-open after reset timeout', async () => {
      const breaker = new CircuitBreaker('test', {
        ...CIRCUIT_CONFIGS.LLM_API,
        failureThreshold: 1,
        minimumRequests: 1,
        errorPercentageThreshold: 50,
        resetTimeoutMs: 1000
      })

      // Force circuit to open
      const failingOperation = vi.fn().mockRejectedValue(new Error('fail'))
      await expect(breaker.execute(failingOperation)).rejects.toThrow('fail')
      expect(breaker.getState().state).toBe(CircuitState.OPEN)

      // Fast-forward time past reset timeout
      vi.advanceTimersByTime(1001)

      // Next request should transition to half-open
      const operation = vi.fn().mockResolvedValue('success')
      const result = await breaker.execute(operation)

      expect(result).toBe('success')
      expect(breaker.getState().state).toBe(CircuitState.CLOSED) // Success transitions to closed
    })

    test('should close circuit on successful request in half-open state', async () => {
      const breaker = new CircuitBreaker('test', {
        ...CIRCUIT_CONFIGS.LLM_API,
        failureThreshold: 1,
        minimumRequests: 1,
        errorPercentageThreshold: 50,
        resetTimeoutMs: 1000
      })

      // Force circuit to open
      await expect(breaker.execute(vi.fn().mockRejectedValue(new Error('fail')))).rejects.toThrow()

      // Wait for reset timeout
      vi.advanceTimersByTime(1001)

      // Successful request should close the circuit
      const successOperation = vi.fn().mockResolvedValue('success')
      await breaker.execute(successOperation)

      expect(breaker.getState().state).toBe(CircuitState.CLOSED)
      expect(breaker.getState().failures).toBe(0)
      expect(breaker.getState().requests).toBe(0)
    })

    test('should reopen circuit on failure in half-open state', async () => {
      const breaker = new CircuitBreaker('test', {
        ...CIRCUIT_CONFIGS.LLM_API,
        failureThreshold: 1,
        minimumRequests: 1,
        errorPercentageThreshold: 50,
        resetTimeoutMs: 1000
      })

      // Force circuit to open
      await expect(breaker.execute(vi.fn().mockRejectedValue(new Error('fail')))).rejects.toThrow()

      // Wait for reset timeout
      vi.advanceTimersByTime(1001)

      // Failed request should reopen the circuit
      const failOperation = vi.fn().mockRejectedValue(new Error('still failing'))
      await expect(breaker.execute(failOperation)).rejects.toThrow('still failing')

      expect(breaker.getState().state).toBe(CircuitState.OPEN)
    })
  })

  describe('Retry Logic', () => {
    test('should retry failed operations with exponential backoff', async () => {
      const breaker = new CircuitBreaker('test', {
        ...CIRCUIT_CONFIGS.LLM_API,
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        jitterMs: 0
      })

      let attemptCount = 0
      const operation = vi.fn().mockImplementation(() => {
        attemptCount++
        if (attemptCount < 3) {
          throw new Error(`Attempt ${attemptCount} failed`)
        }
        return Promise.resolve('success')
      })

      const result = await breaker.execute(operation)

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(3)
    })

    test('should respect maximum retry attempts', async () => {
      const breaker = new CircuitBreaker('test', {
        ...CIRCUIT_CONFIGS.LLM_API,
        maxRetries: 2,
        baseDelayMs: 10
      })

      const operation = vi.fn().mockRejectedValue(new Error('always fails'))

      await expect(breaker.execute(operation)).rejects.toThrow('always fails')
      expect(operation).toHaveBeenCalledTimes(2) // maxRetries
    })

    test('should calculate retry delays correctly', async () => {
      const breaker = new CircuitBreaker('test', {
        ...CIRCUIT_CONFIGS.LLM_API,
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 500,
        jitterMs: 0
      })

      const delays: number[] = []
      let attemptCount = 0

      const operation = vi.fn().mockImplementation(() => {
        attemptCount++
        if (attemptCount < 3) {
          const startTime = Date.now()
          return Promise.reject(new Error('fail')).catch(err => {
            delays.push(Date.now() - startTime)
            throw err
          })
        }
        return Promise.resolve('success')
      })

      // Mock setTimeout to track delays
      const originalSetTimeout = global.setTimeout
      const actualDelays: number[] = []
      vi.spyOn(global, 'setTimeout').mockImplementation((callback, delay) => {
        actualDelays.push(delay as number)
        return originalSetTimeout(callback, 0) // Execute immediately in test
      })

      await breaker.execute(operation)

      // Should have exponential backoff: 100ms, 200ms
      expect(actualDelays).toHaveLength(2)
      expect(actualDelays[0]).toBeCloseTo(100, 50) // ~100ms ± jitter
      expect(actualDelays[1]).toBeCloseTo(200, 50) // ~200ms ± jitter
    })
  })

  describe('Timeout Handling', () => {
    test('should timeout long-running operations', async () => {
      const breaker = new CircuitBreaker('test', {
        ...CIRCUIT_CONFIGS.LLM_API,
        resetTimeoutMs: 100 // Very short timeout for testing
      })

      const longOperation = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 200)) // Takes longer than timeout
      )

      await expect(breaker.execute(longOperation)).rejects.toThrow('Operation timeout')
    })
  })

  describe('Health Monitoring', () => {
    test('should provide health check information', async () => {
      const breaker = new CircuitBreaker('test', CIRCUIT_CONFIGS.LLM_API)

      const health = breaker.getHealthCheck()
      expect(health.healthy).toBe(true)
      expect(health.state).toBe(CircuitState.CLOSED)
      expect(health.errorRate).toBe(0)
      expect(health.uptime).toBe(true)
    })

    test('should report unhealthy when circuit is open', async () => {
      const breaker = new CircuitBreaker('test', {
        ...CIRCUIT_CONFIGS.LLM_API,
        failureThreshold: 1,
        minimumRequests: 1,
        errorPercentageThreshold: 50
      })

      // Force circuit to open
      await expect(breaker.execute(vi.fn().mockRejectedValue(new Error('fail')))).rejects.toThrow()

      const health = breaker.getHealthCheck()
      expect(health.healthy).toBe(false)
      expect(health.state).toBe(CircuitState.OPEN)
      expect(health.uptime).toBe(false)
    })

    test('should track error rates correctly', async () => {
      const breaker = new CircuitBreaker('test', CIRCUIT_CONFIGS.LLM_API)

      // Mix of successful and failed operations
      await breaker.execute(vi.fn().mockResolvedValue('success'))
      await expect(breaker.execute(vi.fn().mockRejectedValue(new Error('fail')))).rejects.toThrow()

      const health = breaker.getHealthCheck()
      expect(health.errorRate).toBe(50) // 1 failure out of 2 requests
    })
  })

  describe('Manual Controls', () => {
    test('should allow manual opening of circuit', async () => {
      const breaker = new CircuitBreaker('test', CIRCUIT_CONFIGS.LLM_API)

      breaker.forceOpen()
      expect(breaker.getState().state).toBe(CircuitState.OPEN)

      // Should reject requests
      await expect(breaker.execute(vi.fn())).rejects.toThrow(CircuitBreakerError)
    })

    test('should allow manual closing of circuit', async () => {
      const breaker = new CircuitBreaker('test', CIRCUIT_CONFIGS.LLM_API)

      breaker.forceOpen()
      expect(breaker.getState().state).toBe(CircuitState.OPEN)

      breaker.forceClose()
      expect(breaker.getState().state).toBe(CircuitState.CLOSED)
      expect(breaker.getState().failures).toBe(0)
      expect(breaker.getState().requests).toBe(0)
    })

    test('should allow resetting circuit state', async () => {
      const breaker = new CircuitBreaker('test', CIRCUIT_CONFIGS.LLM_API)

      // Generate some state
      await breaker.execute(vi.fn().mockResolvedValue('success'))
      await expect(breaker.execute(vi.fn().mockRejectedValue(new Error('fail')))).rejects.toThrow()

      expect(breaker.getState().requests).toBeGreaterThan(0)

      breaker.reset()
      expect(breaker.getState().state).toBe(CircuitState.CLOSED)
      expect(breaker.getState().failures).toBe(0)
      expect(breaker.getState().requests).toBe(0)
    })
  })

  describe('Global Circuit Breaker Registry', () => {
    test('should create and reuse circuit breakers by name', async () => {
      const breaker1 = getCircuitBreaker('test-service', 'LLM_API')
      const breaker2 = getCircuitBreaker('test-service', 'LLM_API')

      expect(breaker1).toBe(breaker2) // Should be the same instance
    })

    test('should create different instances for different names', async () => {
      const breaker1 = getCircuitBreaker('service-1', 'LLM_API')
      const breaker2 = getCircuitBreaker('service-2', 'LLM_API')

      expect(breaker1).not.toBe(breaker2)
    })

    test('should work with withCircuitBreaker helper', async () => {
      let callCount = 0
      const operation = vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve(`call-${callCount}`)
      })

      const result1 = await withCircuitBreaker('test-op', 'LLM_API', operation)
      const result2 = await withCircuitBreaker('test-op', 'LLM_API', operation)

      expect(result1).toBe('call-1')
      expect(result2).toBe('call-2')
      expect(operation).toHaveBeenCalledTimes(2)
    })
  })

  describe('Configuration Variants', () => {
    test('should use LLM_API configuration for LLM operations', async () => {
      const config = CIRCUIT_CONFIGS.LLM_API
      expect(config.resetTimeoutMs).toBe(30000)
      expect(config.errorPercentageThreshold).toBe(50)
      expect(config.maxRetries).toBe(3)
    })

    test('should use N8N_API configuration for n8n operations', async () => {
      const config = CIRCUIT_CONFIGS.N8N_API
      expect(config.resetTimeoutMs).toBe(15000)
      expect(config.errorPercentageThreshold).toBe(30)
      expect(config.maxRetries).toBe(2)
    })

    test('should use DATABASE configuration for database operations', async () => {
      const config = CIRCUIT_CONFIGS.DATABASE
      expect(config.errorPercentageThreshold).toBe(20)
      expect(config.resetTimeoutMs).toBe(10000)
    })
  })

  describe('Error Cleanup and Monitoring Window', () => {
    test('should clean up old errors outside monitoring window', async () => {
      const breaker = new CircuitBreaker('test', {
        ...CIRCUIT_CONFIGS.LLM_API,
        monitoringPeriodMs: 1000 // 1 second window
      })

      // Generate some failures
      await expect(breaker.execute(vi.fn().mockRejectedValue(new Error('fail')))).rejects.toThrow()
      expect(breaker.getState().failures).toBe(1)

      // Fast-forward time past monitoring window
      vi.advanceTimersByTime(1001)

      // Trigger cleanup by making another request
      await breaker.execute(vi.fn().mockResolvedValue('success'))

      // Old failures should be cleaned up
      expect(breaker.getState().failures).toBe(0)
    })
  })
})