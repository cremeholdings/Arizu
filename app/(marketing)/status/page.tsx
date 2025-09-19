import { Metadata } from 'next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react'

export const metadata: Metadata = {
  title: 'System Status - Arizu',
  description: 'Real-time status of Arizu services and infrastructure',
  robots: 'noindex', // Prevent search indexing of status page
}

interface HealthStatus {
  healthy: boolean
  timestamp: string
  services: {
    database: {
      healthy: boolean
      responseTime?: number
      error?: string
    }
    redis: {
      healthy: boolean
      responseTime?: number
      error?: string
    }
    n8n: {
      healthy: boolean
      responseTime?: number
      error?: string
    }
    queue: {
      healthy: boolean
      responseTime?: number
      error?: string
    }
  }
  uptime: number
  version?: string
}

async function getHealthStatus(): Promise<HealthStatus> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/health`,
      {
        next: { revalidate: 30 }, // Revalidate every 30 seconds
        headers: {
          'User-Agent': 'Arizu-Status-Page/1.0'
        }
      }
    )

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Failed to fetch health status:', error)

    // Return fallback status indicating system is down
    return {
      healthy: false,
      timestamp: new Date().toISOString(),
      services: {
        database: { healthy: false, error: 'Health check failed' },
        redis: { healthy: false, error: 'Health check failed' },
        n8n: { healthy: false, error: 'Health check failed' },
        queue: { healthy: false, error: 'Health check failed' }
      },
      uptime: 0
    }
  }
}

function getStatusIcon(healthy: boolean) {
  if (healthy) {
    return <CheckCircle2 className="h-5 w-5 text-green-500" />
  }
  return <XCircle className="h-5 w-5 text-red-500" />
}

function getStatusBadge(healthy: boolean, responseTime?: number) {
  if (healthy) {
    if (responseTime && responseTime > 1000) {
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Degraded
        </Badge>
      )
    }
    return (
      <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Operational
      </Badge>
    )
  }
  return (
    <Badge variant="destructive">
      <XCircle className="h-3 w-3 mr-1" />
      Down
    </Badge>
  )
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

export default async function StatusPage() {
  const health = await getHealthStatus()
  const lastUpdated = new Date(health.timestamp).toLocaleString()

  const serviceConfig = [
    {
      key: 'database',
      name: 'Database',
      description: 'PostgreSQL database for core application data',
      slo: '99.9% uptime, <100ms response time'
    },
    {
      key: 'redis',
      name: 'Cache & Sessions',
      description: 'Redis for caching and session management',
      slo: '99.9% uptime, <50ms response time'
    },
    {
      key: 'n8n',
      name: 'Workflow Engine',
      description: 'n8n automation and workflow processing',
      slo: '99.5% uptime, workflow execution within 30s'
    },
    {
      key: 'queue',
      name: 'Job Queue',
      description: 'Background job processing and task queue',
      slo: '99.9% uptime, job processing within 60s'
    }
  ] as const

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">System Status</h1>
              <p className="text-muted-foreground mt-2">
                Real-time status and performance of Arizu services
              </p>
            </div>

            <div className="text-right">
              <div className="flex items-center gap-2 mb-2">
                {getStatusIcon(health.healthy)}
                <span className="font-medium">
                  {health.healthy ? 'All Systems Operational' : 'Service Disruption'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Last updated: {lastUpdated}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-6">
          {/* Overall Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                System Overview
              </CardTitle>
              <CardDescription>
                Current system uptime and overall health status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {formatUptime(health.uptime)}
                  </div>
                  <div className="text-sm text-muted-foreground">Current Uptime</div>
                </div>

                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {Object.values(health.services).filter(s => s.healthy).length}/
                    {Object.values(health.services).length}
                  </div>
                  <div className="text-sm text-muted-foreground">Services Operational</div>
                </div>

                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">99.9%</div>
                  <div className="text-sm text-muted-foreground">30-day Uptime</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Service Status */}
          <div className="grid gap-4">
            <h2 className="text-xl font-semibold">Service Status</h2>

            {serviceConfig.map((config) => {
              const service = health.services[config.key]
              return (
                <Card key={config.key}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(service.healthy)}
                        <div>
                          <CardTitle className="text-lg">{config.name}</CardTitle>
                          <CardDescription>{config.description}</CardDescription>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {service.responseTime && (
                          <span className="text-sm text-muted-foreground">
                            {service.responseTime}ms
                          </span>
                        )}
                        {getStatusBadge(service.healthy, service.responseTime)}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Service Level Objective:</span>
                        <span>{config.slo}</span>
                      </div>

                      {service.error && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Last Error:</span>
                          <span className="text-red-600 font-mono text-xs">
                            {service.error}
                          </span>
                        </div>
                      )}

                      {service.healthy && service.responseTime && (
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                          <div
                            className={`h-2 rounded-full ${
                              service.responseTime < 100 ? 'bg-green-500' :
                              service.responseTime < 500 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{
                              width: `${Math.min((service.responseTime / 1000) * 100, 100)}%`
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Incident Message */}
          {process.env.INCIDENT_MESSAGE && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-800">
                  <AlertTriangle className="h-5 w-5" />
                  Active Incident
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-yellow-700">{process.env.INCIDENT_MESSAGE}</p>
                <p className="text-sm text-yellow-600 mt-2">
                  We are actively working to resolve this issue. Updates will be posted here.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Auto-refresh notice */}
          <div className="text-center text-sm text-muted-foreground">
            <p>This page refreshes automatically every 30 seconds</p>
            {health.version && (
              <p className="mt-1">Version: {health.version}</p>
            )}
          </div>
        </div>
      </div>

      {/* Auto-refresh meta tag */}
      <meta httpEquiv="refresh" content="30" />
    </div>
  )
}