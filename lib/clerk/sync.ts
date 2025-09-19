import { db } from "@/lib/db"
import {
  ClerkWebhookEvent,
  ClerkUser,
  ClerkOrganization,
  ClerkOrganizationMembership,
  ClerkWebhookEventType,
} from "./webhook"

export async function syncClerkData(event: ClerkWebhookEvent): Promise<void> {
  const { type, data } = event

  try {
    switch (type as ClerkWebhookEventType) {
      // User events
      case "user.created":
      case "user.updated":
        await syncUser(data as ClerkUser)
        break

      case "user.deleted":
        await deleteUser(data as ClerkUser)
        break

      // Organization events
      case "organization.created":
      case "organization.updated":
        await syncOrganization(data as ClerkOrganization)
        break

      case "organization.deleted":
        await deleteOrganization(data as ClerkOrganization)
        break

      // Organization membership events
      case "organizationMembership.created":
      case "organizationMembership.updated":
        await syncOrganizationMembership(data as ClerkOrganizationMembership)
        break

      case "organizationMembership.deleted":
        await deleteOrganizationMembership(data as ClerkOrganizationMembership)
        break

      // Ignore other event types
      default:
        console.log(`Ignoring Clerk webhook event: ${type}`)
        break
    }
  } catch (error) {
    console.error(`Failed to sync Clerk event ${type}:`, {
      error: error instanceof Error ? error.message : "Unknown error",
      eventType: type,
      // Do not log the full data object to avoid exposing PII
    })
    throw error
  }
}

async function syncUser(clerkUser: ClerkUser): Promise<void> {
  try {
    // Get primary email address
    const primaryEmail = clerkUser.email_addresses?.find(
      (email) => email.id === clerkUser.primary_email_address_id
    )

    if (!primaryEmail) {
      console.warn(`User ${clerkUser.id} has no primary email address`)
      return
    }

    // Redact email in logs
    const redactedEmail = primaryEmail.email_address.replace(
      /(.{1,3})[^@]*@/,
      "$1***@"
    )

    await db.user.upsert({
      where: {
        clerkId: clerkUser.id,
      },
      update: {
        email: primaryEmail.email_address,
        firstName: clerkUser.first_name || null,
        lastName: clerkUser.last_name || null,
        imageUrl: clerkUser.image_url || null,
        updatedAt: new Date(),
      },
      create: {
        clerkId: clerkUser.id,
        email: primaryEmail.email_address,
        firstName: clerkUser.first_name || null,
        lastName: clerkUser.last_name || null,
        imageUrl: clerkUser.image_url || null,
      },
    })

    console.log(`Synced user: ${clerkUser.id} (${redactedEmail})`)
  } catch (error) {
    console.error(`Failed to sync user ${clerkUser.id}:`, {
      error: error instanceof Error ? error.message : "Unknown error",
    })
    throw error
  }
}

async function deleteUser(clerkUser: ClerkUser): Promise<void> {
  try {
    await db.user.delete({
      where: {
        clerkId: clerkUser.id,
      },
    })

    console.log(`Deleted user: ${clerkUser.id}`)
  } catch (error) {
    // If user doesn't exist, that's fine
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      console.log(`User ${clerkUser.id} already deleted`)
      return
    }

    console.error(`Failed to delete user ${clerkUser.id}:`, {
      error: error instanceof Error ? error.message : "Unknown error",
    })
    throw error
  }
}

async function syncOrganization(clerkOrg: ClerkOrganization): Promise<void> {
  try {
    await db.organization.upsert({
      where: {
        clerkId: clerkOrg.id,
      },
      update: {
        name: clerkOrg.name,
        slug: clerkOrg.slug,
        imageUrl: clerkOrg.image_url || null,
        updatedAt: new Date(),
      },
      create: {
        clerkId: clerkOrg.id,
        name: clerkOrg.name,
        slug: clerkOrg.slug,
        imageUrl: clerkOrg.image_url || null,
        // New organizations start with FREE plan
        planType: "FREE",
      },
    })

    console.log(`Synced organization: ${clerkOrg.id} (${clerkOrg.name})`)

    // Create default usage limits for new organizations
    await createDefaultUsageLimits(clerkOrg.id)
  } catch (error) {
    console.error(`Failed to sync organization ${clerkOrg.id}:`, {
      error: error instanceof Error ? error.message : "Unknown error",
    })
    throw error
  }
}

