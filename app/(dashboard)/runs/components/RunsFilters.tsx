"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Filter, X, Search } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import {
  useRunsFilters,
  useRunsFiltersActions,
  useRunsFiltersState,
  useRunsFiltersSync,
  formatFiltersForDisplay,
  type RunStatus,
} from "@/stores/runs"

export function RunsFilters() {
  const filters = useRunsFilters((state) => state.filters)
  const actions = useRunsFiltersActions()
  const { hasActiveFilters, filterCount } = useRunsFiltersState()
  const { syncToURL, syncFromURL } = useRunsFiltersSync()

  const [searchInput, setSearchInput] = useState(filters.search || "")
  const [fromDate, setFromDate] = useState<Date | undefined>(
    filters.dateFrom ? new Date(filters.dateFrom) : undefined
  )
  const [toDate, setToDate] = useState<Date | undefined>(
    filters.dateTo ? new Date(filters.dateTo) : undefined
  )

  useEffect(() => {
    syncFromURL()
  }, [syncFromURL])

  useEffect(() => {
    syncToURL()
  }, [filters, syncToURL])

  const handleStatusChange = (value: string) => {
    const status = value === "all" ? "all" : (value as RunStatus)
    actions.setStatus(status)
  }

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
  }

  const handleSearchSubmit = () => {
    actions.setSearch(searchInput.trim() || undefined)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearchSubmit()
    }
  }

  const handleDateRangeChange = (from?: Date, to?: Date) => {
    setFromDate(from)
    setToDate(to)
    actions.setDateRange(
      from ? format(from, "yyyy-MM-dd") : undefined,
      to ? format(to, "yyyy-MM-dd") : undefined
    )
  }

  const handleReset = () => {
    actions.reset()
    setSearchInput("")
    setFromDate(undefined)
    setToDate(undefined)
  }

  const removeFilter = (filterType: string) => {
    switch (filterType) {
      case "status":
        actions.setStatus("all")
        break
      case "dateRange":
        setFromDate(undefined)
        setToDate(undefined)
        actions.setDateRange(undefined, undefined)
        break
      case "search":
        setSearchInput("")
        actions.setSearch(undefined)
        break
    }
  }

  const activeFilterLabels = formatFiltersForDisplay(filters)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
              {filterCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {filterCount}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Filter and search automation runs
            </CardDescription>
          </div>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={handleReset}>
              <X className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Active Filters Display */}
        {activeFilterLabels.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Active Filters</Label>
            <div className="flex flex-wrap gap-2">
              {filters.status && filters.status !== "all" && (
                <Badge
                  variant="secondary"
                  className="gap-1 cursor-pointer hover:bg-secondary/80"
                  onClick={() => removeFilter("status")}
                >
                  Status: {filters.status}
                  <X className="h-3 w-3" />
                </Badge>
              )}
              {(filters.dateFrom || filters.dateTo) && (
                <Badge
                  variant="secondary"
                  className="gap-1 cursor-pointer hover:bg-secondary/80"
                  onClick={() => removeFilter("dateRange")}
                >
                  {filters.dateFrom && filters.dateTo
                    ? `${filters.dateFrom} to ${filters.dateTo}`
                    : filters.dateFrom
                    ? `From ${filters.dateFrom}`
                    : `Until ${filters.dateTo}`}
                  <X className="h-3 w-3" />
                </Badge>
              )}
              {filters.search && (
                <Badge
                  variant="secondary"
                  className="gap-1 cursor-pointer hover:bg-secondary/80"
                  onClick={() => removeFilter("search")}
                >
                  Search: "{filters.search}"
                  <X className="h-3 w-3" />
                </Badge>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Status Filter */}
          <div className="space-y-2">
            <Label htmlFor="status-filter">Status</Label>
            <Select value={filters.status || "all"} onValueChange={handleStatusChange}>
              <SelectTrigger id="status-filter">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="ok">Successful</SelectItem>
                <SelectItem value="error">Failed</SelectItem>
                <SelectItem value="running">Running</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Search Filter */}
          <div className="space-y-2">
            <Label htmlFor="search-filter">Search</Label>
            <div className="flex gap-2">
              <Input
                id="search-filter"
                placeholder="Search automation names..."
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleSearchSubmit}
                disabled={searchInput.trim() === filters.search}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Date Range Filter */}
          <div className="space-y-2">
            <Label>Date Range</Label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "flex-1 justify-start text-left font-normal",
                      !fromDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fromDate ? format(fromDate, "MMM dd") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fromDate}
                    onSelect={(date) => handleDateRangeChange(date, toDate)}
                    initialFocus
                    disabled={(date) => {
                      if (date > new Date()) return true
                      if (toDate && date > toDate) return true
                      return false
                    }}
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "flex-1 justify-start text-left font-normal",
                      !toDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {toDate ? format(toDate, "MMM dd") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={toDate}
                    onSelect={(date) => handleDateRangeChange(fromDate, date)}
                    initialFocus
                    disabled={(date) => {
                      if (date > new Date()) return true
                      if (fromDate && date < fromDate) return true
                      return false
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}