import Redis from 'redis'

// Queue configuration
const redis = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  retry_unfulfilled_commands: true,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 500)
  }
})

// Connect to Redis if not already connected
if (!redis.isOpen) {
  redis.connect().catch(console.error)
}

// Job structure
export interface QueueJob {
  id: string
  queue: string
  payload: Record<string, any>
  createdAt: Date
  attempts: number
  maxAttempts: number
  lastError?: string
  failedAt?: Date
  redrivenAt?: Date
  redrivenBy?: string
}

// Queue status structure
export interface QueueStatus {
  name: string
  pending: number
  failed: number
  dlq: number
}

// Redrive result
export interface RedriveResult {
  success: boolean
  movedCount: number
  errors: string[]
}

// Queue operations class
export class Queue {
  private name: string

  constructor(name: string) {
    this.name = name
  }

  // Get Redis key names for this queue
  private getKeys() {
    return {
      pending: `${this.name}:pending`,
      failed: `${this.name}:failed`,
      dlq: `${this.name}:dlq`,
      jobs: `${this.name}:jobs`
    }
  }

  // Push a job to the pending queue
  async push(payload: Record<string, any>, options: { maxAttempts?: number } = {}): Promise<string> {
    const jobId = `${this.name}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`
    const job: QueueJob = {
      id: jobId,
      queue: this.name,
      payload,
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: options.maxAttempts || 3
    }

    const keys = this.getKeys()

    // Store job data and add to pending queue atomically
    const multi = redis.multi()
    multi.hSet(keys.jobs, jobId, JSON.stringify(job))
    multi.lPush(keys.pending, jobId)
    await multi.exec()

    return jobId
  }

  // Pop a job from the pending queue for processing
  async pop(): Promise<QueueJob | null> {
    const keys = this.getKeys()
    const jobId = await redis.rPop(keys.pending)

    if (!jobId) {
      return null
    }

    const jobData = await redis.hGet(keys.jobs, jobId)
    if (!jobData) {
      // Job data missing, skip
      return null
    }

    try {
      const job: QueueJob = JSON.parse(jobData)
      job.attempts++

      // Update job with attempt count
      await redis.hSet(keys.jobs, jobId, JSON.stringify(job))

      return job
    } catch (error) {
      console.error('Failed to parse job data:', error)
      return null
    }
  }

  // Mark a job as failed
  async fail(jobId: string, reason: string): Promise<void> {
    const keys = this.getKeys()
    const jobData = await redis.hGet(keys.jobs, jobId)

    if (!jobData) {
      throw new Error(`Job ${jobId} not found`)
    }

    try {
      const job: QueueJob = JSON.parse(jobData)
      job.lastError = reason
      job.failedAt = new Date()

      // Check if we should move to DLQ or retry
      if (job.attempts >= job.maxAttempts) {
        // Move to DLQ
        await this.moveToDLQ(jobId, job)
      } else {
        // Move to failed queue for potential retry
        const multi = redis.multi()
        multi.hSet(keys.jobs, jobId, JSON.stringify(job))
        multi.lPush(keys.failed, jobId)
        await multi.exec()
      }
    } catch (error) {
      console.error('Failed to process job failure:', error)
      throw error
    }
  }

  // Move a job to the Dead Letter Queue
  async moveToDLQ(jobId: string, job?: QueueJob): Promise<void> {
    const keys = this.getKeys()

    if (!job) {
      const jobData = await redis.hGet(keys.jobs, jobId)
      if (!jobData) {
        throw new Error(`Job ${jobId} not found`)
      }
      job = JSON.parse(jobData)
    }

    // Update job status and move to DLQ
    const multi = redis.multi()
    multi.hSet(keys.jobs, jobId, JSON.stringify(job))
    multi.lPush(keys.dlq, jobId)
    multi.lRem(keys.failed, 1, jobId) // Remove from failed if present
    await multi.exec()
  }

  // Redrive jobs from DLQ back to pending
  async redrive(jobIds: string[], redrivenBy: string): Promise<RedriveResult> {
    const keys = this.getKeys()
    const result: RedriveResult = {
      success: true,
      movedCount: 0,
      errors: []
    }

    // Validate job IDs exist in DLQ
    const dlqJobs = await redis.lRange(keys.dlq, 0, -1)
    const validJobIds = jobIds.filter(id => dlqJobs.includes(id))
    const invalidJobIds = jobIds.filter(id => !dlqJobs.includes(id))

    // Add errors for invalid job IDs
    invalidJobIds.forEach(id => {
      result.errors.push(`Job ${id} not found in DLQ`)
    })

    // Process valid job IDs
    for (const jobId of validJobIds) {
      try {
        const jobData = await redis.hGet(keys.jobs, jobId)
        if (!jobData) {
          result.errors.push(`Job data for ${jobId} not found`)
          continue
        }

        const job: QueueJob = JSON.parse(jobData)
        job.attempts = 0 // Reset attempts for redrive
        job.lastError = undefined
        job.redrivenAt = new Date()
        job.redrivenBy = redrivenBy

        // Move from DLQ to pending atomically
        const multi = redis.multi()
        multi.hSet(keys.jobs, jobId, JSON.stringify(job))
        multi.lRem(keys.dlq, 1, jobId)
        multi.lPush(keys.pending, jobId)
        await multi.exec()

        result.movedCount++
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        result.errors.push(`Failed to redrive ${jobId}: ${errorMsg}`)
      }
    }

    if (result.errors.length > 0) {
      result.success = false
    }

    return result
  }

