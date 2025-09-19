import { IncidentBanner } from '@/components/IncidentBanner'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <IncidentBanner />
      {children}
    </div>
  )
}