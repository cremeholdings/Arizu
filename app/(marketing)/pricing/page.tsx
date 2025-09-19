import { auth } from "@clerk/nextjs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check } from "lucide-react"
import { PLAN_INFO, type PlanKey } from "@/lib/plans"
import { getPlanForOrg } from "@/lib/plans"
import Link from "next/link"

interface PricingTierProps {
  plan: typeof PLAN_INFO[PlanKey]
  isCurrentPlan?: boolean
}

function PricingTier({ plan, isCurrentPlan }: PricingTierProps) {
  const formatPrice = (price: number) => {
    return price === 0 ? "Free" : `$${price}`
  }

  const getCtaButton = () => {
    if (plan.key === "FREE") {
      return (
        <Button asChild size="lg" className="w-full">
          <Link href="/sign-up">Start Free</Link>
        </Button>
      )
    }

    if (plan.key === "ENTERPRISE") {
      return (
        <Button asChild variant="outline" size="lg" className="w-full">
          <a href="mailto:sales@arizu.com?subject=Enterprise Plan Inquiry">
            Contact Sales
          </a>
        </Button>
      )
    }

    return (
      <Button asChild size="lg" className="w-full">
        <Link href="/sign-up">Get Started</Link>
      </Button>
    )
  }

  const getFeatureDisplay = (featureKey: string) => {
    const featureLabels: Record<string, string> = {
      basic_automations: "Basic automations",
      advanced_triggers: "Advanced triggers",
      webhooks: "Webhooks",
      email_notifications: "Email notifications",
      slack_integration: "Slack integration",
      team_collaboration: "Team collaboration",
      user_management: "User management",
      code_steps: "Code steps",
      custom_integrations: "Custom integrations",
      sso: "Single Sign-On (SSO)",
      audit_logs: "Audit logs",
      community_support: "Community support",
      priority_support: "Priority support",
      dedicated_support: "Dedicated support",
      analytics_basic: "Basic analytics",
      analytics_advanced: "Advanced analytics",
      analytics_enterprise: "Enterprise analytics",
      custom_branding: "Custom branding",
      sla_guarantee: "SLA guarantee"
    }

    return featureLabels[featureKey] || featureKey
  }

  return (
    <Card className={`relative h-full ${plan.popular ? "border-primary shadow-lg scale-105" : ""}`}>
      {plan.popular && (
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
          <Badge variant="default" className="px-3 py-1">
            Most Popular
          </Badge>
        </div>
      )}

      <CardHeader className="text-center pb-8">
        <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>
        <CardDescription className="text-base">{plan.description}</CardDescription>

        <div className="pt-4">
          <div className="text-4xl font-bold">
            {formatPrice(plan.price.monthly)}
            {plan.price.monthly > 0 && <span className="text-lg font-normal text-muted-foreground">/mo</span>}
          </div>
          {plan.price.yearly > 0 && (
            <div className="text-sm text-muted-foreground mt-1">
              or {formatPrice(plan.price.yearly)}/year (save 2 months)
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium">Monthly runs</span>
              <span className="text-sm font-bold">
                {plan.limits.monthlyRuns.toLocaleString()}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm font-medium">Workflows</span>
              <span className="text-sm font-bold">
                {plan.limits.workflows}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm font-medium">Actions allowed</span>
              <span className="text-sm font-bold">
                {plan.limits.actionsAllowed}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm font-medium">Code steps</span>
              <span className="text-sm font-bold">
                {plan.limits.codeSteps ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-medium text-sm">Features included:</h4>
          <ul className="space-y-2">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-green-600 shrink-0" />
                <span>{getFeatureDisplay(feature)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-4">
          {isCurrentPlan ? (
            <div className="space-y-2">
              <Button variant="outline" size="lg" className="w-full" disabled>
                Current Plan
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                <Link href="/app/settings/plan" className="hover:underline">
                  Manage your plan
                </Link>
              </p>
            </div>
          ) : (
            getCtaButton()
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default async function PricingPage() {
  const { userId, orgId } = auth()

  let currentPlan: PlanKey | null = null
  if (userId && orgId) {
    try {
      currentPlan = await getPlanForOrg(orgId)
    } catch (error) {
      console.error("Error fetching user plan:", error)
    }
  }

  const planOrder: PlanKey[] = ["FREE", "PRO", "TEAM", "ENTERPRISE"]

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choose the perfect plan for your automation needs. Start free and scale as you grow.
          </p>

          {currentPlan && (
            <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg max-w-md mx-auto">
              <p className="text-sm text-blue-800">
                You're currently on the <span className="font-semibold">{PLAN_INFO[currentPlan].name}</span> plan.{" "}
                <Link href="/app/settings/plan" className="underline hover:no-underline">
                  Manage your plan
                </Link>
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
          {planOrder.map((planKey) => {
            const plan = PLAN_INFO[planKey]
            return (
              <PricingTier
                key={planKey}
                plan={plan}
                isCurrentPlan={currentPlan === planKey}
              />
            )
          })}
        </div>

        <div className="mt-16 text-center">
          <h2 className="text-2xl font-bold mb-4">Frequently Asked Questions</h2>
          <div className="max-w-3xl mx-auto space-y-6 text-left">
            <div>
              <h3 className="font-semibold mb-2">What counts as a "run"?</h3>
              <p className="text-muted-foreground">
                A run is a single execution of an automation workflow. This includes both manual triggers and automatic triggers from webhooks or schedules.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Can I change my plan anytime?</h3>
              <p className="text-muted-foreground">
                Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately, and we'll prorate any charges.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">What happens if I exceed my limits?</h3>
              <p className="text-muted-foreground">
                We'll notify you when you're approaching your limits. If you exceed them, your automations will pause until you upgrade or the next billing cycle begins.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}