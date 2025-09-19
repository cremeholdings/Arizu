# Claude Code / Codex System Prompt for This Project

You are helping me build a SaaS web app that turns **natural-language requests into working automations**.

---

## 📦 Tech Stack
- **Frontend:** Next.js 14 (App Router, TypeScript, RSC), TailwindCSS, shadcn/ui, Zustand (client state only).
- **Backend:** Next.js API routes (Fastify-inspired handlers if needed), Prisma + Postgres (multi-tenant), Redis (rate limits, queues).
- **Automation Engine:** n8n (workflow execution via REST API).
- **Infra & Hosting:** Vercel (app hosting), DigitalOcean or similar for n8n via Docker Compose + Traefik.
- **Auth:** Clerk (users + organizations).
- **Payments:** Stripe.
- **LLMs:** Anthropic, OpenAI, Google Gemini, Mistral (provider-agnostic).
- **Tooling:** GitHub Actions (CI/CD), pnpm, Prisma Studio.

---

## 🏗️ Architecture
- **Multi-tenancy:** Users belong to Orgs (Clerk is source of truth). Minimal org data mirrored in DB for plan/limits/usage.
- **Auth:** Clerk-hosted sign-in/up, MFA/passkeys, org switcher. Guards enforce org & role access.
- **NL → Plan Flow:** LLM converts prompt → `Plan` JSON (AJV schema) → Validator → Compiler (n8n JSON) → Deployer (REST).
- **Limits:** Usage & limits enforced per Plan. Runs logged with PII redaction.
- **UI Flows:** Onboarding wizard, chat builder, templates gallery, plan settings, run logs.
- **Zustand usage:** onboarding progress & drafts, chat composer state, plan editor diffs, upgrade dialog visibility, run filters, template preview.

---

## 🔒 Safety Tail (apply to every response automatically)
1. **Build Gates:**  
   - Code must compile (`pnpm typecheck && pnpm build`).  
   - Update `.env.example` whenever a new env var is introduced.  
   - No missing imports or directories — create them.

2. **Tests & Contracts:**  
   - Preserve API shapes.  
   - Stable TypeScript exports.  
   - Use Vitest for any new test files.  
   - Mock externals (e.g. LLM, Clerk, Stripe) in tests.

3. **Security:**  
   - Never log secrets, API keys, or emails.  
   - Redact sensitive values in logs.  
   - Verify HMAC on all inbound webhooks.  
   - Enforce org/role checks on all server routes.  

4. **UX & Accessibility:**  
   - All UI must have loading, empty, and error states.  
   - Accessible by keyboard & screen reader.  
   - Copy is clear, friendly, professional.  

5. **Self-Critique:**  
   - At the end of each response, if anything is missing, provide an `UPDATE FILES:` patch immediately.  
   - Prefer precise patches over vague notes.

---

## 📐 Response Format Rules
- Return **only the files requested** (full contents).  
- For fixes, use `UPDATE FILES:` with patches.  
- No prose unless explicitly asked.  

---

## 🚦 Development Workflow
- Start with scaffolding prompts (P1–P7).  
- Then infra prompts (D1–D7).  
- Then reliability prompts (G1–G10).  
- Paste prompts in order; commit and run checks after each.  
- If session resets, re-apply this `PROMPT.md`.

---

**This file is the single source of truth. Always follow it when generating code for this project.**