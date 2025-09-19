import { authMiddleware } from "@clerk/nextjs"
import { NextResponse } from "next/server"

export default authMiddleware({
  publicRoutes: [
    "/",
    "/sign-in(.*)",
    "/sign-up(.*)",
    "/sso-callback",
    "/api/webhooks(.*)",
    "/api/health",
  ],
  protectedRoutes: [
    "/app(.*)",
    "/api/auth(.*)",
    "/api/organizations(.*)",
    "/api/automations(.*)",
    "/api/plans(.*)",
    "/api/runs(.*)",
    "/api/usage(.*)",
  ],
  afterAuth(auth, req) {
    const { pathname } = req.nextUrl

    // Handle unauthenticated requests to protected routes
    if (!auth.userId && !auth.isPublicRoute) {
      const signInUrl = new URL("/sign-in", req.url)
      signInUrl.searchParams.set("redirect_url", req.url)
      return Response.redirect(signInUrl)
    }

    // Handle authenticated requests
    if (auth.userId) {
      // API routes that require organization context
      const orgRequiredApiRoutes = [
        "/api/organizations",
        "/api/automations",
        "/api/plans",
        "/api/runs",
        "/api/usage",
      ]

      const requiresOrg = orgRequiredApiRoutes.some(route =>
        pathname.startsWith(route)
      )

      // API routes without org context should return 403
      if (requiresOrg && !auth.orgId) {
        return NextResponse.json(
          {
            error: "Organization context required",
            code: "ORG_REQUIRED"
          },
          { status: 403 }
        )
      }

      // App pages that require organization context
      if (pathname.startsWith("/app")) {
        // Allow certain pages without org context
        const allowedWithoutOrg = [
          "/app/create-organization",
          "/app/organization-profile",
          "/app/user-profile",
        ]

        const isAllowedWithoutOrg = allowedWithoutOrg.some(route =>
          pathname.startsWith(route)
        )

        if (!isAllowedWithoutOrg && !auth.orgId) {
          const createOrgUrl = new URL("/app/create-organization", req.url)
          return Response.redirect(createOrgUrl)
        }

        // Redirect to dashboard if visiting /app root with org
        if (pathname === "/app" && auth.orgId) {
          const dashboardUrl = new URL("/app/dashboard", req.url)
          return Response.redirect(dashboardUrl)
        }
      }

      // Handle organization-specific routes
      if (pathname.startsWith("/app/org/") && auth.orgId) {
        // Extract org slug from URL
        const pathParts = pathname.split("/")
        const urlOrgSlug = pathParts[3]

        // This would require a database lookup to validate org slug
        // For now, we trust Clerk's org context
        // In a production app, you might want to validate the slug matches the active org
      }
    }

    // Default: allow the request to proceed
    return NextResponse.next()
  },
})

export const config = {
  matcher: [
    // Match all request paths except for static files and Next.js internals
    "/((?!.+\\.[\\w]+$|_next).*)",
    "/",
    // Include API and tRPC routes
    "/(api|trpc)(.*)",
  ],
}