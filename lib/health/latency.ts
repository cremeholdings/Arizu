interface LatencyMeasurement {
  timestamp: number
  value: number
}

class RollingWindow {
  private measurements: LatencyMeasurement[] = []
  private readonly windowSizeMs: number
  private readonly maxMeasurements: number

  constructor(windowSizeMs: number = 60000, maxMeasurements: number = 1000) {
    this.windowSizeMs = windowSizeMs
    this.maxMeasurements = maxMeasurements
  }

  addMeasurement(latencyMs: number): void {
    const now = Date.now()

    this.measurements.push({
      timestamp: now,
      value: latencyMs,
    })

    // Remove old measurements outside the window
    this.cleanup(now)

    // Prevent memory leaks by limiting total measurements
    if (this.measurements.length > this.maxMeasurements) {
      this.measurements = this.measurements.slice(-this.maxMeasurements)
    }
  }

  private cleanup(currentTime: number): void {
    const cutoff = currentTime - this.windowSizeMs
    this.measurements = this.measurements.filter(
      (measurement) => measurement.timestamp > cutoff
    )
  }

  getP95(): number {
    const now = Date.now()
    this.cleanup(now)

    if (this.measurements.length === 0) {
      return 0
    }

    // Sort measurements by latency value
    const sortedValues = this.measurements
      .map((m) => m.value)
      .sort((a, b) => a - b)

    // Calculate 95th percentile index
    const p95Index = Math.ceil(sortedValues.length * 0.95) - 1
    const safeIndex = Math.max(0, Math.min(p95Index, sortedValues.length - 1))

    return sortedValues[safeIndex] || 0
  }

  getCount(): number {
    const now = Date.now()
    this.cleanup(now)
    return this.measurements.length
  }

  getAverage(): number {
    const now = Date.now()
    this.cleanup(now)

    if (this.measurements.length === 0) {
      return 0
    }

    const sum = this.measurements.reduce((acc, m) => acc + m.value, 0)
    return sum / this.measurements.length
  }

  getMin(): number {
    const now = Date.now()
    this.cleanup(now)

    if (this.measurements.length === 0) {
      return 0
    }

    return Math.min(...this.measurements.map((m) => m.value))
  }

  getMax(): number {
    const now = Date.now()
    this.cleanup(now)

    if (this.measurements.length === 0) {
      return 0
    }

    return Math.max(...this.measurements.map((m) => m.value))
  }

  reset(): void {
    this.measurements = []
  }

  getStats() {
    return {
      count: this.getCount(),
      average: Math.round(this.getAverage()),
      min: this.getMin(),
      max: this.getMax(),
      p95: Math.round(this.getP95()),
    }
  }
}

// Global instances for tracking latency
const appLatencyWindow = new RollingWindow(300000, 2000) // 5-minute window, max 2000 measurements
const apiLatencyWindow = new RollingWindow(300000, 2000) // 5-minute window, max 2000 measurements

export function recordAppLatency(latencyMs: number): void {
  if (typeof latencyMs !== "number" || latencyMs < 0 || !isFinite(latencyMs)) {
    console.warn("Invalid app latency measurement", { latencyMs })
    return
  }

  appLatencyWindow.addMeasurement(latencyMs)
}

export function recordApiLatency(latencyMs: number): void {
  if (typeof latencyMs !== "number" || latencyMs < 0 || !isFinite(latencyMs)) {
    console.warn("Invalid API latency measurement", { latencyMs })
    return
  }

  apiLatencyWindow.addMeasurement(latencyMs)
}

export function getAppP95(): number {
  return Math.round(appLatencyWindow.getP95())
}

export function getApiP95(): number {
  return Math.round(apiLatencyWindow.getP95())
}

export function getAppLatencyStats() {
  return appLatencyWindow.getStats()
}

export function getApiLatencyStats() {
  return apiLatencyWindow.getStats()
}

export function resetLatencyMetrics(): void {
  appLatencyWindow.reset()
  apiLatencyWindow.reset()
}

// Middleware helper for automatic latency tracking
export function createLatencyTracker(type: "app" | "api") {
  return {
    start: () => {
      return Date.now()
    },
    end: (startTime: number) => {
      const latency = Date.now() - startTime
      if (type === "app") {
        recordAppLatency(latency)
      } else {
        recordApiLatency(latency)
      }
      return latency
    },
  }
}

// Utility for measuring async operations
export async function measureLatency<T>(
  operation: () => Promise<T>,
  type: "app" | "api"
): Promise<{ result: T; latency: number }> {
  const startTime = Date.now()

  try {
    const result = await operation()
    const latency = Date.now() - startTime

    if (type === "app") {
      recordAppLatency(latency)
    } else {
      recordApiLatency(latency)
    }

    return { result, latency }
  } catch (error) {
    const latency = Date.now() - startTime

    // Still record latency for failed operations
    if (type === "app") {
      recordAppLatency(latency)
    } else {
      recordApiLatency(latency)
    }

    throw error
  }
}

// Export class for testing or advanced usage
export { RollingWindow }