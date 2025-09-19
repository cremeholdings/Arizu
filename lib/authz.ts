import { currentUser, auth } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { User, Organization, OrganizationMember } from "@prisma/client"

export interface AuthContext {
  userId: string
  orgId: string
  role: string
  user: User
  organization: Organization
  membership: OrganizationMember
}

export interface AuthError {
  error: string
  status: number
  code?: string
}

export type OrgRole = "owner" | "admin" | "member"

export const ROLE_HIERARCHY: Record<OrgRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
}

export function hasMinimumRole(userRole: string, requiredRole: OrgRole): boolean {
  const userLevel = ROLE_HIERARCHY[userRole as OrgRole] || 0
  const requiredLevel = ROLE_HIERARCHY[requiredRole]
  return userLevel >= requiredLevel
}

export async function requireAuth(): Promise<{
  userId: string
  clerkUser: any
}> {
  const { userId } = auth()
  const clerkUser = await currentUser()

  if (!userId || !clerkUser) {
    redirect("/sign-in")
  }

  return { userId, clerkUser }
}

export async function requireOrg(): Promise<{
  userId: string
  orgId: string
  clerkUser: any
}> {
  const { userId, orgId } = auth()
  const clerkUser = await currentUser()

  if (!userId || !clerkUser) {
    redirect("/sign-in")
  }

  if (!orgId) {
    redirect("/app/create-organization")
  }

  return { userId, orgId, clerkUser }
}

export async function requireOrgRole(
  minRole: OrgRole = "member"
): Promise<AuthContext> {
  const { userId, orgId } = auth()
  const clerkUser = await currentUser()

  if (!userId || !clerkUser) {
    redirect("/sign-in")
  }

  if (!orgId) {
    redirect("/app/create-organization")
  }

  // Get user from database
  const user = await db.user.findUnique({
    where: { clerkId: userId },
  })

  if (!user) {
    // User not synced yet, redirect to sign-in to trigger sync
    redirect("/sign-in")
  }

  // Get organization from database
  const organization = await db.organization.findUnique({
    where: { clerkId: orgId },
  })

  if (!organization) {
    // Organization not synced yet, this shouldn't happen
    throw new Error("Organization not found")
  }

  // Get membership and verify role
  const membership = await db.organizationMember.findUnique({
    where: {
      userId_orgId: {
        userId: userId,
        orgId: orgId,
      },
    },
  })

  if (!membership) {
    redirect("/app/create-organization")
  }

  // Check role authorization
  if (!hasMinimumRole(membership.role, minRole)) {
    throw new Error("Insufficient permissions")
  }

  return {
    userId,
    orgId,
    role: membership.role,
    user,
    organization,
    membership,
  }
}

export async function getAuthContext(): Promise<AuthContext | null> {
  try {
    const { userId, orgId } = auth()

    if (!userId || !orgId) {
      return null
    }

    // Get user from database
    const user = await db.user.findUnique({
      where: { clerkId: userId },
    })

    if (!user) {
      return null
    }

    // Get organization from database
    const organization = await db.organization.findUnique({
      where: { clerkId: orgId },
    })

    if (!organization) {
      return null
    }

    // Get membership
    const membership = await db.organizationMember.findUnique({
      where: {
        userId_orgId: {
          userId: userId,
          orgId: orgId,
        },
      },
    })

    if (!membership) {
      return null
    }

    return {
      userId,
      orgId,
      role: membership.role,
      user,
      organization,
      membership,
    }
  } catch (error) {
    console.error("Failed to get auth context:", error)
    return null
  }
}

// API-specific authorization helpers
export async function apiRequireAuth(): Promise<{
  userId: string
  clerkUser: any
} | AuthError> {
  try {
    const { userId } = auth()
    const clerkUser = await currentUser()

    if (!userId || !clerkUser) {
      return {
        error: "Authentication required",
        status: 401,
        code: "UNAUTHORIZED",
      }
    }

    return { userId, clerkUser }
  } catch (error) {
    return {
      error: "Authentication failed",
      status: 401,
      code: "AUTH_ERROR",
    }
  }
}

export async function apiRequireOrg(): Promise<AuthContext | AuthError> {
  try {
    const { userId, orgId } = auth()

    if (!userId) {
      return {
        error: "Authentication required",
        status: 401,
        code: "UNAUTHORIZED",
      }
    }

    if (!orgId) {
      return {
        error: "Organization context required",
        status: 403,
        code: "ORG_REQUIRED",
      }
    }

    // Get user from database
    const user = await db.user.findUnique({
      where: { clerkId: userId },
    })

    if (!user) {
      return {
        error: "User not found",
        status: 401,
        code: "USER_NOT_FOUND",
      }
    }

    // Get organization from database
    const organization = await db.organization.findUnique({
      where: { clerkId: orgId },
    })

    if (!organization) {
      return {
        error: "Organization not found",
        status: 403,
        code: "ORG_NOT_FOUND",
      }
    }

    // Get membership
    const membership = await db.organizationMember.findUnique({
      where: {
        userId_orgId: {
          userId: userId,
          orgId: orgId,
        },
      },
    })

    if (!membership) {
      return {
        error: "Not a member of this organization",
        status: 403,
        code: "NOT_MEMBER",
      }
    }

    return {
      userId,
      orgId,
      role: membership.role,
      user,
      organization,
      membership,
    }
  } catch (error) {
    console.error("API org auth error:", error)
    return {
      error: "Authorization failed",
      status: 500,
      code: "AUTH_ERROR",
    }
  }
}

export async function apiRequireOrgRole(
  minRole: OrgRole = "member"
): Promise<AuthContext | AuthError> {
  const authResult = await apiRequireOrg()

  if ("error" in authResult) {
    return authResult
  }

  // Check role authorization
  if (!hasMinimumRole(authResult.role, minRole)) {
    return {
      error: `Minimum role required: ${minRole}`,
      status: 403,
      code: "INSUFFICIENT_ROLE",
    }
  }

  return authResult
}

// Type guards
export function isAuthError(result: any): result is AuthError {
  return result && typeof result === "object" && "error" in result
}

export function isAuthContext(result: any): result is AuthContext {
  return (
    result &&
    typeof result === "object" &&
    "userId" in result &&
    "orgId" in result &&
    "role" in result
  )
}

// Organization permission helpers
export async function canManageOrganization(
  userId: string,
  orgId: string
): Promise<boolean> {
  try {
    const membership = await db.organizationMember.findUnique({
      where: {
        userId_orgId: {
          userId,
          orgId,
        },
      },
    })

    return membership ? hasMinimumRole(membership.role, "admin") : false
  } catch (error) {
    console.error("Error checking org management permissions:", error)
    return false
  }
}

export async function canManageAutomations(
  userId: string,
  orgId: string
): Promise<boolean> {
  try {
    const membership = await db.organizationMember.findUnique({
      where: {
        userId_orgId: {
          userId,
          orgId,
        },
      },
    })

    return membership ? hasMinimumRole(membership.role, "member") : false
  } catch (error) {
    console.error("Error checking automation permissions:", error)
    return false
  }
}

export async function canViewBilling(
  userId: string,
  orgId: string
): Promise<boolean> {
  try {
    const membership = await db.organizationMember.findUnique({
      where: {
        userId_orgId: {
          userId,
          orgId,
        },
      },
    })

    return membership ? hasMinimumRole(membership.role, "admin") : false
  } catch (error) {
    console.error("Error checking billing permissions:", error)
    return false
  }
}