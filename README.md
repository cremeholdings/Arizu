# Arizu

Natural language automations platform that turns requests into working automations.

## Stack

- **Frontend**: Next.js 14 (App Router, TypeScript, RSC)
- **Styling**: TailwindCSS + shadcn/ui
- **Database**: Prisma + PostgreSQL (multi-tenant)
- **Cache**: Redis (rate limits, queues)
- **Workflows**: n8n (workflow engine via REST)
- **Hosting**: Vercel
- **Auth**: Clerk (auth + organizations)
- **Billing**: Stripe
- **State**: Zustand (lightweight client UI state only)

## Local Development Setup

### Prerequisites

- Node.js 18+ and pnpm
- PostgreSQL database
- Redis server

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd arizu
   pnpm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env.local
   ```

   Update `.env.local` with your database connection string and other required variables.

3. **Set up the database:**
   ```bash
   # Generate Prisma client
   pnpm db:generate

   # Push schema to database (for development)
   pnpm db:push

   # Or run migrations (for production)
   pnpm db:migrate
   ```

4. **Start the development server:**
   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

### Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm db:generate` - Generate Prisma client
- `pnpm db:push` - Push schema to database
- `pnpm db:migrate` - Run database migrations
- `pnpm db:studio` - Open Prisma Studio

### Architecture

This is a multi-tenant SaaS application where:

- Users belong to Organizations (Clerk as source of truth)
- Minimal org data is mirrored in our database for plan/limits/usage tracking
- Natural language requests are converted to executable automation plans
- Plans are compiled to n8n workflows and deployed via REST API
- Usage and limits are enforced per organization plan
- All runs are logged with PII redaction for security

## Design System

### UI Components

The app uses shadcn/ui components with Tailwind CSS for consistent design:

```tsx
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

// Button variants
<Button variant="default">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Destructive</Button>

// Card layout
<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
  </CardHeader>
  <CardContent>
    <p>Card content goes here</p>
  </CardContent>
</Card>

// Input with proper styling
<Input placeholder="Enter text..." />
```

### State Management

Zustand stores are organized by domain:

```tsx
// Onboarding state (persisted to sessionStorage)
import { useOnboardingStore } from "@/stores/onboarding"

function OnboardingComponent() {
  const { currentStep, markStepCompleted, updateDraft } = useOnboardingStore()

  return (
    <div>Step {currentStep + 1}</div>
  )
}

// UI state (dialogs, filters, etc.)
import { useUIStore } from "@/stores/ui"

function UpgradeButton() {
  const { setDialog } = useUIStore()

  return (
    <Button onClick={() => setDialog("upgradeDialog", true)}>
      Upgrade Plan
    </Button>
  )
}
```

### Development Guidelines

- TypeScript everywhere; no `any` types
- Update `.env.example` when adding new environment variables
- Redact PII/secrets in logs; never log tokens/emails
- API routes return typed JSON with `ok`/`error` fields
- UI components handle loading/empty/error states
- Use accessible components only
- Zustand stores persist onboarding progress; UI state is ephemeral
- Use sessionStorage for harmless drafts only