'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useChatStore, canTestPlan, formatApiError, isRateLimitError, isCircuitBreakerError, getRetryMessage } from '@/stores/chat'
import { Loader2, Play, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RunTestButtonProps {
  className?: string
  size?: 'sm' | 'default' | 'lg'
  variant?: 'default' | 'outline' | 'secondary'
  onTestStart?: () => void
  onTestComplete?: (success: boolean) => void
}

export function RunTestButton({
  className,
  size = 'default',
  variant = 'default',
  onTestStart,
  onTestComplete
}: RunTestButtonProps) {
  const {
    plan,
    status,
    testResult,
    error,
    setStatus,
    setTestResult,
    setError
  } = useChatStore()

  const [isRetrying, setIsRetrying] = useState(false)

  const canTest = canTestPlan({ plan, status, testResult, error, text: '', generationAttempts: 0, lastGeneratedText: '' })
  const isLoading = status === 'testing' || isRetrying

  const runTest = async () => {
    if (!plan || isLoading) return

    try {
      setIsRetrying(false)
      setStatus('testing')
      setTestResult(undefined)
      setError(undefined)
      onTestStart?.()

      console.log('Starting plan test...', {
        planName: plan.name,
        stepCount: plan.steps.length
      })

      const response = await fetch('/api/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan }),
      })

      const data = await response.json()

      if (!response.ok) {
        // Handle different error types
        if (response.status === 429) {
          const retryMessage = getRetryMessage(data)
          setError(retryMessage)
        } else if (response.status === 503 && isCircuitBreakerError(data)) {
          setError('Service temporarily unavailable. Please try again in a few minutes.')
        } else {
          setError(formatApiError(data))
        }
        setStatus('idle')
        onTestComplete?.(false)
        return
      }

      // Process successful response
      const testResult = {
        ok: data.ok,
        simulated: data.simulated,
        issues: data.issues,
        message: data.message
      }

      setTestResult(testResult)
      setStatus('idle')

      console.log('Plan test completed', {
        success: testResult.ok,
        issues: testResult.issues?.length || 0,
        simulated: testResult.simulated
      })

      onTestComplete?.(testResult.ok)

    } catch (error) {
      console.error('Test request failed:', error)
      setError('Failed to test plan. Please check your connection and try again.')
      setStatus('idle')
      onTestComplete?.(false)
    }
  }

  const handleRetry = async () => {
    setIsRetrying(true)
    await runTest()
    setIsRetrying(false)
  }

  const getButtonContent = () => {
    if (isLoading) {
      return (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {status === 'testing' ? 'Testing...' : 'Retrying...'}
        </>
      )
    }

    if (testResult) {
      if (testResult.ok) {
        return (
          <>
            <CheckCircle className="w-4 h-4 text-green-600" />
            Test Passed
          </>
        )
      } else {
        return (
          <>
            <AlertCircle className="w-4 h-4 text-yellow-600" />
            Test Issues
          </>
        )
      }
    }

    return (
      <>
        <Play className="w-4 h-4" />
        Test Plan
      </>
    )
  }

  const getButtonVariant = () => {
    if (testResult?.ok) return 'outline'
    if (testResult && !testResult.ok) return 'outline'
    return variant
  }

  return (
    <div className={cn("space-y-3", className)}>
      <Button
        onClick={runTest}
        disabled={!canTest || isLoading}
        size={size}
        variant={getButtonVariant()}
        className={cn(
          "flex items-center gap-2",
          testResult?.ok && "border-green-300 text-green-700 hover:bg-green-50",
          testResult && !testResult.ok && "border-yellow-300 text-yellow-700 hover:bg-yellow-50"
        )}
      >
        {getButtonContent()}
      </Button>

      {/* Test Results */}
      {testResult && (
        <Alert className={cn(
          testResult.ok ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"
        )}>
          <div className="flex items-start gap-2">
            {testResult.ok ? (
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5" />
            )}
            <div className="flex-1">
              <AlertDescription>
                <div className={cn(
                  "font-medium mb-1",
                  testResult.ok ? "text-green-800" : "text-yellow-800"
                )}>
                  {testResult.message || (testResult.ok ? 'Test passed successfully!' : 'Test completed with issues')}
                </div>

                {testResult.simulated && (
                  <div className="text-xs text-gray-600 mb-2 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Simulated test run
                  </div>
                )}

                {testResult.issues && testResult.issues.length > 0 && (
                  <div className="mt-2">
                    <div className="text-sm font-medium text-yellow-800 mb-1">Issues found:</div>
                    <ul className="list-disc list-inside space-y-1">
                      {testResult.issues.map((issue, index) => (
                        <li key={index} className="text-sm text-yellow-700">{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {testResult && !testResult.ok && (
                  <Button
                    onClick={handleRetry}
                    disabled={isLoading}
                    variant="outline"
                    size="sm"
                    className="mt-3"
                  >
                    {isRetrying ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        Retrying...
                      </>
                    ) : (
                      'Retry Test'
                    )}
                  </Button>
                )}
              </AlertDescription>
            </div>
          </div>
        </Alert>
      )}

      {/* Error Display */}
      {error && !testResult && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <AlertDescription>
            <div className="font-medium text-red-800 mb-1">Test Failed</div>
            <div className="text-red-700 text-sm mb-2">{error}</div>
            {(isRateLimitError({ error }) || isCircuitBreakerError({ error })) ? (
              <div className="text-xs text-red-600">
                Please wait before retrying.
              </div>
            ) : (
              <Button
                onClick={handleRetry}
                disabled={isLoading}
                variant="outline"
                size="sm"
                className="border-red-300 text-red-700 hover:bg-red-50"
              >
                {isRetrying ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    Retrying...
                  </>
                ) : (
                  'Retry'
                )}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}