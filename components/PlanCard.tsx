'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Copy, CheckCircle, AlertCircle, Eye, Code2, ArrowUpRight, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Plan } from '@/lib/plan/schema'

interface PlanCardProps {
  plan: Plan
  issues?: string[]
  className?: string
}

export function PlanCard({ plan, issues = [], className }: PlanCardProps) {
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set())

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(plan, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
    }
  }

  const toggleStepExpansion = (stepIndex: number) => {
    const newExpanded = new Set(expandedSteps)
    if (newExpanded.has(stepIndex)) {
      newExpanded.delete(stepIndex)
    } else {
      newExpanded.add(stepIndex)
    }
    setExpandedSteps(newExpanded)
  }

  const formatStepType = (type: string): string => {
    return type.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }

  const getStepIcon = (type: string) => {
    // Simple icon mapping - you can expand this
    switch (type) {
      case 'webhook_trigger':
        return '🔔'
      case 'manual_trigger':
        return '👆'
      case 'http_request':
        return '🌐'
      case 'email':
        return '📧'
      case 'database':
        return '🗄️'
      default:
        return '⚙️'
    }
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-blue-600" />
              {plan.name || 'Automation Plan'}
            </CardTitle>
            <CardDescription className="mt-1">
              {plan.description || 'Generated automation workflow'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {plan.steps.length} step{plan.steps.length !== 1 ? 's' : ''}
            </Badge>
            {issues.length === 0 ? (
              <Badge className="bg-green-100 text-green-700">
                <CheckCircle className="w-3 h-3 mr-1" />
                Valid
              </Badge>
            ) : (
              <Badge variant="destructive">
                <AlertCircle className="w-3 h-3 mr-1" />
                {issues.length} issue{issues.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Issues Alert */}
        {issues.length > 0 && (
          <Alert className="mb-4 border-yellow-200 bg-yellow-50">
            <AlertCircle className="w-4 h-4 text-yellow-600" />
            <AlertDescription>
              <div className="font-medium text-yellow-800 mb-2">Validation Issues:</div>
              <ul className="list-disc list-inside space-y-1 text-yellow-700">
                {issues.map((issue, index) => (
                  <li key={index} className="text-sm">{issue}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="steps">Steps</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Plan Details</h4>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-gray-600">Name:</dt>
                    <dd className="font-medium">{plan.name || 'Untitled'}</dd>
                  </div>
                  {plan.description && (
                    <div>
                      <dt className="text-gray-600">Description:</dt>
                      <dd>{plan.description}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-gray-600">Steps:</dt>
                    <dd>{plan.steps.length}</dd>
                  </div>
                  {plan.metadata?.tags && plan.metadata.tags.length > 0 && (
                    <div>
                      <dt className="text-gray-600">Tags:</dt>
                      <dd className="flex flex-wrap gap-1 mt-1">
                        {plan.metadata.tags.map(tag => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-2">Step Types</h4>
                <div className="space-y-2">
                  {Array.from(new Set(plan.steps.map(step => step.type))).map(type => (
                    <div key={type} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span>{getStepIcon(type)}</span>
                        {formatStepType(type)}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {plan.steps.filter(step => step.type === type).length}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="steps" className="space-y-3">
            <ScrollArea className="h-64">
              {plan.steps.map((step, index) => (
                <Card key={index} className="mb-3">
                  <CardContent className="p-3">
                    <button
                      onClick={() => toggleStepExpansion(index)}
                      className="flex items-center justify-between w-full text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{getStepIcon(step.type)}</span>
                        <div>
                          <div className="font-medium">
                            Step {index + 1}: {step.name || formatStepType(step.type)}
                          </div>
                          <div className="text-sm text-gray-600">
                            {formatStepType(step.type)}
                          </div>
                        </div>
                      </div>
                      {expandedSteps.has(index) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>

                    {expandedSteps.has(index) && (
                      <div className="mt-3 pl-8 space-y-2">
                        {step.description && (
                          <p className="text-sm text-gray-600">{step.description}</p>
                        )}
                        {step.config && Object.keys(step.config).length > 0 && (
                          <div>
                            <h5 className="text-sm font-medium text-gray-900 mb-1">Configuration:</h5>
                            <pre className="text-xs bg-gray-50 p-2 rounded border overflow-x-auto">
                              {JSON.stringify(step.config, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="json" className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">Raw JSON</h4>
              <Button
                onClick={handleCopyJson}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy JSON
                  </>
                )}
              </Button>
            </div>

            <ScrollArea className="h-64">
              <pre className="text-xs bg-gray-50 p-4 rounded border overflow-x-auto">
                {JSON.stringify(plan, null, 2)}
              </pre>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-gray-600">
            Plan ready for testing and deployment
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
              disabled // Future functionality
            >
              <Code2 className="w-4 h-4" />
              Advanced Editor
              <ArrowUpRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}