async function deleteOrganization(clerkOrg: ClerkOrganization): Promise<void> {
  try {
    await db.organization.delete({
      where: {
        clerkId: clerkOrg.id,
      },
    })

    console.log(`Deleted organization: ${clerkOrg.id}`)
  } catch (error) {
    // If organization doesn't exist, that's fine
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      console.log(`Organization ${clerkOrg.id} already deleted`)
      return
    }

    console.error(`Failed to delete organization ${clerkOrg.id}:`, {
      error: error instanceof Error ? error.message : "Unknown error",
    })
    throw error
  }
}

async function syncOrganizationMembership(
  membership: ClerkOrganizationMembership
): Promise<void> {
  try {
    await db.organizationMember.upsert({
      where: {
        userId_orgId: {
          userId: membership.public_user_data.user_id,
          orgId: membership.organization.id,
        },
      },
      update: {
        role: membership.role,
        updatedAt: new Date(),
      },
      create: {
        userId: membership.public_user_data.user_id,
        orgId: membership.organization.id,
        role: membership.role,
      },
    })

    console.log(
      `Synced membership: ${membership.public_user_data.user_id} -> ${membership.organization.id} (${membership.role})`
    )
  } catch (error) {
    console.error(
      `Failed to sync membership ${membership.id}:`,
      {
        error: error instanceof Error ? error.message : "Unknown error",
        userId: membership.public_user_data.user_id,
        orgId: membership.organization.id,
      }
    )
    throw error
  }
}

async function deleteOrganizationMembership(
  membership: ClerkOrganizationMembership
): Promise<void> {
  try {
    await db.organizationMember.delete({
      where: {
        userId_orgId: {
          userId: membership.public_user_data.user_id,
          orgId: membership.organization.id,
        },
      },
    })

    console.log(
      `Deleted membership: ${membership.public_user_data.user_id} -> ${membership.organization.id}`
    )
  } catch (error) {
    // If membership doesn't exist, that's fine
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      console.log(
        `Membership ${membership.public_user_data.user_id} -> ${membership.organization.id} already deleted`
      )
      return
    }

    console.error(
      `Failed to delete membership ${membership.id}:`,
      {
        error: error instanceof Error ? error.message : "Unknown error",
        userId: membership.public_user_data.user_id,
        orgId: membership.organization.id,
      }
    )
    throw error
  }
}

async function createDefaultUsageLimits(organizationId: string): Promise<void> {
  try {
    // Check if usage limits already exist
    const existingLimits = await db.usageLimit.findFirst({
      where: {
        organizationId,
      },
    })

    if (existingLimits) {
      // Limits already exist, skip creation
      return
    }

    // Create default FREE plan limits
    await db.usageLimit.createMany({
      data: [
        {
          organizationId,
          usageType: "AUTOMATION_RUNS",
          monthlyLimit: 100,
        },
        {
          organizationId,
          usageType: "WORKFLOW_EXECUTIONS",
          monthlyLimit: 50,
        },
        {
          organizationId,
          usageType: "API_CALLS",
          monthlyLimit: 1000,
        },
        {
          organizationId,
          usageType: "STORAGE_MB",
          monthlyLimit: 100,
        },
      ],
      skipDuplicates: true,
    })

    console.log(`Created default usage limits for organization: ${organizationId}`)
  } catch (error) {
    console.error(
      `Failed to create default usage limits for organization ${organizationId}:`,
      {
        error: error instanceof Error ? error.message : "Unknown error",
      }
    )
    // Don't throw here - this is not critical for the sync operation
  }
}