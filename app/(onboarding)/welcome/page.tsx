'use client'

import { useOnboardingStore } from '@/stores/onboarding'
import { OnboardingNav } from '@/components/OnboardingNav'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Zap, Bot, Globe, Shield } from 'lucide-react'
import Link from 'next/link'

export default function WelcomePage() {
  const { next, data } = useOnboardingStore()

  const handleGetStarted = () => {
    next()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <OnboardingNav />

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-blue-600 rounded-2xl p-3 mr-4">
              <Zap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900">
              Welcome to Arizu
            </h1>
          </div>

          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            Transform your ideas into powerful automated workflows using natural language.
            No coding required—just describe what you want to automate.
          </p>

          <div className="flex items-center justify-center space-x-2 mb-8">
            <Badge variant="secondary" className="bg-blue-100 text-blue-700">
              Plan Badge
            </Badge>
            <Badge variant="outline">
              Free Tier
            </Badge>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <Card className="text-center">
            <CardHeader>
              <Bot className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <CardTitle className="text-lg">AI-Powered</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Describe your automation in plain English and watch AI build it for you
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Globe className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <CardTitle className="text-lg">Connect Anything</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Integrate with 500+ apps and services to create powerful workflows
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Zap className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
              <CardTitle className="text-lg">Lightning Fast</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Go from idea to live automation in minutes, not hours or days
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Shield className="w-8 h-8 text-purple-600 mx-auto mb-2" />
              <CardTitle className="text-lg">Enterprise Ready</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Built with security, reliability, and scalability in mind
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            What we'll set up together
          </h2>

          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium mt-0.5">
                1
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Connect your n8n instance</h3>
                <p className="text-gray-600 text-sm">Link your n8n automation platform to power your workflows</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium mt-0.5">
                2
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Choose your AI provider</h3>
                <p className="text-gray-600 text-sm">Select from Claude, GPT-4, Mistral, or Gemini for workflow generation</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium mt-0.5">
                3
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Select apps to integrate</h3>
                <p className="text-gray-600 text-sm">Pick the tools and services you want to automate</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium mt-0.5">
                4
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Create your first workflow</h3>
                <p className="text-gray-600 text-sm">Build an automation using natural language prompts</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium mt-0.5">
                5
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Test and launch</h3>
                <p className="text-gray-600 text-sm">Verify everything works and activate your automation</p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center">
          <Button
            onClick={handleGetStarted}
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3"
          >
            Get Started
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>

          <p className="text-sm text-gray-500 mt-4">
            This setup takes about 5 minutes • No credit card required
          </p>

          <div className="mt-6">
            <Link
              href="/dashboard"
              className="text-sm text-blue-600 hover:text-blue-700 underline"
            >
              Skip setup and go to dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}