  // Get queue status
  async getStatus(): Promise<QueueStatus> {
    const keys = this.getKeys()

    const [pending, failed, dlq] = await Promise.all([
      redis.lLen(keys.pending),
      redis.lLen(keys.failed),
      redis.lLen(keys.dlq)
    ])

    return {
      name: this.name,
      pending,
      failed,
      dlq
    }
  }

  // Get jobs in DLQ with details (for UI)
  async getDLQJobs(limit = 100): Promise<QueueJob[]> {
    const keys = this.getKeys()
    const jobIds = await redis.lRange(keys.dlq, 0, limit - 1)

    if (jobIds.length === 0) {
      return []
    }

    const jobs: QueueJob[] = []
    for (const jobId of jobIds) {
      try {
        const jobData = await redis.hGet(keys.jobs, jobId)
        if (jobData) {
          const job = JSON.parse(jobData)
          // Sanitize payload for UI (remove sensitive data)
          jobs.push({
            ...job,
            payload: this.sanitizePayload(job.payload)
          })
        }
      } catch (error) {
        console.error(`Failed to parse job ${jobId}:`, error)
      }
    }

    return jobs
  }

  // Get failed jobs with details (for UI)
  async getFailedJobs(limit = 100): Promise<QueueJob[]> {
    const keys = this.getKeys()
    const jobIds = await redis.lRange(keys.failed, 0, limit - 1)

    if (jobIds.length === 0) {
      return []
    }

    const jobs: QueueJob[] = []
    for (const jobId of jobIds) {
      try {
        const jobData = await redis.hGet(keys.jobs, jobId)
        if (jobData) {
          const job = JSON.parse(jobData)
          jobs.push({
            ...job,
            payload: this.sanitizePayload(job.payload)
          })
        }
      } catch (error) {
        console.error(`Failed to parse job ${jobId}:`, error)
      }
    }

    return jobs
  }

  // Sanitize payload for UI display (remove sensitive fields)
  private sanitizePayload(payload: Record<string, any>): Record<string, any> {
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'apiKey', 'credentials']
    const sanitized = { ...payload }

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]'
      }
    }

    // Also check nested objects
    for (const key in sanitized) {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizePayload(sanitized[key])
      }
    }

    return sanitized
  }

  // Clean up old job data (maintenance operation)
  async cleanup(olderThanDays = 30): Promise<number> {
    const keys = this.getKeys()
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    const allJobIds = await redis.hKeys(keys.jobs)
    let cleanedCount = 0

    for (const jobId of allJobIds) {
      try {
        const jobData = await redis.hGet(keys.jobs, jobId)
        if (!jobData) continue

        const job: QueueJob = JSON.parse(jobData)

        // Only clean up jobs that are old and not in any queue
        if (job.createdAt < cutoffDate) {
          const inPending = await redis.lPos(keys.pending, jobId)
          const inFailed = await redis.lPos(keys.failed, jobId)
          const inDLQ = await redis.lPos(keys.dlq, jobId)

          if (inPending === null && inFailed === null && inDLQ === null) {
            await redis.hDel(keys.jobs, jobId)
            cleanedCount++
          }
        }
      } catch (error) {
        console.error(`Failed to process job ${jobId} for cleanup:`, error)
      }
    }

    return cleanedCount
  }
}

// Factory function to create queue instances
export function createQueue(name: string): Queue {
  return new Queue(name)
}

// Get status for all known queues
export async function getAllQueuesStatus(): Promise<QueueStatus[]> {
  const keys = await redis.keys('*:pending')
  const queueNames = keys.map(key => key.replace(':pending', ''))

  const statuses = await Promise.all(
    queueNames.map(async (name) => {
      const queue = createQueue(name)
      return queue.getStatus()
    })
  )

  return statuses.sort((a, b) => a.name.localeCompare(b.name))
}

// Utility functions for common queue operations
export const QueueManager = {
  // Create a new queue
  create: createQueue,

  // Get all queues status
  getAllStatus: getAllQueuesStatus,

  // Redrive jobs across multiple queues
  async redriveMultiple(operations: Array<{ queue: string; jobIds: string[] }>, redrivenBy: string): Promise<Record<string, RedriveResult>> {
    const results: Record<string, RedriveResult> = {}

    for (const op of operations) {
      try {
        const queue = createQueue(op.queue)
        results[op.queue] = await queue.redrive(op.jobIds, redrivenBy)
      } catch (error) {
        results[op.queue] = {
          success: false,
          movedCount: 0,
          errors: [error instanceof Error ? error.message : 'Unknown error']
        }
      }
    }

    return results
  },

  // Health check for Redis connection
  async healthCheck(): Promise<{ connected: boolean; error?: string }> {
    try {
      await redis.ping()
      return { connected: true }
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}

// Export types
export type { QueueJob, QueueStatus, RedriveResult }