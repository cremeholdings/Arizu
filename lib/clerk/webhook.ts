import { Webhook } from "svix"

interface VerifyWebhookSignatureParams {
  body: string
  headers: {
    "svix-id": string
    "svix-timestamp": string
    "svix-signature": string
  }
}

export async function verifyWebhookSignature({
  body,
  headers,
}: VerifyWebhookSignatureParams): Promise<boolean> {
  try {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET

    if (!webhookSecret) {
      console.error("CLERK_WEBHOOK_SECRET is not configured")
      return false
    }

    // Create a new Svix instance with your webhook secret
    const wh = new Webhook(webhookSecret)

    // Verify the webhook signature
    wh.verify(body, headers)

    return true
  } catch (error) {
    console.error("Webhook signature verification failed:", {
      error: error instanceof Error ? error.message : "Unknown error",
      // Do not log the actual headers or body for security
    })
    return false
  }
}

// Types for Clerk webhook events
export interface ClerkWebhookEvent {
  type: string
  object: string
  data: any
}

export interface ClerkUser {
  id: string
  object: "user"
  username?: string
  first_name?: string
  last_name?: string
  image_url?: string
  has_image?: boolean
  primary_email_address_id?: string
  primary_phone_number_id?: string
  primary_web3_wallet_id?: string
  password_enabled?: boolean
  two_factor_enabled?: boolean
  totp_enabled?: boolean
  backup_code_enabled?: boolean
  email_addresses?: ClerkEmailAddress[]
  phone_numbers?: any[]
  web3_wallets?: any[]
  external_accounts?: any[]
  saml_accounts?: any[]
  public_metadata?: Record<string, any>
  private_metadata?: Record<string, any>
  unsafe_metadata?: Record<string, any>
  external_id?: string
  created_at?: number
  updated_at?: number
  banned?: boolean
  locked?: boolean
  lockout_expires_in_seconds?: number
  verification_attempts_remaining?: number
}

export interface ClerkEmailAddress {
  id: string
  object: "email_address"
  email_address: string
  reserved?: boolean
  verification?: {
    status: string
    strategy: string
    attempts?: number
    expire_at?: number
  }
  linked_to?: any[]
  created_at?: number
  updated_at?: number
}

export interface ClerkOrganization {
  id: string
  object: "organization"
  name: string
  slug: string
  image_url?: string
  has_image?: boolean
  members_count?: number
  pending_invitations_count?: number
  public_metadata?: Record<string, any>
  private_metadata?: Record<string, any>
  max_allowed_memberships?: number
  admin_delete_enabled?: boolean
  created_at?: number
  updated_at?: number
}

export interface ClerkOrganizationMembership {
  id: string
  object: "organization_membership"
  organization: {
    id: string
    name: string
    slug: string
    image_url?: string
    has_image?: boolean
    created_at?: number
    updated_at?: number
  }
  public_user_data: {
    identifier: string
    first_name?: string
    last_name?: string
    image_url?: string
    has_image?: boolean
    user_id: string
  }
  role: string
  permissions?: string[]
  public_metadata?: Record<string, any>
  private_metadata?: Record<string, any>
  created_at?: number
  updated_at?: number
}

// Webhook event types
export type ClerkWebhookEventType =
  | "user.created"
  | "user.updated"
  | "user.deleted"
  | "organization.created"
  | "organization.updated"
  | "organization.deleted"
  | "organizationMembership.created"
  | "organizationMembership.updated"
  | "organizationMembership.deleted"
  | "organizationInvitation.created"
  | "organizationInvitation.revoked"
  | "organizationInvitation.accepted"
  | "session.created"
  | "session.ended"
  | "session.removed"
  | "session.revoked"
  | "email.created"
  | "sms.created"