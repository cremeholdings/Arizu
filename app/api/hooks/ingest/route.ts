import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { recordRunStart, recordRunEnd, RunLimitError } from "@/middleware/runLimiter"
import { appendLog } from "@/lib/runs/logs"
import { headers } from "next/headers"
import { createHmac, timingSafeEqual } from "crypto"
import { applyRateLimit, isAnyLimitExceeded, getMostRestrictive } from "@/lib/http/limit"
import { withIdempotency, extractWebhookDeliveryId, IDEMPOTENCY_CONFIG } from "@/lib/http/idempotency"
import {
  TypedError,
  getErrorStatusCode,
  unauthorized,
  rateLimit,
  badRequest,
  serverError
} from "@/lib/errors"

const runEventSchema = z.object({
  event: z.enum(["run.started", "run.completed", "run.failed"]),
  runId: z.string().min(1),
  orgId: z.string().min(1),
  automationId: z.string().optional(),
  userId: z.string().optional(),
  timestamp: z.string().datetime().optional(),
  data: z.object({
    executionTime: z.number().optional(),
    errorMessage: z.string().optional(),
    inputData: z.record(z.any()).optional(),
    outputData: z.record(z.any()).optional(),
    stepLogs: z.array(z.object({
      step: z.string(),
      input: z.record(z.any()).optional(),
      output: z.record(z.any()).optional(),
      error: z.string().optional(),
      timestamp: z.string().datetime().optional(),
    })).optional(),
  }).optional(),
})

function verifyHmacSignature(payload: string, signature: string, secret: string): boolean {
  try {
    // Remove 'sha256=' prefix if present
    const cleanSignature = signature.replace(/^sha256=/, "")

    // Create HMAC
    const hmac = createHmac("sha256", secret)
    hmac.update(payload)
    const computed = hmac.digest("hex")

    // Use timing-safe comparison
    const signatureBuffer = Buffer.from(cleanSignature, "hex")
    const computedBuffer = Buffer.from(computed, "hex")

    return signatureBuffer.length === computedBuffer.length &&
           timingSafeEqual(signatureBuffer, computedBuffer)
  } catch (error) {
    console.error("HMAC verification error", {
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return false
  }
}

async function authenticateWebhook(request: NextRequest, payload: string): Promise<boolean> {
  const headersList = headers()
  const signature = headersList.get("x-hub-signature-256") ||
                   headersList.get("x-n8n-signature") ||
                   headersList.get("x-signature")

  if (!signature) {
    console.warn("Webhook missing signature header")
    return false
  }

  const webhookSecret = process.env.WEBHOOK_SECRET || process.env.N8N_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.error("No webhook secret configured")
    return false
  }

  return verifyHmacSignature(payload, signature, webhookSecret)
}

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    const clientIp = request.headers.get("x-forwarded-for") ||
                    request.headers.get("x-real-ip") ||
                    "127.0.0.1"

    const rateLimitResults = await applyRateLimit("WEBHOOK_INGEST", "/api/hooks/ingest", {
      ip: clientIp
    })

    if (isAnyLimitExceeded(rateLimitResults)) {
      const mostRestrictive = getMostRestrictive(rateLimitResults)

      console.warn("Webhook ingestion rate limited", {
        ip: clientIp,
        limit: mostRestrictive.limit,
        remaining: mostRestrictive.remaining,
        retryAfter: mostRestrictive.retryAfter
      })

      const errorResponse = rateLimit(
        "Rate limit exceeded. Please wait before sending more webhooks.",
        mostRestrictive.retryAfter || 60,
        {
          retryAfterSec: mostRestrictive.retryAfter || 60,
          resetTime: mostRestrictive.resetTime,
          endpoint: "/api/hooks/ingest"
        }
      )

      return NextResponse.json(errorResponse, {
        status: getErrorStatusCode(errorResponse),
        headers: {
          "Retry-After": String(mostRestrictive.retryAfter || 60),
          "X-RateLimit-Limit": String(mostRestrictive.limit),
          "X-RateLimit-Remaining": String(mostRestrictive.remaining),
          "X-RateLimit-Reset": String(mostRestrictive.resetTime)
        }
      })
    }

    // Read raw payload for HMAC verification
    const payload = await request.text()

    // Verify HMAC signature
    const isAuthenticated = await authenticateWebhook(request, payload)
    if (!isAuthenticated) {
      console.warn("Webhook authentication failed", {
        hasPayload: !!payload,
        payloadLength: payload.length,
        userAgent: request.headers.get("user-agent"),
      })

      return NextResponse.json(
        { ok: false, error: "Authentication failed" },
        { status: 401 }
      )
    }

    // Use idempotency protection with webhook delivery ID
    const deliveryId = extractWebhookDeliveryId(request.headers)
    if (!deliveryId) {
      console.warn("Webhook missing delivery ID header", {
        userAgent: request.headers.get("user-agent"),
        availableHeaders: [...request.headers.keys()].filter(h => h.startsWith('x-'))
      })
    }

    const idempotentResult = await withIdempotency(
      request,
      IDEMPOTENCY_CONFIG.WEBHOOK_PROCESSING.ttlSec,
      async () => {
        // Parse JSON payload
        let parsedPayload: unknown
        try {
          parsedPayload = JSON.parse(payload)
        } catch (error) {
          console.error("Invalid JSON in webhook payload", {
            payloadPreview: payload.substring(0, 200),
            error: error instanceof Error ? error.message : "Unknown error",
          })

          throw new Error("Invalid JSON payload")
        }

        // Validate payload schema
        const validation = runEventSchema.safeParse(parsedPayload)
        if (!validation.success) {
          console.error("Invalid webhook payload schema", {
            errors: validation.error.issues,
            payload: parsedPayload,
          })

          throw new Error("Invalid payload schema")
        }

        const event = validation.data
        console.log("Processing webhook event", {
          event: event.event,
          runId: event.runId.slice(0, 8) + "...",
          orgId: event.orgId.slice(0, 8) + "...",
          automationId: event.automationId?.slice(0, 8) + "...",
          cached: false,
          deliveryId: deliveryId?.substring(0, 20) + "..."
        })

        // Process event based on type
        try {
          return await processWebhookEvent(event)
        } catch (error) {
          if (error instanceof TypedError) {
            // Return the error response directly for processing later
            return error.response
          }
          throw error
        }
      },
      { generateIdFromBody: !deliveryId }
    )

    if (idempotentResult.cached) {
      console.log("Webhook event processed from cache", {
        requestId: idempotentResult.requestId.substring(0, 20) + "...",
        cached: true
      })
    }

    const response = idempotentResult.value

    // Handle error responses with proper status codes
    if (!response.ok && response.code) {
      const statusCode = getErrorStatusCode(response)
      const headers: Record<string, string> = {}

      // Add Retry-After header for rate limit errors
      if (response.retryAfterSec) {
        headers["Retry-After"] = String(response.retryAfterSec)
      }

      return NextResponse.json(response, {
        status: statusCode,
        headers: Object.keys(headers).length > 0 ? headers : undefined
      })
    }

    return NextResponse.json(response)

  } catch (error) {
    // Handle typed errors
    if (error instanceof TypedError) {
      const response = error.response
      const headers: Record<string, string> = {}

      // Add Retry-After header for rate limit errors
      if (response.retryAfterSec) {
        headers["Retry-After"] = String(response.retryAfterSec)
      }

      return NextResponse.json(response, {
        status: getErrorStatusCode(response),
        headers: Object.keys(headers).length > 0 ? headers : undefined
      })
    }

    console.error("Webhook ingestion error", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })

    const errorResponse = serverError("Internal server error. Failed to process webhook.")
    return NextResponse.json(errorResponse, { status: getErrorStatusCode(errorResponse) })
  }
}

