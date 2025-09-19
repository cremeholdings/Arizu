'use client'

import { useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowRight, Check, X, Zap, Crown, Star, TrendingUp } from 'lucide-react'
import { LimitMeta, FeatureMeta } from '@/lib/errors'

interface UpgradeDialogProps {
  open: boolean
  onClose: () => void
  code: 'PLAN_LIMIT' | 'FEATURE_LOCKED'
  detail?: LimitMeta | FeatureMeta
}

// Plan information for display
const PLAN_INFO = {
  free: {
    name: 'Free',
    price: '$0',
    color: 'text-gray-600',
    icon: <Star className="w-4 h-4" />
  },
  starter: {
    name: 'Starter',
    price: '$29',
    color: 'text-blue-600',
    icon: <Zap className="w-4 h-4" />
  },
  pro: {
    name: 'Pro',
    price: '$99',
    color: 'text-purple-600',
    icon: <Crown className="w-4 h-4" />
  },
  enterprise: {
    name: 'Enterprise',
    price: 'Custom',
    color: 'text-green-600',
    icon: <TrendingUp className="w-4 h-4" />
  }
}

const PLAN_FEATURES = {
  free: {
    workflows: 3,
    stepsPerWorkflow: 5,
    monthlyRuns: 100,
    features: ['Basic connectors', 'Webhook triggers', 'Community support']
  },
  starter: {
    workflows: 10,
    stepsPerWorkflow: 10,
    monthlyRuns: 1000,
    features: ['Advanced connectors', 'Scheduled triggers', 'API access', 'Email support']
  },
  pro: {
    workflows: 50,
    stepsPerWorkflow: 25,
    monthlyRuns: 10000,
    features: ['Custom code', 'Team collaboration', 'Priority support', 'Advanced analytics']
  },
  enterprise: {
    workflows: 'Unlimited',
    stepsPerWorkflow: 'Unlimited',
    monthlyRuns: 'Unlimited',
    features: ['Everything in Pro', 'Dedicated support', 'Custom integrations', 'SLA guarantee']
  }
}

