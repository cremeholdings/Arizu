import { db } from "@/lib/db"

export interface FlagContext {
  orgId?: string
  userId?: string
}

export interface FeatureFlagDefinition {
  key: string
  description?: string
  defaultOn: boolean
}

export interface FlagOverride {
  id: string
  flagKey: string
  organizationId: string | null
  userId: string | null
  enabled: boolean
  createdAt: Date
}

export interface ResolvedFlag {
  key: string
  enabled: boolean
  source: "code" | "env" | "db-org" | "db-user"
  override?: FlagOverride
}

// Known feature flags with their code defaults
const KNOWN_FLAGS: Record<string, FeatureFlagDefinition> = {
  "planner.v2": {
    key: "planner.v2",
    description: "Enable v2 planner with improved AI models and validation",
    defaultOn: false,
  },
  "compiler.safeMode": {
    key: "compiler.safeMode",
    description: "Enable safe mode compilation with additional validation checks",
    defaultOn: true,
  },
  "ui.darkMode": {
    key: "ui.darkMode",
    description: "Enable dark mode toggle in user interface",
    defaultOn: false,
  },
  "api.rateLimiting": {
    key: "api.rateLimiting",
    description: "Enable enhanced rate limiting for API endpoints",
    defaultOn: true,
  },
  "notifications.email": {
    key: "notifications.email",
    description: "Enable email notifications for workflow events",
    defaultOn: false,
  },
  "analytics.tracking": {
    key: "analytics.tracking",
    description: "Enable usage analytics and telemetry collection",
    defaultOn: false,
  },
}

