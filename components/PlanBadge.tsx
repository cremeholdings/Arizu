"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { PlanKey, PLAN_INFO, getUsagePercentage, isUsageNearLimit } from "@/lib/plans"
import { cn } from "@/lib/utils"

export interface PlanBadgeProps {
  plan: PlanKey
  monthlyRunsUsed?: number
  monthlyRunsLimit?: number
  className?: string
  showUsage?: boolean
  size?: "sm" | "md" | "lg"
}

const planColors: Record<PlanKey, string> = {
  FREE: "bg-gray-100 text-gray-800 border-gray-300",
  PRO: "bg-blue-100 text-blue-800 border-blue-300",
  TEAM: "bg-purple-100 text-purple-800 border-purple-300",
  ENTERPRISE: "bg-amber-100 text-amber-800 border-amber-300",
}

const sizeClasses = {
  sm: "text-xs px-2 py-1",
  md: "text-sm px-3 py-1",
  lg: "text-base px-4 py-2",
}

export function PlanBadge({
  plan,
  monthlyRunsUsed = 0,
  monthlyRunsLimit = 0,
  className,
  showUsage = false,
  size = "md",
}: PlanBadgeProps) {
  const planInfo = PLAN_INFO[plan]
  const usagePercentage = getUsagePercentage(monthlyRunsUsed, monthlyRunsLimit)
  const isNearLimit = isUsageNearLimit(monthlyRunsUsed, monthlyRunsLimit)

  const badgeContent = (
    <div className={cn("flex items-center gap-2", className)}>
      <Badge
        variant="outline"
        className={cn(
          planColors[plan],
          sizeClasses[size],
          "font-medium border"
        )}
      >
        {planInfo.name}
      </Badge>

      {showUsage && monthlyRunsLimit > 0 && (
        <div className="flex items-center gap-2 min-w-0">
          <div className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground">
            <span>{monthlyRunsUsed.toLocaleString()}</span>
            <span>/</span>
            <span>{monthlyRunsLimit.toLocaleString()}</span>
          </div>
          <div className="w-16 sm:w-20">
            <Progress
              value={usagePercentage}
              className={cn(
                "h-2",
                isNearLimit && "bg-red-100"
              )}
              indicatorClassName={cn(
                isNearLimit && "bg-red-500"
              )}
              aria-label={`Usage: ${usagePercentage}%`}
            />
          </div>
        </div>
      )}
    </div>
  )

  if (!showUsage || monthlyRunsLimit === 0) {
    return badgeContent
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help">
            {badgeContent}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-sm">
          <div className="space-y-2">
            <div className="font-medium">{planInfo.name} Plan</div>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span>Monthly Runs:</span>
                <span className={cn(isNearLimit && "text-red-500 font-medium")}>
                  {monthlyRunsUsed.toLocaleString()} / {monthlyRunsLimit.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Usage:</span>
                <span className={cn(isNearLimit && "text-red-500 font-medium")}>
                  {usagePercentage}%
                </span>
              </div>
              {isNearLimit && (
                <div className="text-red-500 text-xs font-medium mt-2">
                  ⚠️ Approaching limit
                </div>
              )}
            </div>
            <div className="text-xs text-muted-foreground border-t pt-2">
              Plan Features:
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>Up to {planInfo.limits.workflows} workflows</li>
                <li>Up to {planInfo.limits.actionsAllowed} actions per workflow</li>
                <li>{planInfo.limits.monthlyRuns.toLocaleString()} monthly runs</li>
                {planInfo.limits.codeSteps && <li>Code steps included</li>}
              </ul>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}