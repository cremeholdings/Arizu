import { auth } from "@clerk/nextjs"
import { db } from "@/lib/db"
import { RunStatus } from "@prisma/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getRunStatistics } from "@/middleware/runLimiter"
import { getLogStatistics } from "@/lib/runs/logs"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { Play, CheckCircle, XCircle, Clock, Activity, TrendingUp, AlertTriangle } from "lucide-react"
import { RunsFilters } from "./components/RunsFilters"

interface RunWithAutomation {
  id: string
  status: RunStatus
  startedAt: Date
  completedAt: Date | null
  errorMessage: string | null
  automation: {
    id: string
    name: string
  } | null
  user: {
    id: string
    firstName: string | null
    lastName: string | null
  } | null
}

async function getRecentRuns(orgId: string, limit = 50): Promise<RunWithAutomation[]> {
  try {
    return await db.automationRun.findMany({
      where: {
        organizationId: orgId,
      },
      include: {
        automation: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        startedAt: "desc",
      },
      take: limit,
    })
  } catch (error) {
    console.error("Error fetching recent runs", {
      orgId: orgId.slice(0, 8) + "...",
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return []
  }
}

function getStatusIcon(status: RunStatus) {
  switch (status) {
    case RunStatus.RUNNING:
    case RunStatus.PENDING:
      return <Clock className="h-4 w-4 text-blue-500" />
    case RunStatus.SUCCESS:
      return <CheckCircle className="h-4 w-4 text-green-500" />
    case RunStatus.FAILED:
      return <XCircle className="h-4 w-4 text-red-500" />
    case RunStatus.CANCELLED:
      return <XCircle className="h-4 w-4 text-gray-500" />
    default:
      return <Clock className="h-4 w-4 text-gray-500" />
  }
}

function getStatusBadge(status: RunStatus) {
  switch (status) {
    case RunStatus.RUNNING:
      return <Badge variant="default" className="bg-blue-100 text-blue-800">Running</Badge>
    case RunStatus.PENDING:
      return <Badge variant="default" className="bg-yellow-100 text-yellow-800">Pending</Badge>
    case RunStatus.SUCCESS:
      return <Badge variant="default" className="bg-green-100 text-green-800">Success</Badge>
    case RunStatus.FAILED:
      return <Badge variant="destructive">Failed</Badge>
    case RunStatus.CANCELLED:
      return <Badge variant="secondary">Cancelled</Badge>
    default:
      return <Badge variant="secondary">Unknown</Badge>
  }
}

function formatExecutionTime(start: Date, end: Date | null): string {
  if (!end) return "Running..."

  const diff = end.getTime() - start.getTime()
  const seconds = Math.round(diff / 1000)

  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  return `${minutes}m ${remainingSeconds}s`
}

function getUserDisplayName(user: { firstName: string | null; lastName: string | null } | null): string {
  if (!user) return "System"

  const firstName = user.firstName || ""
  const lastName = user.lastName || ""

  if (firstName && lastName) return `${firstName} ${lastName}`
  if (firstName) return firstName
  if (lastName) return lastName

  return "Unknown User"
}

export default async function RunsPage() {
  const { userId, orgId } = auth()

  if (!userId || !orgId) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Please sign in to view automation runs.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Fetch data in parallel
  const [runs, runStats, logStats] = await Promise.all([
    getRecentRuns(orgId),
    getRunStatistics(orgId, 30),
    getLogStatistics(orgId),
  ])

  const runningCount = runs.filter(run => run.status === RunStatus.RUNNING || run.status === RunStatus.PENDING).length
  const successRate = runStats.totalRuns > 0
    ? Math.round((runStats.successfulRuns / runStats.totalRuns) * 100)
    : 0

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Automation Runs</h1>
          <p className="text-muted-foreground">
            Monitor and track your automation executions
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={"/automation" as any}>
              <Play className="h-4 w-4 mr-2" />
              New Automation
            </Link>
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Runs (30d)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{runStats.totalRuns.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {runningCount > 0 && `${runningCount} currently running`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate}%</div>
            <p className="text-xs text-muted-foreground">
              {runStats.successfulRuns} of {runStats.totalRuns} successful
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Execution Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {runStats.averageExecutionTime > 0
                ? `${Math.round(runStats.averageExecutionTime / 1000)}s`
                : "N/A"
              }
            </div>
            <p className="text-xs text-muted-foreground">
              Across all completed runs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {runStats.totalRuns > 0
                ? Math.round((runStats.failedRuns / runStats.totalRuns) * 100)
                : 0
              }%
            </div>
            <p className="text-xs text-muted-foreground">
              {runStats.failedRuns} failed runs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Most Active Automations */}
      {runStats.mostActiveAutomations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Most Active Automations</CardTitle>
            <CardDescription>Top automations by run count in the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {runStats.mostActiveAutomations.map((automation, index) => (
                <div key={automation.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{automation.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {automation.runCount} runs
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/automation/${automation.id}` as any}>
                      View
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <RunsFilters />

      {/* Recent Runs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Runs</CardTitle>
          <CardDescription>
            Latest automation executions from your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No runs yet</h3>
              <p className="text-muted-foreground mb-4">
                Your automation runs will appear here once they start executing.
              </p>
              <Button asChild>
                <Link href={"/automation" as any}>
                  Create Your First Automation
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {getStatusIcon(run.status)}

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">
                          {run.automation?.name || "Unknown Automation"}
                        </h4>
                        {getStatusBadge(run.status)}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>
                          Started {formatDistanceToNow(run.startedAt, { addSuffix: true })}
                        </span>

                        <span>
                          Duration: {formatExecutionTime(run.startedAt, run.completedAt)}
                        </span>

                        <span>
                          By {getUserDisplayName(run.user)}
                        </span>
                      </div>

                      {run.errorMessage && (
                        <p className="text-sm text-red-600 bg-red-50 px-2 py-1 rounded">
                          {run.errorMessage}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/runs/${run.id}` as any}>
                        View Details
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}

              {runs.length >= 50 && (
                <div className="text-center pt-4">
                  <Button variant="outline">
                    Load More Runs
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}