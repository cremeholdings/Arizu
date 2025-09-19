'use client'

import { useOnboardingStore, canProceedFromStep } from '@/stores/onboarding'
import { OnboardingNav } from '@/components/OnboardingNav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, ArrowLeft, ExternalLink, CheckCircle, AlertCircle, Server } from 'lucide-react'
import { useState, useEffect } from 'react'

export default function N8nPage() {
  const { next, prev, set, data } = useOnboardingStore()
  const [n8nUrl, setN8nUrl] = useState(data.n8nUrl || '')
  const [isValidUrl, setIsValidUrl] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle')

  const canProceed = canProceedFromStep('n8n', { ...data, n8nUrl })

  useEffect(() => {
    // Validate URL format
    try {
      if (n8nUrl.trim()) {
        new URL(n8nUrl)
        setIsValidUrl(true)
      } else {
        setIsValidUrl(false)
      }
    } catch {
      setIsValidUrl(false)
    }
  }, [n8nUrl])

  const handleUrlChange = (value: string) => {
    setN8nUrl(value)
    set('n8nUrl', value)
    setConnectionStatus('idle')
  }

  const checkConnection = async () => {
    if (!isValidUrl) return

    setIsChecking(true)
    setConnectionStatus('checking')

    try {
      // Simulate connection check
      await new Promise(resolve => setTimeout(resolve, 2000))
      setConnectionStatus('success')
    } catch (error) {
      setConnectionStatus('error')
    } finally {
      setIsChecking(false)
    }
  }

  const handleNext = () => {
    if (canProceed) {
      next()
    }
  }

  const formatUrl = (url: string) => {
    let formatted = url.trim()
    if (formatted && !formatted.startsWith('http://') && !formatted.startsWith('https://')) {
      formatted = 'https://' + formatted
    }
    return formatted
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text')
    const formatted = formatUrl(pasted)
    setN8nUrl(formatted)
    set('n8nUrl', formatted)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <OnboardingNav />

      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Server className="w-8 h-8 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Connect n8n</h1>
          </div>
          <p className="text-lg text-gray-600">
            Connect your n8n instance to power your automated workflows
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>n8n Instance URL</CardTitle>
            <CardDescription>
              Enter the URL of your n8n instance. This is where your workflows will be deployed and executed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="n8n-url">Instance URL</Label>
              <Input
                id="n8n-url"
                type="url"
                placeholder="https://your-n8n-instance.com"
                value={n8nUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                onPaste={handlePaste}
                className={`transition-colors ${
                  n8nUrl && !isValidUrl ? 'border-red-300 focus:border-red-500' : ''
                }`}
              />
              {n8nUrl && !isValidUrl && (
                <p className="text-sm text-red-600 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  Please enter a valid URL
                </p>
              )}
            </div>

            {isValidUrl && (
              <div className="flex items-center space-x-3">
                <Button
                  onClick={checkConnection}
                  disabled={isChecking}
                  variant="outline"
                  size="sm"
                >
                  {isChecking ? 'Checking...' : 'Test Connection'}
                </Button>

                {connectionStatus === 'success' && (
                  <div className="flex items-center text-green-600 text-sm">
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Connection successful
                  </div>
                )}

                {connectionStatus === 'error' && (
                  <div className="flex items-center text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    Connection failed
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-8 bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-900 flex items-center">
              <ExternalLink className="w-5 h-5 mr-2" />
              Don't have n8n yet?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-blue-800 mb-4">
              n8n is the automation platform that powers Arizu workflows. You can get started quickly with:
            </p>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <Badge variant="secondary" className="bg-blue-100 text-blue-700">Cloud</Badge>
                <div>
                  <p className="font-medium text-blue-900">n8n Cloud</p>
                  <p className="text-blue-700 text-sm">Hosted solution, ready in minutes</p>
                  <a
                    href="https://n8n.io/cloud"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 text-sm underline hover:text-blue-800"
                  >
                    Start free trial →
                  </a>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Badge variant="outline" className="border-blue-300 text-blue-700">Self-hosted</Badge>
                <div>
                  <p className="font-medium text-blue-900">Self-hosted n8n</p>
                  <p className="text-blue-700 text-sm">Deploy on your own infrastructure</p>
                  <a
                    href="https://docs.n8n.io/hosting/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 text-sm underline hover:text-blue-800"
                  >
                    Setup guide →
                  </a>
                </div>
              </div>
            </div>
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

          <Button
            onClick={handleNext}
            disabled={!canProceed}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center"
          >
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {!canProceed && n8nUrl && (
          <p className="text-sm text-gray-500 text-center mt-4">
            Please enter a valid n8n instance URL to continue
          </p>
        )}
      </div>
    </div>
  )
}