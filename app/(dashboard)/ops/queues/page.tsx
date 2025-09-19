'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'
import { AlertTriangle, RefreshCw, Play, Clock, XCircle } from 'lucide-react'

interface QueueJob {
  id: string
  queue: string
  payload: Record<string, any>
  createdAt: string
  attempts: number
  maxAttempts: number
  lastError?: string
  failedAt?: string
  redrivenAt?: string
  redrivenBy?: string
}

interface QueueStatus {
  name: string
  pending: number
  failed: number
  dlq: number
}

export default function QueuesPage() {
  const [queues, setQueues] = useState<QueueStatus[]>([])
  const [dlqJobs, setDLQJobs] = useState<Record<string, QueueJob[]>>({})
  const [selectedJobs, setSelectedJobs] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  const [redriving, setRedriving] = useState(false)
  const [expandedQueues, setExpandedQueues] = useState<Set<string>>(new Set())
  const { toast } = useToast()

  const fetchQueueStatus = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/queues/status')
      if (!response.ok) throw new Error('Failed to fetch queue status')

      const data = await response.json()
      setQueues(data.queues || [])
    } catch (error) {
      console.error('Failed to fetch queue status:', error)
      toast({
        title: 'Error',
        description: 'Failed to fetch queue status',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchDLQJobs = async (queueName: string) => {
    try {
      const response = await fetch(`/api/queues/${queueName}/dlq`)
      if (!response.ok) throw new Error('Failed to fetch DLQ jobs')

      const jobs = await response.json()
      setDLQJobs(prev => ({ ...prev, [queueName]: jobs }))
    } catch (error) {
      console.error(`Failed to fetch DLQ jobs for ${queueName}:`, error)
      toast({
        title: 'Error',
        description: `Failed to fetch DLQ jobs for ${queueName}`,
        variant: 'destructive'
      })
    }
  }

  const toggleQueueExpansion = async (queueName: string) => {
    const newExpanded = new Set(expandedQueues)

    if (expandedQueues.has(queueName)) {
      newExpanded.delete(queueName)
    } else {
      newExpanded.add(queueName)
      if (!dlqJobs[queueName]) {
        await fetchDLQJobs(queueName)
      }
    }

    setExpandedQueues(newExpanded)
  }

  const toggleJobSelection = (queueName: string, jobId: string) => {
    setSelectedJobs(prev => {
      const queueJobs = prev[queueName] || []
      const newQueueJobs = queueJobs.includes(jobId)
        ? queueJobs.filter(id => id !== jobId)
        : [...queueJobs, jobId]

      return {
        ...prev,
        [queueName]: newQueueJobs
      }
    })
  }

  const toggleAllJobs = (queueName: string) => {
    const jobs = dlqJobs[queueName] || []
    const currentSelected = selectedJobs[queueName] || []
    const allSelected = currentSelected.length === jobs.length

    setSelectedJobs(prev => ({
      ...prev,
      [queueName]: allSelected ? [] : jobs.map(job => job.id)
    }))
  }

  const redriveSelectedJobs = async () => {
    const operations = Object.entries(selectedJobs)
      .filter(([_, jobIds]) => jobIds.length > 0)
      .map(([queue, jobIds]) => ({ queue, jobIds }))

    if (operations.length === 0) {
      toast({
        title: 'No jobs selected',
        description: 'Please select jobs to redrive',
        variant: 'destructive'
      })
      return
    }

    try {
      setRedriving(true)

      const response = await fetch('/api/queues/redrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operations,
          redrivenBy: 'ops-ui'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to redrive jobs')
      }

      const result = await response.json()

      toast({
        title: 'Redrive completed',
        description: `Successfully moved ${result.summary.totalMoved} jobs back to pending`,
        variant: 'default'
      })

      // Clear selections and refresh data
      setSelectedJobs({})
      fetchQueueStatus()

      // Refresh DLQ jobs for expanded queues
      for (const queueName of expandedQueues) {
        await fetchDLQJobs(queueName)
      }

    } catch (error) {
      console.error('Failed to redrive jobs:', error)
      toast({
        title: 'Redrive failed',
        description: error instanceof Error ? error.message : 'Failed to redrive jobs',
        variant: 'destructive'
      })
    } finally {
      setRedriving(false)
    }
  }

  useEffect(() => {
    fetchQueueStatus()
    const interval = setInterval(fetchQueueStatus, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [])

  const totalSelected = Object.values(selectedJobs).reduce((sum, jobs) => sum + jobs.length, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Queue Management</h1>
          <p className="text-muted-foreground">Monitor and manage job queues and dead letter queues</p>
        </div>

        <div className="flex items-center gap-2">
          {totalSelected > 0 && (
            <Button
              onClick={redriveSelectedJobs}
              disabled={redriving}
              variant="default"
            >
              {redriving ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Redriving...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Redrive {totalSelected} Jobs
                </>
              )}
            </Button>
          )}

          <Button
            onClick={fetchQueueStatus}
            disabled={loading}
            variant="outline"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {queues.map((queue) => (
          <Card key={queue.name}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {queue.name}
                    {queue.dlq > 0 && (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {queue.dlq} in DLQ
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {queue.pending} pending · {queue.failed} failed · {queue.dlq} in dead letter queue
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {queue.pending}
                  </Badge>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    {queue.failed}
                  </Badge>
                  {queue.dlq > 0 && (
                    <Button
                      onClick={() => toggleQueueExpansion(queue.name)}
                      variant="outline"
                      size="sm"
                    >
                      {expandedQueues.has(queue.name) ? 'Hide DLQ' : 'Show DLQ'}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            {expandedQueues.has(queue.name) && queue.dlq > 0 && (
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Dead Letter Queue Jobs</h4>
                    {dlqJobs[queue.name]?.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={
                            (selectedJobs[queue.name]?.length || 0) === dlqJobs[queue.name]?.length
                          }
                          onCheckedChange={() => toggleAllJobs(queue.name)}
                        />
                        <span className="text-sm text-muted-foreground">Select all</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {dlqJobs[queue.name]?.map((job) => (
                      <div
                        key={job.id}
                        className="flex items-start gap-3 p-3 border rounded-lg bg-muted/30"
                      >
                        <Checkbox
                          checked={(selectedJobs[queue.name] || []).includes(job.id)}
                          onCheckedChange={() => toggleJobSelection(queue.name, job.id)}
                        />

                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {job.id}
                            </code>
                            <Badge variant="outline" size="sm">
                              {job.attempts}/{job.maxAttempts} attempts
                            </Badge>
                          </div>

                          {job.lastError && (
                            <p className="text-sm text-destructive">
                              {job.lastError}
                            </p>
                          )}

                          <div className="text-xs text-muted-foreground">
                            Failed: {new Date(job.failedAt!).toLocaleString()}
                            {job.redrivenAt && (
                              <span> · Last redrive: {new Date(job.redrivenAt).toLocaleString()}</span>
                            )}
                          </div>

                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground">
                              Show payload
                            </summary>
                            <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                              {JSON.stringify(job.payload, null, 2)}
                            </pre>
                          </details>
                        </div>
                      </div>
                    )) || (
                      <p className="text-center text-muted-foreground py-4">
                        Loading DLQ jobs...
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        ))}

        {queues.length === 0 && !loading && (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">No queues found</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}