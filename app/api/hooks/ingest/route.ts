import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { recordRunStart, recordRunEnd, RunLimitError } from "@/middleware/runLimiter"
import { appendLog } from "@/lib/runs/logs"
import { headers } from "next/headers"
import { createHmac, timingSafeEqual } from "crypto"

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

    // Parse JSON payload
    let parsedPayload: unknown
    try {
      parsedPayload = JSON.parse(payload)
    } catch (error) {
      console.error("Invalid JSON in webhook payload", {
        payloadPreview: payload.substring(0, 200),
        error: error instanceof Error ? error.message : "Unknown error",
      })

      return NextResponse.json(
        { ok: false, error: "Invalid JSON payload" },
        { status: 400 }
      )
    }

    // Validate payload schema
    const validation = runEventSchema.safeParse(parsedPayload)
    if (!validation.success) {
      console.error("Invalid webhook payload schema", {
        errors: validation.error.issues,
        payload: parsedPayload,
      })

      return NextResponse.json(
        {
          ok: false,
          error: "Invalid payload schema",
          details: validation.error.issues.map(issue => ({
            field: issue.path.join("."),
            message: issue.message,
          }))
        },
        { status: 400 }
      )
    }

    const event = validation.data
    console.log("Processing webhook event", {
      event: event.event,
      runId: event.runId.slice(0, 8) + "...",
      orgId: event.orgId.slice(0, 8) + "...",
      automationId: event.automationId?.slice(0, 8) + "...",
    })

    // Process event based on type
    try {
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

          return NextResponse.json(
            { ok: false, error: "Unknown event type" },
            { status: 400 }
          )
      }

      console.log("Webhook event processed successfully", {
        event: event.event,
        runId: event.runId.slice(0, 8) + "...",
        orgId: event.orgId.slice(0, 8) + "...",
      })

      return NextResponse.json({ ok: true })

    } catch (error) {
      console.error("Error processing webhook event", {
        event: event.event,
        runId: event.runId.slice(0, 8) + "...",
        orgId: event.orgId.slice(0, 8) + "...",
        error: error instanceof Error ? error.message : "Unknown error",
      })

      if (error instanceof RunLimitError) {
        return NextResponse.json(
          {
            ok: false,
            error: "Run limit error",
            code: error.code,
            details: {
              currentUsage: error.currentUsage,
              limit: error.limit,
            }
          },
          { status: 429 }
        )
      }

      return NextResponse.json(
        {
          ok: false,
          error: "Failed to process webhook event",
          details: error instanceof Error ? error.message : "Unknown error"
        },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error("Webhook ingestion error", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })

    return NextResponse.json(
      {
        ok: false,
        error: "Internal server error",
        message: "Failed to process webhook"
      },
      { status: 500 }
    )
  }
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