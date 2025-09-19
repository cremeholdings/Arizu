import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Redis from 'redis'
import { Queue, createQueue, QueueManager } from '@/lib/queue'

const testRedis = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379/15', // Use DB 15 for tests
})

describe('Dead Letter Queue', () => {
  beforeEach(async () => {
    await testRedis.connect()
    await testRedis.flushDb() // Clean test database before each test
  })

  afterEach(async () => {
    await testRedis.flushDb() // Clean up after each test
    await testRedis.quit()
  })

  describe('Queue Basic Operations', () => {
    it('should create and push jobs to queue', async () => {
      const queue = createQueue('test-queue')

      const jobId = await queue.push({ message: 'Hello World' })
      expect(jobId).toMatch(/^test-queue:\d+:[a-z0-9]+$/)

      const status = await queue.getStatus()
      expect(status).toEqual({
        name: 'test-queue',
        pending: 1,
        failed: 0,
        dlq: 0
      })
    })

    it('should pop jobs from queue', async () => {
      const queue = createQueue('test-queue')

      await queue.push({ message: 'Test job', data: 123 })

      const job = await queue.pop()
      expect(job).toBeDefined()
      expect(job?.payload).toEqual({ message: 'Test job', data: 123 })
      expect(job?.attempts).toBe(1)

      const status = await queue.getStatus()
      expect(status.pending).toBe(0)
    })

    it('should return null when popping from empty queue', async () => {
      const queue = createQueue('empty-queue')

      const job = await queue.pop()
      expect(job).toBeNull()
    })
  })

  describe('Failure Handling', () => {
    it('should move job to failed queue on first failure', async () => {
      const queue = createQueue('test-queue')

      const jobId = await queue.push({ message: 'Will fail' }, { maxAttempts: 3 })
      const job = await queue.pop()

      await queue.fail(job!.id, 'Processing error')

      const status = await queue.getStatus()
      expect(status).toEqual({
        name: 'test-queue',
        pending: 0,
        failed: 1,
        dlq: 0
      })
    })

    it('should move job to DLQ after max attempts', async () => {
      const queue = createQueue('test-queue')

      const jobId = await queue.push({ message: 'Will exhaust retries' }, { maxAttempts: 2 })

      // First attempt
      let job = await queue.pop()
      await queue.fail(job!.id, 'First failure')

      // Second attempt
      job = await queue.pop() // This should return null since job is in failed queue
      expect(job).toBeNull()

      // Manually retry from failed queue (simulate retry mechanism)
      const failedJobs = await queue.getFailedJobs()
      expect(failedJobs).toHaveLength(1)

      // Simulate second attempt by getting job data and incrementing attempts
      const jobData = failedJobs[0]
      jobData.attempts = 2

      await queue.fail(jobData.id, 'Second failure')

      const status = await queue.getStatus()
      expect(status).toEqual({
        name: 'test-queue',
        pending: 0,
        failed: 0,
        dlq: 1
      })
    })

    it('should handle missing job gracefully', async () => {
      const queue = createQueue('test-queue')

      await expect(queue.fail('non-existent-job', 'Error')).rejects.toThrow('Job non-existent-job not found')
    })
  })

  describe('Dead Letter Queue Operations', () => {
    it('should retrieve jobs from DLQ', async () => {
      const queue = createQueue('test-queue')

      // Create a job that will go to DLQ
      const jobId = await queue.push({
        message: 'DLQ job',
        secret: 'sensitive-data'
      }, { maxAttempts: 1 })

      const job = await queue.pop()
      await queue.fail(job!.id, 'Fatal error')

      const dlqJobs = await queue.getDLQJobs()
      expect(dlqJobs).toHaveLength(1)
      expect(dlqJobs[0].payload.message).toBe('DLQ job')
      expect(dlqJobs[0].payload.secret).toBe('[REDACTED]') // Should be sanitized
      expect(dlqJobs[0].lastError).toBe('Fatal error')
    })

    it('should redrive jobs from DLQ back to pending', async () => {
      const queue = createQueue('test-queue')

      // Create and fail a job
      await queue.push({ message: 'Redrive test' }, { maxAttempts: 1 })
      const job = await queue.pop()
      await queue.fail(job!.id, 'Temporary failure')

      // Verify job is in DLQ
      let status = await queue.getStatus()
      expect(status.dlq).toBe(1)

      // Redrive the job
      const result = await queue.redrive([job!.id], 'test-operator')

      expect(result.success).toBe(true)
      expect(result.movedCount).toBe(1)
      expect(result.errors).toHaveLength(0)

      // Verify job is back in pending
      status = await queue.getStatus()
      expect(status).toEqual({
        name: 'test-queue',
        pending: 1,
        failed: 0,
        dlq: 0
      })

      // Verify attempts were reset
      const redrivenJob = await queue.pop()
      expect(redrivenJob?.attempts).toBe(1)
      expect(redrivenJob?.lastError).toBeUndefined()
      expect(redrivenJob?.redrivenBy).toBe('test-operator')
      expect(redrivenJob?.redrivenAt).toBeDefined()
    })

    it('should handle invalid job IDs in redrive', async () => {
      const queue = createQueue('test-queue')

      const result = await queue.redrive(['invalid-job-1', 'invalid-job-2'], 'test-operator')

      expect(result.success).toBe(false)
      expect(result.movedCount).toBe(0)
      expect(result.errors).toHaveLength(2)
      expect(result.errors[0]).toContain('not found in DLQ')
    })

    it('should handle partial redrive success', async () => {
      const queue = createQueue('test-queue')

      // Create one valid DLQ job
      await queue.push({ message: 'Valid job' }, { maxAttempts: 1 })
      const job = await queue.pop()
      await queue.fail(job!.id, 'Error')

      // Try to redrive valid and invalid jobs
      const result = await queue.redrive([job!.id, 'invalid-job'], 'test-operator')

      expect(result.success).toBe(false) // False because of the invalid job
      expect(result.movedCount).toBe(1) // But one job was moved
      expect(result.errors).toHaveLength(1)
    })
  })

  describe('Queue Manager', () => {
    it('should get status for all queues', async () => {
      const queue1 = createQueue('queue-1')
      const queue2 = createQueue('queue-2')

      await queue1.push({ data: 'test1' })
      await queue2.push({ data: 'test2' })

      const statuses = await QueueManager.getAllStatus()

      expect(statuses).toHaveLength(2)
      expect(statuses.find(s => s.name === 'queue-1')?.pending).toBe(1)
      expect(statuses.find(s => s.name === 'queue-2')?.pending).toBe(1)
    })

    it('should redrive multiple queues', async () => {
      const queue1 = createQueue('queue-1')
      const queue2 = createQueue('queue-2')

      // Create DLQ jobs in both queues
      await queue1.push({ message: 'Job 1' }, { maxAttempts: 1 })
      await queue2.push({ message: 'Job 2' }, { maxAttempts: 1 })

      const job1 = await queue1.pop()
      const job2 = await queue2.pop()

      await queue1.fail(job1!.id, 'Error 1')
      await queue2.fail(job2!.id, 'Error 2')

      // Redrive both queues
      const results = await QueueManager.redriveMultiple([
        { queue: 'queue-1', jobIds: [job1!.id] },
        { queue: 'queue-2', jobIds: [job2!.id] }
      ], 'test-operator')

      expect(results['queue-1'].success).toBe(true)
      expect(results['queue-1'].movedCount).toBe(1)
      expect(results['queue-2'].success).toBe(true)
      expect(results['queue-2'].movedCount).toBe(1)
    })

    it('should check Redis health', async () => {
      const health = await QueueManager.healthCheck()
      expect(health.connected).toBe(true)
    })
  })

  describe('Data Sanitization', () => {
    it('should redact sensitive fields in payload', async () => {
      const queue = createQueue('test-queue')

      const sensitivePayload = {
        message: 'Public data',
        password: 'secret123',
        apiKey: 'abc-def-ghi',
        token: 'jwt-token',
        credentials: { user: 'admin', pass: 'secret' },
        nested: {
          secret: 'hidden',
          public: 'visible'
        }
      }

      await queue.push(sensitivePayload, { maxAttempts: 1 })
      const job = await queue.pop()
      await queue.fail(job!.id, 'Error')

      const dlqJobs = await queue.getDLQJobs()
      const sanitized = dlqJobs[0].payload

      expect(sanitized.message).toBe('Public data')
      expect(sanitized.password).toBe('[REDACTED]')
      expect(sanitized.apiKey).toBe('[REDACTED]')
      expect(sanitized.token).toBe('[REDACTED]')
      expect(sanitized.credentials).toBe('[REDACTED]')
      expect(sanitized.nested.public).toBe('visible')
      expect(sanitized.nested.secret).toBe('[REDACTED]')
    })
  })

  describe('Cleanup Operations', () => {
    it('should clean up old completed jobs', async () => {
      const queue = createQueue('test-queue')

      // This test would require mocking dates or using a test that can manipulate time
      // For now, we'll test that the cleanup function exists and doesn't crash
      const cleanedCount = await queue.cleanup(30)
      expect(typeof cleanedCount).toBe('number')
    })
  })
})