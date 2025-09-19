'use client'

import { useOnboardingStore, canProceedFromStep } from '@/stores/onboarding'
import { OnboardingNav } from '@/components/OnboardingNav'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, ArrowLeft, Bot, CheckCircle, Star, Zap, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'

type ModelProvider = 'anthropic' | 'openai' | 'mistral' | 'google'

interface ProviderInfo {
  id: ModelProvider
  name: string
  description: string
  icon: React.ReactNode
  badge?: string
  features: string[]
  recommended?: boolean
}

const providers: ProviderInfo[] = [
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    description: 'Advanced reasoning and safety-focused AI with excellent workflow understanding',
    icon: <Bot className="w-6 h-6" />,
    badge: 'Recommended',
    recommended: true,
    features: [
      'Excellent at complex workflows',
      'Strong reasoning capabilities',
      'Safety-focused responses',
      'Latest Claude 3.5 Sonnet model'
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI GPT-4',
    description: 'Versatile and widely-used AI model with strong general capabilities',
    icon: <Brain className="w-6 h-6" />,
    features: [
      'Versatile and reliable',
      'Extensive training data',
      'Good at code generation',
      'GPT-4 Turbo model'
    ]
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    description: 'Fast and efficient European AI model with competitive performance',
    icon: <Zap className="w-6 h-6" />,
    features: [
      'Fast response times',
      'Cost-effective option',
      'European data governance',
      'Mistral Large model'
    ]
  },
  {
    id: 'google',
    name: 'Google Gemini',
    description: 'Google\'s multimodal AI with strong analytical capabilities',
    icon: <Star className="w-6 h-6" />,
    features: [
      'Multimodal capabilities',
      'Strong analytical skills',
      'Integration with Google services',
      'Gemini Pro model'
    ]
  }
]

export default function AIPage() {
  const { next, prev, set, data } = useOnboardingStore()
  const selectedProvider = data.modelProvider

  const canProceed = canProceedFromStep('ai', data)

  const handleProviderSelect = (providerId: ModelProvider) => {
    set('modelProvider', providerId)
  }

  const handleNext = () => {
    if (canProceed) {
      next()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <OnboardingNav />

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Bot className="w-8 h-8 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Choose AI Provider</h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Select the AI model that will power your workflow generation. You can change this later in settings.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {providers.map((provider) => (
            <Card
              key={provider.id}
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-lg",
                selectedProvider === provider.id
                  ? "ring-2 ring-blue-500 bg-blue-50 border-blue-200"
                  : "hover:border-gray-300"
              )}
              onClick={() => handleProviderSelect(provider.id)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      selectedProvider === provider.id
                        ? "bg-blue-100 text-blue-600"
                        : "bg-gray-100 text-gray-600"
                    )}>
                      {provider.icon}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{provider.name}</CardTitle>
                      {provider.recommended && (
                        <Badge className="bg-green-100 text-green-700 text-xs mt-1">
                          {provider.badge}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {selectedProvider === provider.id && (
                    <CheckCircle className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                <CardDescription className="text-sm">
                  {provider.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {provider.features.map((feature, index) => (
                    <li key={index} className="flex items-center text-sm text-gray-600">
                      <CheckCircle className="w-3 h-3 text-green-500 mr-2 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mb-8 bg-amber-50 border-amber-200">
          <CardHeader>
            <CardTitle className="text-amber-900 flex items-center">
              <Bot className="w-5 h-5 mr-2" />
              API Keys Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-amber-800 mb-4">
              You'll need to provide your own API key for the selected provider. This ensures:
            </p>
            <ul className="space-y-2 text-amber-800">
              <li className="flex items-center">
                <CheckCircle className="w-4 h-4 text-amber-600 mr-2" />
                Full control over your AI usage and costs
              </li>
              <li className="flex items-center">
                <CheckCircle className="w-4 h-4 text-amber-600 mr-2" />
                Direct relationship with the AI provider
              </li>
              <li className="flex items-center">
                <CheckCircle className="w-4 h-4 text-amber-600 mr-2" />
                No markup on AI model costs
              </li>
              <li className="flex items-center">
                <CheckCircle className="w-4 h-4 text-amber-600 mr-2" />
                Enhanced privacy and security
              </li>
            </ul>
            <p className="text-amber-700 text-sm mt-4">
              <strong>Security note:</strong> API keys are encrypted and stored securely.
              They're never logged or shared, and you can revoke access at any time.
            </p>
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

        {!canProceed && (
          <p className="text-sm text-gray-500 text-center mt-4">
            Please select an AI provider to continue
          </p>
        )}
      </div>
    </div>
  )
}