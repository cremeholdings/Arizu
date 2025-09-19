'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PlanCard } from '@/components/PlanCard'
import { RunTestButton } from '@/components/RunTestButton'
import {
  useChatStore,
  canGeneratePlan,
  canDeployPlan,
  getStatusMessage,
  isOperationInProgress,
  formatApiError,
  isRateLimitError,
  isCircuitBreakerError,
  getRetryMessage
} from '@/stores/chat'
import {
  Loader2,
  Send,
  MessageSquare,
  Lightbulb,
  Rocket,
  CheckCircle,
  AlertCircle,
  Copy,
  ExternalLink,
  Sparkles
} from 'lucide-react'
import { cn } from '@/lib/utils'

const examplePrompts = [
  "When I receive an email in Gmail with 'meeting' in the subject, create a Google Calendar event and send a Slack notification to my team",
  "When someone submits our contact form, send them a welcome email and add them to our CRM with lead scoring",
  "Monitor my GitHub repository for new issues and post a summary to our Discord channel every morning",
  "When a customer cancels their subscription, send them a feedback survey and update their status in our database"
]

export default function NewAutomationPage() {
  const {
    text,
    plan,
    status,
    error,
    testResult,
    deployResult,
    generationAttempts,
    setText,
    setStatus,
    setPlan,
    setError,
    setDeployResult,
    incrementAttempts,
    setLastGeneratedText,
    clearResults
  } = useChatStore()

  const [deploymentStatus, setDeploymentStatus] = useState<'idle' | 'deploying' | 'success' | 'error'>('idle')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const canGenerate = canGeneratePlan({ text, status, plan, error, testResult, deployResult, generationAttempts, lastGeneratedText: '' })
  const canDeploy = canDeployPlan({ text, status, plan, error, testResult, deployResult, generationAttempts, lastGeneratedText: '' })
  const isLoading = isOperationInProgress(status) || deploymentStatus === 'deploying'

  useEffect(() => {
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [text])

  const handleGeneratePlan = async () => {
    if (!canGenerate || !text.trim()) return

    try {
      setStatus('generating')
      setError(undefined)
      clearResults()
      incrementAttempts()
      setLastGeneratedText(text)

      console.log('Generating plan...', {
        promptLength: text.length,
        attempt: generationAttempts + 1
      })

      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: text }),
      })

      const data = await response.json()

      if (!response.ok) {
        // Handle different error types
        if (response.status === 429) {
          const retryMessage = getRetryMessage(data)
          setError(retryMessage)
        } else if (response.status === 503 && isCircuitBreakerError(data)) {
          setError('AI service temporarily unavailable. Please try again in a few minutes.')
        } else {
          setError(formatApiError(data))
        }
        return
      }

      if (data.ok && data.plan) {
        setPlan(data.plan)
        setStatus('idle')
        console.log('Plan generated successfully', {
          planName: data.plan.name,
          stepCount: data.plan.steps?.length || 0,
          attempts: data.meta?.attempts || 1
        })
      } else {
        setError(data.error || 'Failed to generate plan')
      }

    } catch (error) {
      console.error('Plan generation failed:', error)
      setError('Failed to generate plan. Please check your connection and try again.')
    } finally {
      if (status === 'generating') {
        setStatus('idle')
      }
    }
  }

  const handleDeployPlan = async () => {
    if (!canDeploy || !plan) return

    try {
      setDeploymentStatus('deploying')
      setStatus('deploying')
      setError(undefined)

      console.log('Deploying plan...', {
        planName: plan.name,
        stepCount: plan.steps.length
      })

      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan,
          workflowName: plan.name || 'Generated Automation'
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        // Handle different error types
        if (response.status === 429) {
          const retryMessage = getRetryMessage(data)
          setError(retryMessage)
        } else if (response.status === 503 && isCircuitBreakerError(data)) {
          setError('Deployment service temporarily unavailable. Please try again in a few minutes.')
        } else {
          setError(formatApiError(data))
        }
        setDeploymentStatus('error')
        return
      }

      if (data.ok) {
        const deployResult = {
          ok: true,
          workflowId: data.workflowId,
          workflowName: data.workflowName,
          webhookUrl: data.webhookUrl,
          isNew: data.isNew,
          message: data.message
        }

        setDeployResult(deployResult)
        setDeploymentStatus('success')
        setStatus('deployed')

        console.log('Plan deployed successfully', {
          workflowId: deployResult.workflowId,
          isNew: deployResult.isNew,
          hasWebhook: !!deployResult.webhookUrl
        })
      } else {
        setError(data.error || 'Failed to deploy automation')
        setDeploymentStatus('error')
      }

    } catch (error) {
      console.error('Deployment failed:', error)
      setError('Failed to deploy automation. Please check your connection and try again.')
      setDeploymentStatus('error')
    } finally {
      if (status === 'deploying') {
        setStatus('idle')
      }
    }
  }

  const handleExamplePrompt = (prompt: string) => {
    setText(prompt)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleGeneratePlan()
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Create New Automation
        </h1>
        <p className="text-lg text-gray-600">
          Describe your automation in plain English and we'll build it for you
        </p>
      </div>

      {/* Chat Interface */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-600" />
            Automation Builder
          </CardTitle>
          <CardDescription>
            Tell us what you want to automate - be as specific as possible about triggers, actions, and conditions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Display */}
          {(status !== 'idle' || error) && (
            <Alert className={cn(
              error ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50"
            )}>
              <div className="flex items-center gap-2">
                {error ? (
                  <AlertCircle className="w-4 h-4 text-red-600" />
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                )}
                <AlertDescription className={error ? "text-red-800" : "text-blue-800"}>
                  {error || getStatusMessage(status)}
                </AlertDescription>
              </div>
            </Alert>
          )}

          {/* Text Input */}
          <div className="space-y-3">
            <Textarea
              ref={textareaRef}
              placeholder="Describe your automation... For example: 'When someone fills out our contact form, send them a welcome email and add them to our mailing list. If they're interested in enterprise features, also create a task in our CRM for the sales team to follow up.'"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[120px] resize-none"
              disabled={isLoading}
            />

            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {text.length}/2000 characters
                {canGenerate && (
                  <span className="ml-2 text-blue-600">
                    • Press Cmd+Enter to generate
                  </span>
                )}
              </div>

              <Button
                onClick={handleGeneratePlan}
                disabled={!canGenerate || isLoading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {status === 'generating' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Plan
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Example Prompts */}
      {!plan && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-yellow-600" />
              Need inspiration?
            </CardTitle>
            <CardDescription>
              Try one of these example automations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {examplePrompts.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => handleExamplePrompt(prompt)}
                  disabled={isLoading}
                  className="text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <p className="text-sm text-gray-700">{prompt}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generated Plan */}
      {plan && (
        <div className="space-y-4">
          <PlanCard plan={plan} />

          {/* Action Buttons */}
          <div className="flex items-center gap-4">
            <RunTestButton
              onTestStart={() => console.log('Test started')}
              onTestComplete={(success) => console.log('Test completed:', success)}
            />

            <Button
              onClick={handleDeployPlan}
              disabled={!canDeploy || deploymentStatus === 'deploying'}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {deploymentStatus === 'deploying' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4 mr-2" />
                  Deploy Automation
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Deployment Success */}
      {deployResult?.ok && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <CheckCircle className="w-8 h-8 text-green-600 mt-1" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-green-900 mb-2">
                  Automation Deployed Successfully! 🎉
                </h3>
                <p className="text-green-800 mb-4">
                  {deployResult.message || 'Your automation is now live and ready to handle requests.'}
                </p>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-green-900 mb-2">Deployment Details</h4>
                    <dl className="space-y-1 text-sm">
                      <div>
                        <dt className="text-green-700">Workflow ID:</dt>
                        <dd className="font-mono text-green-800">{deployResult.workflowId}</dd>
                      </div>
                      <div>
                        <dt className="text-green-700">Name:</dt>
                        <dd className="text-green-800">{deployResult.workflowName}</dd>
                      </div>
                      <div>
                        <dt className="text-green-700">Status:</dt>
                        <dd className="text-green-800">
                          <Badge className="bg-green-100 text-green-700">
                            {deployResult.isNew ? 'Newly Created' : 'Updated'}
                          </Badge>
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {deployResult.webhookUrl && (
                    <div>
                      <h4 className="font-medium text-green-900 mb-2">Webhook URL</h4>
                      <div className="space-y-2">
                        <p className="text-sm text-green-700">
                          Use this URL for external integrations:
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-mono truncate">
                            {deployResult.webhookUrl}
                          </code>
                          <Button
                            onClick={() => navigator.clipboard.writeText(deployResult.webhookUrl!)}
                            variant="outline"
                            size="sm"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-4">
                  <Button
                    variant="outline"
                    className="border-green-300 text-green-700 hover:bg-green-100"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View in n8n
                  </Button>
                  <Button
                    onClick={() => window.location.href = '/dashboard/automations'}
                    variant="outline"
                    className="border-green-300 text-green-700 hover:bg-green-100"
                  >
                    View All Automations
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}