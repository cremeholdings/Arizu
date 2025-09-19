'use client'

import { useOnboardingStore } from '@/stores/onboarding'
import { OnboardingNav } from '@/components/OnboardingNav'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, CheckCircle, AlertCircle, Loader2, Rocket, Play, Settings, Eye } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'

export default function TestPage() {
  const { prev, complete, data } = useOnboardingStore()
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testResults, setTestResults] = useState<{
    success: boolean
    message: string
    details?: string[]
  } | null>(null)

  const handleTestWorkflow = async () => {
    setTestStatus('testing')
    setTestResults(null)

    try {
      // Simulate workflow testing
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Simulate success/failure randomly for demo
      const success = Math.random() > 0.3

      if (success) {
        setTestResults({
          success: true,
          message: 'Workflow test completed successfully!',
          details: [
            'n8n connection verified',
            'AI model response received',
            'App integrations tested',
            'Workflow logic validated'
          ]
        })
        setTestStatus('success')
      } else {
        setTestResults({
          success: false,
          message: 'Test encountered some issues',
          details: [
            'n8n connection: ✓ Connected',
            'AI model: ✓ Responding',
            'App integrations: ⚠ Gmail requires authentication',
            'Workflow logic: ✓ Valid'
          ]
        })
        setTestStatus('error')
      }
    } catch (error) {
      setTestResults({
        success: false,
        message: 'Test failed unexpectedly',
        details: ['Connection timeout', 'Please check your configuration']
      })
      setTestStatus('error')
    }
  }

  const handleLaunchWorkflow = () => {
    complete()
    // In a real app, this would actually deploy the workflow
  }

  const selectedApps = data.selectedApps || []
  const workflowName = data.workflowName || 'Untitled Workflow'
  const modelProvider = data.modelProvider || 'anthropic'
  const n8nUrl = data.n8nUrl || ''

  return (
    <div className="min-h-screen bg-gray-50">
      <OnboardingNav />

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Rocket className="w-8 h-8 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Test & Launch</h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Let's test your workflow to make sure everything works correctly, then launch it live.
          </p>
        </div>

        {/* Workflow summary */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Eye className="w-5 h-5 mr-2" />
              Workflow Summary
            </CardTitle>
            <CardDescription>
              Review your workflow configuration before testing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Workflow Name</h3>
                <p className="text-gray-600">{workflowName}</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">AI Provider</h3>
                <Badge variant="secondary">
                  {modelProvider.charAt(0).toUpperCase() + modelProvider.slice(1)}
                </Badge>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">n8n Instance</h3>
                <p className="text-gray-600 truncate">{n8nUrl}</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Connected Apps</h3>
                <div className="flex flex-wrap gap-1">
                  {selectedApps.map(app => (
                    <Badge key={app} variant="outline" className="text-xs">
                      {app.replace('-', ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Test workflow */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Play className="w-5 h-5 mr-2" />
              Test Workflow
            </CardTitle>
            <CardDescription>
              Run a test to verify your workflow works correctly
            </CardDescription>
          </CardHeader>
          <CardContent>
            {testStatus === 'idle' && (
              <div className="text-center py-6">
                <p className="text-gray-600 mb-4">
                  Ready to test your workflow? This will verify all connections and run a test execution.
                </p>
                <Button
                  onClick={handleTestWorkflow}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Run Test
                </Button>
              </div>
            )}

            {testStatus === 'testing' && (
              <div className="text-center py-6">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
                <p className="text-gray-600">Testing workflow...</p>
                <p className="text-sm text-gray-500 mt-2">This may take a few moments</p>
              </div>
            )}

            {testResults && (
              <div className="space-y-4">
                <Alert className={testResults.success ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}>
                  <div className="flex items-center">
                    {testResults.success ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-yellow-600" />
                    )}
                    <AlertDescription className="ml-2">
                      {testResults.message}
                    </AlertDescription>
                  </div>
                </Alert>

                {testResults.details && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">Test Details:</h4>
                    <ul className="space-y-1">
                      {testResults.details.map((detail, index) => (
                        <li key={index} className="text-sm text-gray-600 flex items-center">
                          <span className="w-2 h-2 bg-gray-400 rounded-full mr-2"></span>
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex space-x-3">
                  <Button
                    onClick={handleTestWorkflow}
                    variant="outline"
                    size="sm"
                  >
                    Run Test Again
                  </Button>
                  {!testResults.success && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-blue-600 border-blue-300 hover:bg-blue-50"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Fix Issues
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Launch workflow */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Rocket className="w-5 h-5 mr-2" />
              Launch Workflow
            </CardTitle>
            <CardDescription>
              Deploy your workflow and make it live
            </CardDescription>
          </CardHeader>
          <CardContent>
            {testStatus === 'success' ? (
              <div className="text-center py-6">
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Ready to Launch!</h3>
                <p className="text-gray-600 mb-6">
                  Your workflow has been tested and is ready to go live. Once launched, it will start automatically handling your automation.
                </p>
                <div className="space-x-3">
                  <Button
                    onClick={handleLaunchWorkflow}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Rocket className="w-4 h-4 mr-2" />
                    Launch Workflow
                  </Button>
                  <Link href="/dashboard">
                    <Button variant="outline">
                      Save as Draft
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Test Required</h3>
                <p className="text-gray-600">
                  Please run a successful test before launching your workflow.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <Button
            onClick={prev}
            variant="outline"
            className="flex items-center"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <div className="space-x-3">
            <Link href="/dashboard">
              <Button variant="outline">
                Skip to Dashboard
              </Button>
            </Link>
            {testStatus === 'success' && (
              <Button
                onClick={handleLaunchWorkflow}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Complete Setup
                <CheckCircle className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}