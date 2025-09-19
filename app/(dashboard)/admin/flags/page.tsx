import { auth } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { listFlags, getOrgOverrides, setOrgOverride, removeOverride } from "@/lib/flags"
import { Search, Settings, Flag, Eye, EyeOff, Info } from "lucide-react"
import { revalidatePath } from "next/cache"

async function checkOwnerAccess(userId: string): Promise<boolean> {
  try {
    const membership = await db.organizationMember.findFirst({
      where: {
        userId,
        role: "owner",
      },
    })

    return !!membership
  } catch (error) {
    console.error("Error checking owner access", {
      userId: userId.slice(0, 8) + "...",
      error: error instanceof Error ? error.message : "Unknown error",
    })

    return false
  }
}

async function getOrganizations() {
  try {
    return await db.organization.findMany({
      select: {
        clerkId: true,
        name: true,
        slug: true,
        planType: true,
      },
      orderBy: { name: "asc" },
    })
  } catch (error) {
    console.error("Error fetching organizations", {
      error: error instanceof Error ? error.message : "Unknown error",
    })

    return []
  }
}

async function toggleOrgFlag(
  flagKey: string,
  orgId: string,
  enabled: boolean
) {
  "use server"

  const { userId } = auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  // Check if user is an owner
  const isOwner = await checkOwnerAccess(userId)
  if (!isOwner) {
    throw new Error("Access denied. Owner role required.")
  }

  try {
    if (enabled) {
      await setOrgOverride(flagKey, orgId, true)
    } else {
      await removeOverride(flagKey, orgId)
    }

    revalidatePath("/admin/flags")
  } catch (error) {
    console.error("Error toggling organization flag", {
      flagKey,
      orgId: orgId.slice(0, 8) + "...",
      enabled,
      error: error instanceof Error ? error.message : "Unknown error",
    })

    throw new Error("Failed to update flag override")
  }
}

interface FlagDisplayProps {
  flagKey: string
  description?: string
  defaultOn: boolean
  orgOverrides: Record<string, boolean>
  organizations: Array<{
    clerkId: string
    name: string
    slug: string
    planType: string
  }>
}

function FlagDisplay({
  flagKey,
  description,
  defaultOn,
  orgOverrides,
  organizations
}: FlagDisplayProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-lg font-medium">{flagKey}</CardTitle>
            <Badge variant={defaultOn ? "default" : "secondary"}>
              Default: {defaultOn ? "ON" : "OFF"}
            </Badge>
          </div>
        </div>
        {description && (
          <CardDescription className="flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            {description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Organization Overrides</Label>
            <div className="mt-2 space-y-2">
              {organizations.map((org) => {
                const hasOverride = orgOverrides[org.clerkId] !== undefined
                const isEnabled = orgOverrides[org.clerkId] ?? defaultOn

                return (
                  <div
                    key={org.clerkId}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium">{org.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {org.slug} · {org.planType}
                        </p>
                      </div>
                      {hasOverride ? (
                        <Badge variant="outline" className="gap-1">
                          <Eye className="h-3 w-3" />
                          Override
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <EyeOff className="h-3 w-3" />
                          Default
                        </Badge>
                      )}
                    </div>

                    <form action={toggleOrgFlag.bind(null, flagKey, org.clerkId, !isEnabled)}>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={isEnabled}
                          onChange={() => {
                            // Form submission will handle the toggle
                          }}
                        />
                        <Button type="submit" variant="outline" size="sm">
                          {isEnabled ? "Disable" : "Enable"}
                        </Button>
                      </div>
                    </form>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default async function AdminFlagsPage({
  searchParams,
}: {
  searchParams: { search?: string }
}) {
  const { userId } = auth()

  if (!userId) {
    redirect("/sign-in")
  }

  // Check if user is an owner
  const isOwner = await checkOwnerAccess(userId)
  if (!isOwner) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Access Denied</h3>
              <p className="text-muted-foreground">
                You need owner privileges to access the feature flags admin panel.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Fetch data
  const [flags, organizations] = await Promise.all([
    listFlags(),
    getOrganizations(),
  ])

  // Get all organization overrides
  const allOrgOverrides = new Map<string, Record<string, boolean>>()

  for (const org of organizations) {
    const overrides = await getOrgOverrides(org.clerkId)
    const overrideMap: Record<string, boolean> = {}

    for (const override of overrides) {
      overrideMap[override.flagKey] = override.enabled
    }

    allOrgOverrides.set(org.clerkId, overrideMap)
  }

  // Convert to flag-centric structure
  const flagOverrides = new Map<string, Record<string, boolean>>()

  for (const flag of flags) {
    const orgOverrideMap: Record<string, boolean> = {}

    for (const org of organizations) {
      const orgOverrides = allOrgOverrides.get(org.clerkId) || {}
      if (flag.key in orgOverrides) {
        orgOverrideMap[org.clerkId] = orgOverrides[flag.key]
      }
    }

    flagOverrides.set(flag.key, orgOverrideMap)
  }

  // Filter flags based on search
  const searchQuery = searchParams.search?.toLowerCase() || ""
  const filteredFlags = flags.filter(
    (flag) =>
      flag.key.toLowerCase().includes(searchQuery) ||
      flag.description?.toLowerCase().includes(searchQuery)
  )

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Flag className="h-8 w-8 text-blue-500" />
            Feature Flags
          </h1>
          <p className="text-muted-foreground">
            Manage feature flags and organization overrides
          </p>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search flags by name or description..."
              defaultValue={searchQuery}
              className="flex-1"
              name="search"
            />
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Flags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{flags.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Organizations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{organizations.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Overrides</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Array.from(flagOverrides.values()).reduce(
                (total, orgOverrides) => total + Object.keys(orgOverrides).length,
                0
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Flags List */}
      <div className="space-y-6">
        {filteredFlags.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Flag className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No flags found</h3>
                <p className="text-muted-foreground">
                  {searchQuery
                    ? `No flags match "${searchQuery}"`
                    : "No feature flags are currently defined"}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredFlags.map((flag) => (
            <FlagDisplay
              key={flag.key}
              flagKey={flag.key}
              description={flag.description}
              defaultOn={flag.defaultOn}
              orgOverrides={flagOverrides.get(flag.key) || {}}
              organizations={organizations}
            />
          ))
        )}
      </div>
    </div>
  )
}