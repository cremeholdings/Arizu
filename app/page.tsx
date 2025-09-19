"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useOnboardingStore } from "@/stores/onboarding"
import { useUIStore } from "@/stores/ui"

export default function HomePage() {
  const { currentStep, steps } = useOnboardingStore()
  const { setDialog, dialogs } = useUIStore()

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-foreground">
            Hello, Arizu!
          </h1>
          <p className="text-lg text-muted-foreground">
            Natural language automations platform
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Design System Demo</CardTitle>
              <CardDescription>
                shadcn/ui components with Tailwind CSS
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Button variant="default">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
              </div>
              <Input placeholder="Enter text here..." />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Zustand State Demo</CardTitle>
              <CardDescription>
                Onboarding progress and UI state management
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Current onboarding step: {currentStep + 1} of {steps.length}
                </p>
                <p className="font-medium">{steps[currentStep]?.title}</p>
                <p className="text-sm text-muted-foreground">
                  {steps[currentStep]?.description}
                </p>
              </div>
              <Button
                onClick={() => setDialog("upgradeDialog", !dialogs.upgradeDialog)}
                variant="outline"
                size="sm"
              >
                Toggle Upgrade Dialog: {dialogs.upgradeDialog ? "Open" : "Closed"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>
              Ready to build your first automation?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Button>Sign Up</Button>
              <Button variant="outline">Learn More</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}