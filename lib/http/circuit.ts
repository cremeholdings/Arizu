export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open'
}

export interface CircuitBreakerConfig {
  failureThreshold: number
  resetTimeoutMs: number
  monitoringPeriodMs: number
  minimumRequests: number
  errorPercentageThreshold: number
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  jitterMs: number
}

export interface CircuitBreakerState {
  state: CircuitState
  failures: number
  requests: number
  lastFailureTime: number
  nextAttemptTime: number
  recentErrors: Array<{ timestamp: number; error: string }>
}

export interface CircuitBreakerResult<T> {
  success: boolean
  value?: T
  error?: Error
  state: CircuitState
  attempts: number
  totalTime: number
}

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public state: CircuitState,
    public lastError?: Error
  ) {
    super(message)
    this.name = 'CircuitBreakerError'
  }
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failures = 0
  private requests = 0
  private lastFailureTime = 0
  private nextAttemptTime = 0
  private recentErrors: Array<{ timestamp: number; error: string }> = []

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const startTime = Date.now()
    let attempts = 0

    while (attempts < this.config.maxRetries) {
      attempts++

      try {
        await this.checkState()
        const result = await this.executeWithTimeout(operation)
        this.onSuccess()

        console.log('Circuit breaker success:', {
          name: this.name,
          state: this.state,
          attempts,
          totalTime: Date.now() - startTime
        })

        return result

      } catch (error) {
        this.onFailure(error)

        // If circuit is open or this is the last attempt, throw immediately
        if (this.state === CircuitState.OPEN || attempts >= this.config.maxRetries) {
          console.error('Circuit breaker failure:', {
            name: this.name,
            state: this.state,
            attempts,
            totalTime: Date.now() - startTime,
            error: error instanceof Error ? error.message : 'Unknown error'
          })

          throw error
        }

        // Wait before retry with exponential backoff and jitter
        const delay = this.calculateRetryDelay(attempts)
        await this.sleep(delay)

        console.warn('Circuit breaker retry:', {
          name: this.name,
          attempt: attempts,
          delay,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    throw new CircuitBreakerError(
      `Circuit breaker ${this.name} failed after ${attempts} attempts`,
      this.state
    )
  }

  private async checkState(): Promise<void> {
    const now = Date.now()

    switch (this.state) {
      case CircuitState.CLOSED:
        // Check if we should transition to open
        this.cleanupOldErrors(now)

        if (this.requests >= this.config.minimumRequests) {
          const errorRate = this.failures / this.requests
          if (errorRate >= this.config.errorPercentageThreshold / 100) {
            this.transitionToOpen(now)
            throw new CircuitBreakerError(
              `Circuit breaker ${this.name} opened due to high error rate: ${(errorRate * 100).toFixed(1)}%`,
              CircuitState.OPEN
            )
          }
        }
        break

      case CircuitState.OPEN:
        // Check if we should transition to half-open
        if (now >= this.nextAttemptTime) {
          this.transitionToHalfOpen()
        } else {
          const waitTime = this.nextAttemptTime - now
          throw new CircuitBreakerError(
            `Circuit breaker ${this.name} is open. Next attempt in ${waitTime}ms`,
            CircuitState.OPEN
          )
        }
        break

      case CircuitState.HALF_OPEN:
        // In half-open state, allow one request through
        break
    }
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timeout after ${this.config.resetTimeoutMs}ms`))
      }, this.config.resetTimeoutMs)
    })

    return Promise.race([operation(), timeout])
  }

  private onSuccess(): void {
    this.requests++

    if (this.state === CircuitState.HALF_OPEN) {
      // Successful request in half-open state transitions to closed
      this.transitionToClosed()
    }

    // Clean up old errors periodically
    this.cleanupOldErrors(Date.now())

    console.log('Circuit breaker request success:', {
      name: this.name,
      state: this.state,
      requests: this.requests,
      failures: this.failures
    })
  }

  private onFailure(error: unknown): void {
    const now = Date.now()
    this.requests++
    this.failures++
    this.lastFailureTime = now

    // Store error details for monitoring
    this.recentErrors.push({
      timestamp: now,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    // Keep only recent errors
    this.recentErrors = this.recentErrors.slice(-10)

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed request in half-open state transitions back to open
      this.transitionToOpen(now)
    }

    console.warn('Circuit breaker request failure:', {
      name: this.name,
      state: this.state,
      requests: this.requests,
      failures: this.failures,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }

  private transitionToOpen(now: number): void {
    this.state = CircuitState.OPEN
    this.nextAttemptTime = now + this.config.resetTimeoutMs

    console.warn('Circuit breaker opened:', {
      name: this.name,
      failures: this.failures,
      requests: this.requests,
      errorRate: ((this.failures / this.requests) * 100).toFixed(1) + '%',
      nextAttemptTime: new Date(this.nextAttemptTime).toISOString()
    })
  }

  private transitionToHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN

    console.log('Circuit breaker transitioning to half-open:', {
      name: this.name,
      failures: this.failures,
      requests: this.requests
    })
  }

  private transitionToClosed(): void {
    this.state = CircuitState.CLOSED
    this.failures = 0
    this.requests = 0
    this.recentErrors = []

    console.log('Circuit breaker closed:', {
      name: this.name,
      resetSuccessful: true
    })
  }

  private cleanupOldErrors(now: number): void {
    const cutoff = now - this.config.monitoringPeriodMs

    // Remove old errors that are outside the monitoring window
    this.recentErrors = this.recentErrors.filter(
      error => error.timestamp > cutoff
    )

    // Recalculate failure count based on recent errors
    const oldFailures = this.failures
    this.failures = this.recentErrors.length

    // Reset requests count if no recent activity
    if (this.recentErrors.length === 0) {
      this.requests = 0
    }

    if (oldFailures !== this.failures) {
      console.log('Circuit breaker cleaned up old errors:', {
        name: this.name,
        oldFailures,
        newFailures: this.failures,
        requests: this.requests
      })
    }
  }

  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff: baseDelay * 2^(attempt-1)
    const exponentialDelay = this.config.baseDelayMs * Math.pow(2, attempt - 1)

    // Cap at maximum delay
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs)

    // Add jitter to avoid thundering herd
    const jitter = Math.random() * this.config.jitterMs

    return cappedDelay + jitter
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // Public methods for monitoring
  getState(): CircuitBreakerState {
    return {
      state: this.state,
      failures: this.failures,
      requests: this.requests,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      recentErrors: [...this.recentErrors]
    }
  }

  getHealthCheck(): {
    healthy: boolean
    state: CircuitState
    errorRate: number
    uptime: boolean
  } {
    const errorRate = this.requests > 0 ? (this.failures / this.requests) * 100 : 0
    const healthy = this.state === CircuitState.CLOSED && errorRate < this.config.errorPercentageThreshold
    const uptime = this.state !== CircuitState.OPEN

    return {
      healthy,
      state: this.state,
      errorRate,
      uptime
    }
  }

  // Manual controls for testing/emergency
  forceOpen(): void {
    this.state = CircuitState.OPEN
    this.nextAttemptTime = Date.now() + this.config.resetTimeoutMs

    console.warn('Circuit breaker manually forced open:', {
      name: this.name
    })
  }

  forceClose(): void {
    this.transitionToClosed()

    console.log('Circuit breaker manually forced closed:', {
      name: this.name
    })
  }

  reset(): void {
    this.transitionToClosed()

    console.log('Circuit breaker reset:', {
      name: this.name
    })
  }
}

// Predefined circuit breaker configurations
export const CIRCUIT_CONFIGS = {
  // LLM API calls - can be slow and unreliable
  LLM_API: {
    failureThreshold: 5,
    resetTimeoutMs: 30000,        // 30 seconds
    monitoringPeriodMs: 60000,    // 1 minute window
    minimumRequests: 3,
    errorPercentageThreshold: 50, // 50% error rate
    maxRetries: 3,
    baseDelayMs: 1000,           // 1 second base delay
    maxDelayMs: 10000,           // 10 seconds max delay
    jitterMs: 500                // 500ms jitter
  },

  // n8n API calls - external service dependency
  N8N_API: {
    failureThreshold: 3,
    resetTimeoutMs: 15000,        // 15 seconds
    monitoringPeriodMs: 60000,    // 1 minute window
    minimumRequests: 2,
    errorPercentageThreshold: 30, // 30% error rate
    maxRetries: 2,
    baseDelayMs: 500,            // 500ms base delay
    maxDelayMs: 5000,            // 5 seconds max delay
    jitterMs: 250                // 250ms jitter
  },

  // Database operations - should be more reliable
  DATABASE: {
    failureThreshold: 10,
    resetTimeoutMs: 10000,        // 10 seconds
    monitoringPeriodMs: 30000,    // 30 second window
    minimumRequests: 5,
    errorPercentageThreshold: 20, // 20% error rate
    maxRetries: 3,
    baseDelayMs: 100,            // 100ms base delay
    maxDelayMs: 2000,            // 2 seconds max delay
    jitterMs: 100                // 100ms jitter
  },

  // External HTTP APIs - variable reliability
  EXTERNAL_API: {
    failureThreshold: 5,
    resetTimeoutMs: 20000,        // 20 seconds
    monitoringPeriodMs: 60000,    // 1 minute window
    minimumRequests: 3,
    errorPercentageThreshold: 40, // 40% error rate
    maxRetries: 2,
    baseDelayMs: 1000,           // 1 second base delay
    maxDelayMs: 8000,            // 8 seconds max delay
    jitterMs: 500                // 500ms jitter
  }
} as const

// Global circuit breaker registry
const circuitBreakers = new Map<string, CircuitBreaker>()

export function getCircuitBreaker(
  name: string,
  configKey: keyof typeof CIRCUIT_CONFIGS
): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    const config = CIRCUIT_CONFIGS[configKey]
    circuitBreakers.set(name, new CircuitBreaker(name, config))
  }

  return circuitBreakers.get(name)!
}

export function getAllCircuitBreakers(): Map<string, CircuitBreaker> {
  return new Map(circuitBreakers)
}

// Helper for wrapping operations with circuit breaker
export async function withCircuitBreaker<T>(
  name: string,
  configKey: keyof typeof CIRCUIT_CONFIGS,
  operation: () => Promise<T>
): Promise<T> {
  const breaker = getCircuitBreaker(name, configKey)
  return await breaker.execute(operation)
}

// Cleanup function for testing
export function resetAllCircuitBreakers(): void {
  circuitBreakers.clear()
}