# Contributing Guide

Welcome 👋 This project is a SaaS platform that lets users describe automations in natural language, which are then validated, compiled, and deployed into **n8n workflows**.

---

## 🏗 Project Structure

- `app/` — Next.js App Router pages (UI + API routes).
- `components/` — shadcn/ui and custom React components.
- `lib/` — Backend/business logic (auth, plan validation, compiler, LLM clients, health checks).
- `stores/` — Zustand slices (onboarding, chat composer, plan UI, filters).
- `prisma/` — DB schema + migrations.
- `tests/` — Vitest unit/integration tests.
- `config/` — Static config files (e.g. `slo.json`).
- `scripts/` — Ops/dev scripts (backups, chaos, smoke).
- `docs/` — Developer/ops docs.
- `docker-compose.*.yml` — Local + prod docker setups (n8n, Postgres, Redis).
- `traefik/` — Reverse proxy + TLS for prod n8n.

---

## ⚙️ Setup

### 1. Prereqs
- Node.js 20 (use `.nvmrc`)
- pnpm (see `package.json`)
- Docker + Docker Compose (for local infra)
- Postgres + Redis (dev via `docker-compose.dev.yml`)

### 2. Clone & install
```bash
git clone <repo>
cd <repo>
pnpm install