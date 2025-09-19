"use client"

import { UserButton, OrganizationSwitcher, useUser, useOrganization } from "@clerk/nextjs"
import { Skeleton } from "@/components/ui/skeleton"

export function HeaderUser() {
  const { user, isLoaded: userLoaded } = useUser()
  const { organization, isLoaded: orgLoaded } = useOrganization()

  if (!userLoaded || !orgLoaded) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex items-center gap-4">
      {user && (
        <OrganizationSwitcher
          appearance={{
            elements: {
              rootBox: "flex items-center",
              organizationSwitcherTrigger: "p-2 rounded-md hover:bg-accent",
              organizationSwitcherTriggerIcon: "text-muted-foreground",
            }
          }}
          createOrganizationMode="navigation"
          createOrganizationUrl="/app/create-organization"
          organizationProfileMode="navigation"
          organizationProfileUrl="/app/organization-profile"
          hidePersonal={false}
        />
      )}

      <UserButton
        appearance={{
          elements: {
            avatarBox: "h-8 w-8",
            userButtonPopoverCard: "bg-popover border border-border",
            userButtonPopoverActionButton: "hover:bg-accent",
          }
        }}
        userProfileMode="navigation"
        userProfileUrl="/app/user-profile"
        afterSignOutUrl="/"
      />
    </div>
  )
}

