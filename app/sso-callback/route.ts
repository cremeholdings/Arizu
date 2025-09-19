import { NextRequest } from "next/server"
import { handleCallback } from "@clerk/nextjs/server"

export async function GET(request: NextRequest) {
  return handleCallback(request, {
    afterSignInUrl: "/app",
    afterSignUpUrl: "/app"
  })
}