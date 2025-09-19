import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { verifyWebhookSignature } from "@/lib/clerk/webhook"
import { syncClerkData } from "@/lib/clerk/sync"

export async function POST(req: NextRequest) {
  try {
    // Get the headers
    const headersList = headers()
    const svixId = headersList.get("svix-id")
    const svixTimestamp = headersList.get("svix-timestamp")
    const svixSignature = headersList.get("svix-signature")

    // If there are no headers, error out
    if (!svixId || !svixTimestamp || !svixSignature) {
      console.warn("Clerk webhook: Missing required headers")
      return NextResponse.json(
        { error: "Missing required headers" },
        { status: 401 }
      )
    }

    // Get the body
    const body = await req.text()

    // Verify the webhook signature
    const isValid = await verifyWebhookSignature({
      body,
      headers: {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      },
    })

    if (!isValid) {
      console.warn("Clerk webhook: Invalid signature")
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      )
    }

    // Parse the webhook payload
    let event
    try {
      event = JSON.parse(body)
    } catch (error) {
      console.error("Clerk webhook: Failed to parse JSON:", error)
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      )
    }

    // Log the event type (without sensitive data)
    console.log(`Clerk webhook received: ${event.type}`)

    // Handle the webhook event
    try {
      await syncClerkData(event)

      return NextResponse.json(
        { ok: true, message: "Webhook processed successfully" },
        { status: 200 }
      )
    } catch (syncError) {
      console.error("Clerk webhook: Sync error:", {
        type: event.type,
        error: syncError instanceof Error ? syncError.message : "Unknown error",
      })

      // Return 200 to prevent Clerk from retrying
      // Log the error for investigation
      return NextResponse.json(
        { ok: false, error: "Sync failed" },
        { status: 200 }
      )
    }

  } catch (error) {
    console.error("Clerk webhook: Unexpected error:", {
      error: error instanceof Error ? error.message : "Unknown error",
    })

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// Only allow POST requests
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  )
}

export async function PUT() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  )
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  )
}