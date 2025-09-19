import { create } from "zustand"
import { persist } from "zustand/middleware"
import { PlanKey } from "@/lib/plans"

interface PlanCacheState {
  plan?: PlanKey
  monthlyRunsUsed?: number
  monthlyRunsLimit?: number
  workflowsCount?: number
  workflowsLimit?: number
  actionsLimit?: number
  hasCodeSteps?: boolean
  lastUpdated?: number
  organizationId?: string
}

interface PlanCacheActions {
  set: (data: Partial<PlanCacheState>) => void
  clear: () => void
  isStale: (maxAgeMs?: number) => boolean
  getUsagePercentage: () => number
  isNearLimit: (threshold?: number) => boolean
}

type PlanCacheStore = PlanCacheState & PlanCacheActions

const CACHE_MAX_AGE = 5 * 60 * 1000 // 5 minutes
const USAGE_WARNING_THRESHOLD = 80 // 80%

export const usePlanStore = create<PlanCacheStore>()(
  persist(
    (set, get) => ({
      // State
      plan: undefined,
      monthlyRunsUsed: undefined,
      monthlyRunsLimit: undefined,
      workflowsCount: undefined,
      workflowsLimit: undefined,
      actionsLimit: undefined,
      hasCodeSteps: undefined,
      lastUpdated: undefined,
      organizationId: undefined,

      // Actions
      set: (data) => {
        set({
          ...data,
          lastUpdated: Date.now(),
        })
      },

      clear: () => {
        set({
          plan: undefined,
          monthlyRunsUsed: undefined,
          monthlyRunsLimit: undefined,
          workflowsCount: undefined,
          workflowsLimit: undefined,
          actionsLimit: undefined,
          hasCodeSteps: undefined,
          lastUpdated: undefined,
          organizationId: undefined,
        })
      },

      isStale: (maxAgeMs = CACHE_MAX_AGE) => {
        const { lastUpdated } = get()
        if (!lastUpdated) return true
        return Date.now() - lastUpdated > maxAgeMs
      },

      getUsagePercentage: () => {
        const { monthlyRunsUsed = 0, monthlyRunsLimit = 0 } = get()
        if (monthlyRunsLimit === 0) return 0
        return Math.min(Math.round((monthlyRunsUsed / monthlyRunsLimit) * 100), 100)
      },

      isNearLimit: (threshold = USAGE_WARNING_THRESHOLD) => {
        return get().getUsagePercentage() >= threshold
      },
    }),
    {
      name: "arizu-plan-cache",
      storage: {
        getItem: (name) => {
          try {
            const str = localStorage.getItem(name)
            if (!str) return null
            return JSON.parse(str)
          } catch (error) {
            console.warn("Failed to read plan cache from localStorage:", error)
            return null
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value))
          } catch (error) {
            console.warn("Failed to write plan cache to localStorage:", error)
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name)
          } catch (error) {
            console.warn("Failed to remove plan cache from localStorage:", error)
          }
        },
      },
      // Only persist non-sensitive plan metadata
      partialize: (state) => ({
        plan: state.plan,
        monthlyRunsUsed: state.monthlyRunsUsed,
        monthlyRunsLimit: state.monthlyRunsLimit,
        workflowsCount: state.workflowsCount,
        workflowsLimit: state.workflowsLimit,
        actionsLimit: state.actionsLimit,
        hasCodeSteps: state.hasCodeSteps,
        lastUpdated: state.lastUpdated,
        organizationId: state.organizationId,
      }),
    }
  )
)

// Utility hooks for common patterns
export function usePlanData() {
  return usePlanStore((state) => ({
    plan: state.plan,
    monthlyRunsUsed: state.monthlyRunsUsed,
    monthlyRunsLimit: state.monthlyRunsLimit,
    workflowsCount: state.workflowsCount,
    workflowsLimit: state.workflowsLimit,
    actionsLimit: state.actionsLimit,
    hasCodeSteps: state.hasCodeSteps,
    lastUpdated: state.lastUpdated,
    organizationId: state.organizationId,
  }))
}

export function usePlanUsage() {
  return usePlanStore((state) => ({
    monthlyRunsUsed: state.monthlyRunsUsed || 0,
    monthlyRunsLimit: state.monthlyRunsLimit || 0,
    usagePercentage: state.getUsagePercentage(),
    isNearLimit: state.isNearLimit(),
    isStale: state.isStale(),
  }))
}

export function usePlanLimits() {
  return usePlanStore((state) => ({
    workflowsCount: state.workflowsCount || 0,
    workflowsLimit: state.workflowsLimit || 0,
    actionsLimit: state.actionsLimit || 0,
    hasCodeSteps: state.hasCodeSteps || false,
  }))
}

export function usePlanActions() {
  return usePlanStore((state) => ({
    set: state.set,
    clear: state.clear,
    isStale: state.isStale,
  }))
}

// Helper to check if cache should be refreshed for a specific org
export function useShouldRefreshPlan(currentOrgId?: string) {
  return usePlanStore((state) => {
    if (!currentOrgId) return true
    if (state.organizationId !== currentOrgId) return true
    return state.isStale()
  })
}