async function processWebhookEvent(event: z.infer<typeof runEventSchema>) {
  switch (event.event) {
    case "run.started":
      await recordRunStart(
        event.orgId,
        event.runId,
        event.automationId,
        event.userId
      )

      // Log initial step if available
      if (event.data?.stepLogs?.length) {
        for (const stepLog of event.data.stepLogs) {
          await appendLog(event.runId, {
            step: stepLog.step,
            input: stepLog.input,
            output: stepLog.output,
            error: stepLog.error,
          })
        }
      }
      break

    case "run.completed":
      await recordRunEnd(event.orgId, event.runId, {
        status: "ok",
        executionTime: event.data?.executionTime,
        outputData: event.data?.outputData,
      })

      // Log final steps if available
      if (event.data?.stepLogs?.length) {
        for (const stepLog of event.data.stepLogs) {
          await appendLog(event.runId, {
            step: stepLog.step,
            input: stepLog.input,
            output: stepLog.output,
            error: stepLog.error,
          })
        }
      }
      break

    case "run.failed":
      await recordRunEnd(event.orgId, event.runId, {
        status: "error",
        errorMessage: event.data?.errorMessage,
        executionTime: event.data?.executionTime,
      })

      // Log error steps if available
      if (event.data?.stepLogs?.length) {
        for (const stepLog of event.data.stepLogs) {
          await appendLog(event.runId, {
            step: stepLog.step,
            input: stepLog.input,
            output: stepLog.output,
            error: stepLog.error,
          })
        }
      }
      break

    default:
      console.warn("Unknown webhook event type", {
        event: event.event,
        runId: event.runId.slice(0, 8) + "...",
      })

      throw new Error(`Unknown event type: ${event.event}`)
  }

  console.log("Webhook event processed successfully", {
    event: event.event,
    runId: event.runId.slice(0, 8) + "...",
    orgId: event.orgId.slice(0, 8) + "...",
  })

  return { ok: true }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "webhook-ingest",
    timestamp: new Date().toISOString(),
    endpoints: {
      POST: "Process run events from n8n",
    },
    requiredHeaders: [
      "x-hub-signature-256",
      "x-n8n-signature",
      "x-signature"
    ],
    supportedEvents: [
      "run.started",
      "run.completed",
      "run.failed"
    ]
  })
}