export function UpgradeDialog({ open, onClose, code, detail }: UpgradeDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Focus management for accessibility
  useEffect(() => {
    if (open && closeButtonRef.current) {
      closeButtonRef.current.focus()
    }
  }, [open])

  // Handle ESC key
  useEffect(() => {
    if (!open) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  const isLimitError = code === 'PLAN_LIMIT'
  const isFeatureError = code === 'FEATURE_LOCKED'

  // Extract current plan info
  const currentPlan = (detail as any)?.planType || (detail as any)?.currentPlan || 'free'
  const currentPlanInfo = PLAN_INFO[currentPlan as keyof typeof PLAN_INFO] || PLAN_INFO.free
  const currentFeatures = PLAN_FEATURES[currentPlan as keyof typeof PLAN_FEATURES] || PLAN_FEATURES.free

  // For limit errors, calculate usage percentage
  const limitDetail = detail as LimitMeta
  const usagePercentage = limitDetail?.limit
    ? Math.min((limitDetail.used / limitDetail.limit) * 100, 100)
    : 100

  // For feature errors, determine required plan
  const featureDetail = detail as FeatureMeta
  const requiredPlan = featureDetail?.requiredPlan || 'starter'
  const requiredPlanInfo = PLAN_INFO[requiredPlan as keyof typeof PLAN_INFO] || PLAN_INFO.starter

  const handleUpgrade = () => {
    // Navigate to billing/plans page
    window.open('/app/settings/plan', '_blank')
    onClose()
  }

  const getDialogTitle = () => {
    if (isLimitError) {
      return 'Usage Limit Reached'
    }
    return 'Feature Not Available'
  }

  const getDialogDescription = () => {
    if (isLimitError) {
      return `You've reached your ${currentPlanInfo.name} plan limit. Upgrade to continue using this feature.`
    }
    return `This feature requires a ${requiredPlanInfo.name} plan or higher. Upgrade to unlock advanced capabilities.`
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isLimitError ? (
              <div className="flex items-center gap-2 text-amber-600">
                <TrendingUp className="w-5 h-5" />
                {getDialogTitle()}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-blue-600">
                <Crown className="w-5 h-5" />
                {getDialogTitle()}
              </div>
            )}
          </DialogTitle>
          <DialogDescription className="text-base">
            {getDialogDescription()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current usage display for limit errors */}
          {isLimitError && limitDetail && (
            <Alert>
              <TrendingUp className="w-4 h-4" />
              <AlertDescription>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="font-medium">Current Usage</span>
                      <span>{limitDetail.used} of {limitDetail.limit}</span>
                    </div>
                    <Progress value={usagePercentage} className="h-2" />
                  </div>
                  <div className="text-sm text-gray-600">
                    You're using {limitDetail.used} out of {limitDetail.limit} allowed in your {currentPlanInfo.name} plan.
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Feature info for feature errors */}
          {isFeatureError && featureDetail && (
            <Alert>
              <Crown className="w-4 h-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div className="font-medium">{featureDetail.feature}</div>
                  <div className="text-sm text-gray-600">
                    This feature is available starting with the {requiredPlanInfo.name} plan.
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Current plan info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Current Plan: {currentPlanInfo.name}</span>
                <Badge variant="outline" className={currentPlanInfo.color}>
                  {currentPlanInfo.icon}
                  <span className="ml-1">{currentPlanInfo.price}/month</span>
                </Badge>
              </CardTitle>
              <CardDescription>
                Your current plan includes:
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Limits</h4>
                  <ul className="space-y-1 text-sm text-gray-600">
                    <li>• {currentFeatures.workflows} workflows</li>
                    <li>• {currentFeatures.stepsPerWorkflow} steps per workflow</li>
                    <li>• {currentFeatures.monthlyRuns} monthly runs</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Features</h4>
                  <ul className="space-y-1 text-sm text-gray-600">
                    {currentFeatures.features.map((feature, index) => (
                      <li key={index}>• {feature}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recommended upgrade */}
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between text-blue-900">
                <span>Recommended: {requiredPlanInfo.name} Plan</span>
                <Badge className="bg-blue-100 text-blue-700">
                  {requiredPlanInfo.icon}
                  <span className="ml-1">{requiredPlanInfo.price}/month</span>
                </Badge>
              </CardTitle>
              <CardDescription className="text-blue-800">
                Unlock the features you need to grow your automations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-blue-900 mb-2">Higher Limits</h4>
                  <ul className="space-y-1 text-sm text-blue-800">
                    <li className="flex items-center gap-2">
                      <Check className="w-3 h-3 text-green-600" />
                      {PLAN_FEATURES[requiredPlan as keyof typeof PLAN_FEATURES]?.workflows} workflows
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3 h-3 text-green-600" />
                      {PLAN_FEATURES[requiredPlan as keyof typeof PLAN_FEATURES]?.stepsPerWorkflow} steps per workflow
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3 h-3 text-green-600" />
                      {PLAN_FEATURES[requiredPlan as keyof typeof PLAN_FEATURES]?.monthlyRuns} monthly runs
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-blue-900 mb-2">Additional Features</h4>
                  <ul className="space-y-1 text-sm text-blue-800">
                    {PLAN_FEATURES[requiredPlan as keyof typeof PLAN_FEATURES]?.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <Check className="w-3 h-3 text-green-600" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            ref={closeButtonRef}
            variant="outline"
            onClick={onClose}
            className="flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Maybe Later
          </Button>

          <Button
            onClick={handleUpgrade}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
          >
            Upgrade Now
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Additional info */}
        <div className="text-center text-xs text-gray-500 pt-2 border-t">
          Cancel anytime • 30-day money-back guarantee • No setup fees
        </div>
      </DialogContent>
    </Dialog>
  )
}