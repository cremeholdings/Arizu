import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PlanBadge } from "@/components/PlanBadge"
import { requireOrgRole } from "@/lib/authz"
import { getCurrentUsage, getPlanForOrg, PLAN_INFO, getNextPlan, PlanKey } from "@/lib/plans"
import { ExternalLink, TrendingUp, Users, Zap, Code2, Shield } from "lucide-react"

interface PlanPageContentProps {
  orgId: string
}

async function PlanPageContent({ orgId }: PlanPageContentProps) {
  try {
    const [plan, usage] = await Promise.all([
      getPlanForOrg(orgId),
      getCurrentUsage(orgId),
    ])

    const planInfo = PLAN_INFO[plan]
    const nextPlan = getNextPlan(plan)
    const nextPlanInfo = nextPlan ? PLAN_INFO[nextPlan] : null

    return (
      <div className="space-y-6">
        {/* Current Plan Overview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-3">
                  Current Plan
                  <PlanBadge
                    plan={plan}
                    monthlyRunsUsed={usage.monthlyRunsUsed}
                    monthlyRunsLimit={usage.monthlyRunsLimit}
                    showUsage={true}
                  />
                </CardTitle>
                <CardDescription>
                  {planInfo.description}
                </CardDescription>
              </div>
              {nextPlanInfo && (
                <Button size="lg" className="gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Upgrade to {nextPlanInfo.name}
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Usage Stats */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Usage This Month
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Automation Runs</span>
                    <span className="font-mono text-sm">
                      {usage.monthlyRunsUsed.toLocaleString()} / {usage.monthlyRunsLimit.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Active Workflows</span>
                    <span className="font-mono text-sm">
                      {usage.workflowsCount} / {usage.workflowsLimit}
                    </span>
                  </div>
                </div>
              </div>

              {/* Plan Limits */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Plan Limits
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                    <span>Up to {planInfo.limits.monthlyRuns.toLocaleString()} runs/month</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>Up to {planInfo.limits.workflows} workflows</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span>Up to {planInfo.limits.actionsAllowed} actions per workflow</span>
                  </div>
                  {planInfo.limits.codeSteps && (
                    <div className="flex items-center gap-2 text-sm">
                      <Code2 className="h-4 w-4 text-muted-foreground" />
                      <span>Code steps included</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Features */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Included Features
                </h4>
                <div className="space-y-2">
                  {planInfo.features.slice(0, 5).map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm">
                      <div className="h-1.5 w-1.5 bg-green-500 rounded-full" />
                      <span className="capitalize">{feature.replace(/_/g, " ")}</span>
                    </div>
                  ))}
                  {planInfo.features.length > 5 && (
                    <div className="text-xs text-muted-foreground">
                      +{planInfo.features.length - 5} more features
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upgrade Options */}
        {nextPlanInfo && (
          <Card>
            <CardHeader>
              <CardTitle>Upgrade to {nextPlanInfo.name}</CardTitle>
              <CardDescription>
                Get more automation power with {nextPlanInfo.description.toLowerCase()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium">What you'll get:</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="h-1.5 w-1.5 bg-blue-500 rounded-full" />
                      <span>{nextPlanInfo.limits.monthlyRuns.toLocaleString()} monthly runs</span>
                      <span className="text-xs text-muted-foreground">
                        (+{(nextPlanInfo.limits.monthlyRuns - planInfo.limits.monthlyRuns).toLocaleString()})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="h-1.5 w-1.5 bg-blue-500 rounded-full" />
                      <span>{nextPlanInfo.limits.workflows} workflows</span>
                      <span className="text-xs text-muted-foreground">
                        (+{nextPlanInfo.limits.workflows - planInfo.limits.workflows})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="h-1.5 w-1.5 bg-blue-500 rounded-full" />
                      <span>{nextPlanInfo.limits.actionsAllowed} actions per workflow</span>
                      <span className="text-xs text-muted-foreground">
                        (+{nextPlanInfo.limits.actionsAllowed - planInfo.limits.actionsAllowed})
                      </span>
                    </div>
                    {nextPlanInfo.limits.codeSteps && !planInfo.limits.codeSteps && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="h-1.5 w-1.5 bg-blue-500 rounded-full" />
                        <span>Code steps</span>
                        <span className="text-xs text-green-600 font-medium">NEW</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="text-right">
                    <div className="text-3xl font-bold">
                      ${nextPlanInfo.price.monthly}
                      <span className="text-base font-normal text-muted-foreground">/month</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      or ${nextPlanInfo.price.yearly}/year (save ${nextPlanInfo.price.monthly * 12 - nextPlanInfo.price.yearly})
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button size="lg" className="w-full gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Upgrade Now
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="w-full">
                      Compare All Plans
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Billing Information */}
        {plan !== "FREE" && (
          <Card>
            <CardHeader>
              <CardTitle>Billing</CardTitle>
              <CardDescription>
                Manage your subscription and billing information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    Current subscription: {planInfo.name} Plan
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Next billing date: January 1, 2024
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    Manage Billing
                  </Button>
                  <Button variant="outline" size="sm">
                    View Invoices
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    )
  } catch (error) {
    console.error("Error loading plan page:", error)

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Unable to Load Plan Information</CardTitle>
            <CardDescription>
              There was an error loading your plan details. Please try refreshing the page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline">
              Refresh Page
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
}

function PlanPageSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-4">
                <Skeleton className="h-4 w-24" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default async function PlanPage() {
  try {
    const { orgId } = await requireOrgRole("member")

    return (
      <div className="container max-w-6xl py-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Plan & Billing</h1>
            <p className="text-muted-foreground">
              Manage your subscription, view usage, and upgrade your plan.
            </p>
          </div>

          <Suspense fallback={<PlanPageSkeleton />}>
            <PlanPageContent orgId={orgId} />
          </Suspense>
        </div>
      </div>
    )
  } catch (error) {
    return (
      <div className="container max-w-6xl py-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Plan & Billing</h1>
            <p className="text-muted-foreground">
              Unable to load plan information.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Access Required</CardTitle>
              <CardDescription>
                You need to be a member of an organization to view plan information.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline">
                Join or Create Organization
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }
}