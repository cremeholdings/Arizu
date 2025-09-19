'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, X, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface HealthStatus {
  healthy: boolean
  services: {
    database: { healthy: boolean }
    redis: { healthy: boolean }
    n8n: { healthy: boolean }
    queue: { healthy: boolean }
  }
}

export function IncidentBanner() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [incidentMessage, setIncidentMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchHealth = async () => {
    try {
      const response = await fetch('/api/health')
      if (response.ok) {
        const data = await response.json()
        setHealth(data)

        // Check for incident message in response headers or body
        const incident = response.headers.get('x-incident-message') || data.incidentMessage
        setIncidentMessage(incident)
      }
    } catch (error) {
      console.error('Failed to fetch health status:', error)
      // On error, assume unhealthy state
      setHealth({
        healthy: false,
        services: {
          database: { healthy: false },
          redis: { healthy: false },
          n8n: { healthy: false },
          queue: { healthy: false }
        }
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()

    // Poll every 45 seconds
    const interval = setInterval(fetchHealth, 45000)

    return () => clearInterval(interval)
  }, [])

  // Check if we should show the banner
  const shouldShowBanner = () => {
    if (dismissed || isLoading) return false

    // Show if there's an explicit incident message
    if (incidentMessage) return true

    // Show if any service is unhealthy
    if (health && !health.healthy) return true

    return false
  }

  const getUnhealthyServices = () => {
    if (!health?.services) return []

    return Object.entries(health.services)
      .filter(([_, service]) => !service.healthy)
      .map(([name]) => name)
  }

  const getBannerMessage = () => {
    if (incidentMessage) {
      return incidentMessage
    }

    const unhealthyServices = getUnhealthyServices()

    if (unhealthyServices.length === 0) {
      return 'System experiencing issues. We\'re investigating.'
    }

    if (unhealthyServices.length === 1) {
      const serviceName = unhealthyServices[0] === 'n8n' ? 'workflow engine' : unhealthyServices[0]
      return `${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)} service is currently experiencing issues.`
    }

    return `Multiple services are experiencing issues: ${unhealthyServices.join(', ')}.`
  }

  const getBannerVariant = () => {
    if (incidentMessage) return 'default'

    const unhealthyServices = getUnhealthyServices()

    if (unhealthyServices.length === 0) return 'default'
    if (unhealthyServices.length >= 3) return 'destructive'

    return 'default'
  }

  if (!shouldShowBanner()) {
    return null
  }

  return (
    <Alert
      className={`mb-4 ${
        getBannerVariant() === 'destructive'
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-yellow-200 bg-yellow-50 text-yellow-800'
      }`}
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2 flex-1">
          <span>{getBannerMessage()}</span>
          {!incidentMessage && (
            <span className="text-sm opacity-75">
              We're working to resolve this quickly.
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 ml-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-current hover:bg-black/10 h-auto p-1"
            asChild
          >
            <a
              href="/status"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1"
            >
              <span className="text-xs">Status</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
            className="text-current hover:bg-black/10 h-auto p-1"
            aria-label="Dismiss banner"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}