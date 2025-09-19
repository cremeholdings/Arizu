import { NextRequest, NextResponse } from 'next/server'
import { QueueManager } from '@/lib/queue'
import { auth } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.role || session.user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Owner role required for redrive operations' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { operations, redrivenBy } = body

    if (!operations || !Array.isArray(operations)) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'operations array is required' },
        { status: 400 }
      )
    }

    if (!redrivenBy || typeof redrivenBy !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request', message: 'redrivenBy string is required' },
        { status: 400 }
      )
    }

    // Validate operations format
    for (const op of operations) {
      if (!op.queue || typeof op.queue !== 'string') {
        return NextResponse.json(
          { error: 'Invalid request', message: 'Each operation must have a queue string' },
          { status: 400 }
        )
      }

      if (!op.jobIds || !Array.isArray(op.jobIds)) {
        return NextResponse.json(
          { error: 'Invalid request', message: 'Each operation must have a jobIds array' },
          { status: 400 }
        )
      }

      if (op.jobIds.length === 0) {
        return NextResponse.json(
          { error: 'Invalid request', message: 'Each operation must have at least one job ID' },
          { status: 400 }
        )
      }
    }

    const results = await QueueManager.redriveMultiple(operations, redrivenBy)

    // Calculate overall statistics
    let totalMoved = 0
    let totalErrors = 0
    let overallSuccess = true

    for (const [queueName, result] of Object.entries(results)) {
      totalMoved += result.movedCount
      totalErrors += result.errors.length
      if (!result.success) {
        overallSuccess = false
      }
    }

    return NextResponse.json({
      success: overallSuccess,
      results,
      summary: {
        totalQueues: Object.keys(results).length,
        totalMoved,
        totalErrors
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Failed to redrive jobs:', error)

    return NextResponse.json(
      {
        error: 'Failed to redrive jobs',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}