import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"

export type RunStatus = "all" | "ok" | "error" | "running"

export interface RunsFilters {
  status?: RunStatus
  dateFrom?: string // ISO date string
  dateTo?: string // ISO date string
  search?: string
  automationId?: string
}

interface RunsFiltersStore {
  filters: RunsFilters

  // Actions
  setStatus: (status: RunStatus | undefined) => void
  setDateRange: (from?: string, to?: string) => void
  setSearch: (search: string | undefined) => void
  setAutomationId: (automationId: string | undefined) => void
  setFilters: (filters: Partial<RunsFilters>) => void
  reset: () => void

  // Computed
  hasActiveFilters: () => boolean
  getFilterCount: () => number
  toURLSearchParams: () => URLSearchParams
  fromURLSearchParams: (params: URLSearchParams) => void
}

const DEFAULT_FILTERS: RunsFilters = {
  status: "all",
  dateFrom: undefined,
  dateTo: undefined,
  search: undefined,
  automationId: undefined,
}

export const useRunsFilters = create<RunsFiltersStore>()(
  subscribeWithSelector((set, get) => ({
    filters: DEFAULT_FILTERS,

    setStatus: (status) => {
      set((state) => ({
        filters: { ...state.filters, status }
      }))
    },

    setDateRange: (dateFrom, dateTo) => {
      set((state) => ({
        filters: { ...state.filters, dateFrom, dateTo }
      }))
    },

    setSearch: (search) => {
      set((state) => ({
        filters: {
          ...state.filters,
          search: search?.trim() || undefined
        }
      }))
    },

    setAutomationId: (automationId) => {
      set((state) => ({
        filters: { ...state.filters, automationId }
      }))
    },

    setFilters: (newFilters) => {
      set((state) => ({
        filters: { ...state.filters, ...newFilters }
      }))
    },

    reset: () => {
      set({ filters: DEFAULT_FILTERS })
    },

    hasActiveFilters: () => {
      const { filters } = get()
      return (
        filters.status !== "all" ||
        !!filters.dateFrom ||
        !!filters.dateTo ||
        !!filters.search ||
        !!filters.automationId
      )
    },

    getFilterCount: () => {
      const { filters } = get()
      let count = 0

      if (filters.status && filters.status !== "all") count++
      if (filters.dateFrom || filters.dateTo) count++
      if (filters.search) count++
      if (filters.automationId) count++

      return count
    },

    toURLSearchParams: () => {
      const { filters } = get()
      const params = new URLSearchParams()

      if (filters.status && filters.status !== "all") {
        params.set("status", filters.status)
      }
      if (filters.dateFrom) {
        params.set("from", filters.dateFrom)
      }
      if (filters.dateTo) {
        params.set("to", filters.dateTo)
      }
      if (filters.search) {
        params.set("q", filters.search)
      }
      if (filters.automationId) {
        params.set("automation", filters.automationId)
      }

      return params
    },

    fromURLSearchParams: (params) => {
      const filters: RunsFilters = {}

      const status = params.get("status") as RunStatus
      if (status && ["all", "ok", "error", "running"].includes(status)) {
        filters.status = status
      }

      const dateFrom = params.get("from")
      if (dateFrom) {
        filters.dateFrom = dateFrom
      }

      const dateTo = params.get("to")
      if (dateTo) {
        filters.dateTo = dateTo
      }

      const search = params.get("q")
      if (search) {
        filters.search = search
      }

      const automationId = params.get("automation")
      if (automationId) {
        filters.automationId = automationId
      }

      set((state) => ({
        filters: { ...state.filters, ...filters }
      }))
    },
  }))
)

// Derived selectors for easier access
export const useRunsFiltersStatus = () => useRunsFilters(state => state.filters.status)
export const useRunsFiltersDateRange = () => useRunsFilters(state => ({
  from: state.filters.dateFrom,
  to: state.filters.dateTo
}))
export const useRunsFiltersSearch = () => useRunsFilters(state => state.filters.search)
export const useRunsFiltersAutomationId = () => useRunsFilters(state => state.filters.automationId)
export const useRunsFiltersActions = () => useRunsFilters(state => ({
  setStatus: state.setStatus,
  setDateRange: state.setDateRange,
  setSearch: state.setSearch,
  setAutomationId: state.setAutomationId,
  setFilters: state.setFilters,
  reset: state.reset,
}))
export const useRunsFiltersState = () => useRunsFilters(state => ({
  hasActiveFilters: state.hasActiveFilters(),
  filterCount: state.getFilterCount(),
  toURLSearchParams: state.toURLSearchParams,
  fromURLSearchParams: state.fromURLSearchParams,
}))

// Hook for syncing with URL
export function useRunsFiltersSync() {
  const { toURLSearchParams, fromURLSearchParams } = useRunsFiltersState()

  const syncToURL = () => {
    const params = toURLSearchParams()
    const url = new URL(window.location.href)

    // Clear existing filter params
    url.searchParams.delete("status")
    url.searchParams.delete("from")
    url.searchParams.delete("to")
    url.searchParams.delete("q")
    url.searchParams.delete("automation")

    // Add current filter params
    params.forEach((value, key) => {
      url.searchParams.set(key, value)
    })

    window.history.replaceState({}, "", url.toString())
  }

  const syncFromURL = () => {
    const params = new URLSearchParams(window.location.search)
    fromURLSearchParams(params)
  }

  return { syncToURL, syncFromURL }
}

// Helper to format filters for display
export function formatFiltersForDisplay(filters: RunsFilters): string[] {
  const labels: string[] = []

  if (filters.status && filters.status !== "all") {
    const statusLabels = {
      ok: "Successful",
      error: "Failed",
      running: "Running"
    }
    labels.push(statusLabels[filters.status] || filters.status)
  }

  if (filters.dateFrom || filters.dateTo) {
    if (filters.dateFrom && filters.dateTo) {
      labels.push(`${filters.dateFrom} to ${filters.dateTo}`)
    } else if (filters.dateFrom) {
      labels.push(`From ${filters.dateFrom}`)
    } else if (filters.dateTo) {
      labels.push(`Until ${filters.dateTo}`)
    }
  }

  if (filters.search) {
    labels.push(`Search: "${filters.search}"`)
  }

  if (filters.automationId) {
    labels.push(`Automation: ${filters.automationId}`)
  }

  return labels
}

// Validation helpers
export function isValidDateRange(from?: string, to?: string): boolean {
  if (!from && !to) return true
  if (!from || !to) return true

  const fromDate = new Date(from)
  const toDate = new Date(to)

  return fromDate <= toDate
}

export function isValidStatus(status?: string): status is RunStatus {
  return !status || ["all", "ok", "error", "running"].includes(status)
}