function parseEnvDefaults(): Record<string, boolean> {
  const defaults: Record<string, boolean> = {}

  try {
    const envDefaults = process.env.FLAGS_DEFAULTS
    if (!envDefaults) {
      return defaults
    }

    // Parse format: "planner.v2=false,compiler.safeMode=true"
    const pairs = envDefaults.split(",")
    for (const pair of pairs) {
      const [key, value] = pair.split("=").map(s => s.trim())
      if (key && value) {
        defaults[key] = value.toLowerCase() === "true"
      }
    }
  } catch (error) {
    console.warn("Failed to parse FLAGS_DEFAULTS environment variable", {
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }

  return defaults
}

// Cache for environment defaults to avoid re-parsing
let envDefaultsCache: Record<string, boolean> | null = null

function getEnvDefaults(): Record<string, boolean> {
  if (envDefaultsCache === null) {
    envDefaultsCache = parseEnvDefaults()
  }
  return envDefaultsCache
}

export async function resolveFlag(
  flagKey: string,
  context: FlagContext = {}
): Promise<ResolvedFlag> {
  try {
    console.log("Resolving feature flag", {
      flagKey,
      orgId: context.orgId?.slice(0, 8) + "...",
      userId: context.userId?.slice(0, 8) + "...",
    })

    // 1. Check for user-specific override (highest precedence)
    if (context.userId) {
      const userOverride = await db.flagOverride.findFirst({
        where: {
          flagKey,
          userId: context.userId,
        },
      })

      if (userOverride) {
        console.log("Flag resolved from user override", {
          flagKey,
          enabled: userOverride.enabled,
          userId: context.userId.slice(0, 8) + "...",
        })

        return {
          key: flagKey,
          enabled: userOverride.enabled,
          source: "db-user",
          override: userOverride,
        }
      }
    }

    // 2. Check for organization-specific override
    if (context.orgId) {
      const orgOverride = await db.flagOverride.findFirst({
        where: {
          flagKey,
          organizationId: context.orgId,
          userId: null, // Ensure it's an org override, not a user override
        },
      })

      if (orgOverride) {
        console.log("Flag resolved from organization override", {
          flagKey,
          enabled: orgOverride.enabled,
          orgId: context.orgId.slice(0, 8) + "...",
        })

        return {
          key: flagKey,
          enabled: orgOverride.enabled,
          source: "db-org",
          override: orgOverride,
        }
      }
    }

    // 3. Check environment variable defaults
    const envDefaults = getEnvDefaults()
    if (flagKey in envDefaults) {
      console.log("Flag resolved from environment default", {
        flagKey,
        enabled: envDefaults[flagKey],
      })

      return {
        key: flagKey,
        enabled: envDefaults[flagKey],
        source: "env",
      }
    }

    // 4. Check database default (if flag is registered in DB)
    const dbFlag = await db.featureFlag.findUnique({
      where: { key: flagKey },
    })

    if (dbFlag) {
      console.log("Flag resolved from database default", {
        flagKey,
        enabled: dbFlag.defaultOn,
      })

      return {
        key: flagKey,
        enabled: dbFlag.defaultOn,
        source: "code",
      }
    }

    // 5. Fall back to code default (lowest precedence)
    const codeDefault = KNOWN_FLAGS[flagKey]?.defaultOn ?? false

    console.log("Flag resolved from code default", {
      flagKey,
      enabled: codeDefault,
      isKnownFlag: !!KNOWN_FLAGS[flagKey],
    })

    return {
      key: flagKey,
      enabled: codeDefault,
      source: "code",
    }

  } catch (error) {
    console.error("Error resolving feature flag", {
      flagKey,
      error: error instanceof Error ? error.message : "Unknown error",
    })

    // Fail-safe: return code default
    return {
      key: flagKey,
      enabled: KNOWN_FLAGS[flagKey]?.defaultOn ?? false,
      source: "code",
    }
  }
}

export async function listFlags(): Promise<FeatureFlagDefinition[]> {
  try {
    // Get flags from database
    const dbFlags = await db.featureFlag.findMany({
      orderBy: { key: "asc" },
    })

    // Convert to common format
    const dbFlagMap = new Map(
      dbFlags.map(flag => [flag.key, {
        key: flag.key,
        description: flag.description || undefined,
        defaultOn: flag.defaultOn,
      }])
    )

    // Merge with known flags, preferring database definitions
    const allFlags = new Map<string, FeatureFlagDefinition>()

    // Add known flags first
    Object.values(KNOWN_FLAGS).forEach(flag => {
      allFlags.set(flag.key, flag)
    })

    // Override with database flags
    dbFlagMap.forEach((flag, key) => {
      allFlags.set(key, flag)
    })

    return Array.from(allFlags.values()).sort((a, b) => a.key.localeCompare(b.key))

  } catch (error) {
    console.error("Error listing feature flags", {
      error: error instanceof Error ? error.message : "Unknown error",
    })

    // Fallback to known flags
    return Object.values(KNOWN_FLAGS).sort((a, b) => a.key.localeCompare(b.key))
  }
}

export async function setOrgOverride(
  flagKey: string,
  orgId: string,
  enabled: boolean
): Promise<void> {
  try {
    console.log("Setting organization flag override", {
      flagKey,
      orgId: orgId.slice(0, 8) + "...",
      enabled,
    })

    // Ensure the flag exists in the database
    await db.featureFlag.upsert({
      where: { key: flagKey },
      update: {},
      create: {
        key: flagKey,
        description: KNOWN_FLAGS[flagKey]?.description,
        defaultOn: KNOWN_FLAGS[flagKey]?.defaultOn ?? false,
      },
    })

    // Check if override exists
    const existingOverride = await db.flagOverride.findFirst({
      where: {
        flagKey,
        organizationId: orgId,
        userId: null,
      },
    })

    if (existingOverride) {
      // Update existing override
      await db.flagOverride.update({
        where: { id: existingOverride.id },
        data: { enabled },
      })
    } else {
      // Create new override
      await db.flagOverride.create({
        data: {
          flagKey,
          organizationId: orgId,
          userId: null,
          enabled,
        },
      })
    }

    console.log("Organization flag override set successfully", {
      flagKey,
      orgId: orgId.slice(0, 8) + "...",
      enabled,
    })

  } catch (error) {
    console.error("Error setting organization flag override", {
      flagKey,
      orgId: orgId.slice(0, 8) + "...",
      enabled,
      error: error instanceof Error ? error.message : "Unknown error",
    })

    throw new Error(`Failed to set organization flag override: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

export async function setUserOverride(
  flagKey: string,
  userId: string,
  enabled: boolean
): Promise<void> {
  try {
    console.log("Setting user flag override", {
      flagKey,
      userId: userId.slice(0, 8) + "...",
      enabled,
    })

    // Ensure the flag exists in the database
    await db.featureFlag.upsert({
      where: { key: flagKey },
      update: {},
      create: {
        key: flagKey,
        description: KNOWN_FLAGS[flagKey]?.description,
        defaultOn: KNOWN_FLAGS[flagKey]?.defaultOn ?? false,
      },
    })

    // Check if override exists
    const existingOverride = await db.flagOverride.findFirst({
      where: {
        flagKey,
        organizationId: null,
        userId,
      },
    })

    if (existingOverride) {
      // Update existing override
      await db.flagOverride.update({
        where: { id: existingOverride.id },
        data: { enabled },
      })
    } else {
      // Create new override
      await db.flagOverride.create({
        data: {
          flagKey,
          organizationId: null,
          userId,
          enabled,
        },
      })
    }

    console.log("User flag override set successfully", {
      flagKey,
      userId: userId.slice(0, 8) + "...",
      enabled,
    })

  } catch (error) {
    console.error("Error setting user flag override", {
      flagKey,
      userId: userId.slice(0, 8) + "...",
      enabled,
      error: error instanceof Error ? error.message : "Unknown error",
    })

    throw new Error(`Failed to set user flag override: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

export async function removeOverride(
  flagKey: string,
  orgId?: string,
  userId?: string
): Promise<void> {
  try {
    console.log("Removing flag override", {
      flagKey,
      orgId: orgId?.slice(0, 8) + "...",
      userId: userId?.slice(0, 8) + "...",
    })

    await db.flagOverride.deleteMany({
      where: {
        flagKey,
        organizationId: orgId || null,
        userId: userId || null,
      },
    })

    console.log("Flag override removed successfully", {
      flagKey,
      orgId: orgId?.slice(0, 8) + "...",
      userId: userId?.slice(0, 8) + "...",
    })

  } catch (error) {
    console.error("Error removing flag override", {
      flagKey,
      orgId: orgId?.slice(0, 8) + "...",
      userId: userId?.slice(0, 8) + "...",
      error: error instanceof Error ? error.message : "Unknown error",
    })

    throw new Error(`Failed to remove flag override: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

export async function getOrgOverrides(orgId: string): Promise<FlagOverride[]> {
  try {
    return await db.flagOverride.findMany({
      where: {
        organizationId: orgId,
        userId: null,
      },
      orderBy: { flagKey: "asc" },
    })
  } catch (error) {
    console.error("Error getting organization overrides", {
      orgId: orgId.slice(0, 8) + "...",
      error: error instanceof Error ? error.message : "Unknown error",
    })

    return []
  }
}

export async function getUserOverrides(userId: string): Promise<FlagOverride[]> {
  try {
    return await db.flagOverride.findMany({
      where: {
        organizationId: null,
        userId,
      },
      orderBy: { flagKey: "asc" },
    })
  } catch (error) {
    console.error("Error getting user overrides", {
      userId: userId.slice(0, 8) + "...",
      error: error instanceof Error ? error.message : "Unknown error",
    })

    return []
  }
}

// Utility function for checking if a flag is enabled
export async function isEnabled(flagKey: string, context: FlagContext = {}): Promise<boolean> {
  const resolved = await resolveFlag(flagKey, context)
  return resolved.enabled
}

// Utility function for conditional code execution
export async function withFlag<T>(
  flagKey: string,
  context: FlagContext,
  enabledFn: () => T | Promise<T>,
  disabledFn?: () => T | Promise<T>
): Promise<T | undefined> {
  const enabled = await isEnabled(flagKey, context)

  if (enabled) {
    return await enabledFn()
  } else if (disabledFn) {
    return await disabledFn()
  }

  return undefined
}