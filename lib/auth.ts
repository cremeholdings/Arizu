import { currentUser, auth } from "@clerk/nextjs"
import { redirect } from "next/navigation"

export async function requireUser() {
  const user = await currentUser()

  if (!user) {
    redirect("/sign-in")
  }

  return user
}

export async function requireOrg() {
  const { userId, orgId } = auth()

  if (!userId) {
    redirect("/sign-in")
  }

  if (!orgId) {
    redirect("/app/create-organization")
  }

  return { userId, orgId }
}

export async function getUserOrg() {
  const { userId, orgId } = auth()
  const user = await currentUser()

  if (!userId || !user) {
    return { user: null, userId: null, orgId: null }
  }

  return { user, userId, orgId }
}

export function getAuthError(status: number): { error: string; status: number } {
  switch (status) {
    case 401:
      return { error: "Unauthorized", status: 401 }
    case 403:
      return { error: "Forbidden - Organization required", status: 403 }
    default:
      return { error: "Authentication error", status: 500 }
  }
}