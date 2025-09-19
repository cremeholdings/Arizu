import { NextResponse } from 'next/server'
import { getAllQueuesStatus } from '@/lib/queue'

export async function GET() {
  try {
    const queues = await getAllQueuesStatus()

    return NextResponse.json({
      queues,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Failed to get queue status:', error)

    return NextResponse.json(
      {
        error: 'Failed to retrieve queue status',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}