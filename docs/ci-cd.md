# CI/CD Documentation

This document explains the Continuous Integration and Continuous Deployment setup for Arizu.

## Overview

Our CI/CD pipeline consists of two main workflows:

1. **CI Pipeline** - Runs on pull requests and pushes to validate code quality
2. **Deploy Pipeline** - Deploys to production on main branch pushes

## CI Pipeline (`.github/workflows/ci.yml`)

### Triggers
- Pull requests against `main` and `develop` branches
- Direct pushes to `main` and `develop` branches

### Jobs

#### Build and Test
- **Node.js**: Uses Node.js 20 with pnpm package manager
- **Type Checking**: Runs `pnpm typecheck` to validate TypeScript
- **Build**: Runs `pnpm build` to ensure production build succeeds
- **Tests**: Runs `pnpm test --if-present` if tests are configured
- **Linting**: Runs `pnpm lint --if-present` if ESLint is configured

#### Security Scan (PR only)
- **Trivy Scanner**: Scans filesystem for vulnerabilities
- **SARIF Upload**: Uploads results to GitHub Security tab

## Deploy Pipeline (`.github/workflows/deploy.yml`)

### Triggers
- Pushes to `main` branch only

### Jobs

#### Vercel Deployment
- **Production Deploy**: Uses Vercel Action to deploy to production
- **Required Secrets**: See [GitHub Secrets](#github-secrets) section

#### Post-Deploy Smoke Tests
- **Application Tests**: Validates `/api/health` endpoint and core functionality
- **n8n Tests**: Verifies workflow engine connectivity and API access
- **Timeout**: 30-second timeout for network requests

#### Canary Deployment (10% Traffic)
- **Traffic Splitting**: Routes 10% of traffic to new deployment
- **Monitoring Period**: 5-minute observation window
- **Health Validation**: Continuous health checks during canary phase
- **Automatic Rollback**: Triggers if health checks fail

#### Promotion to 100%
- **Manual Approval**: Requires manual approval via GitHub environment protection
- **Full Traffic**: Promotes deployment to 100% traffic after validation
- **Final Smoke Tests**: Comprehensive testing after full promotion

#### Rollback on Failure
- **Automatic Rollback**: Triggers if canary or promotion fails
- **Traffic Restoration**: Immediately restores previous stable deployment
- **Notification**: Alerts team of rollback via Slack

#### Deployment Notification
- **Slack Notification**: Posts deployment status to #deployments channel (optional)
- **Status Updates**: Canary start, promotion, and final completion notifications

## GitHub Secrets

The following secrets must be configured in your GitHub repository settings:

### Required for Deployment
```
VERCEL_TOKEN          # Vercel CLI token for deployments
VERCEL_ORG_ID         # Your Vercel organization ID
VERCEL_PROJECT_ID     # Your Vercel project ID
```

### Optional for Canary Deployments
```
VERCEL_EDGE_CONFIG_ID # Vercel Edge Config ID for traffic splitting (Pro plan)
N8N_URL               # n8n instance URL for smoke tests
N8N_API_KEY           # n8n API key for authenticated testing
```

### Optional for Notifications
```
SLACK_WEBHOOK_URL     # Slack webhook URL for deployment notifications
```

## Setting Up GitHub Secrets

1. **Get Vercel Credentials**:
   ```bash
   # Install Vercel CLI
   npm i -g vercel

   # Login and get credentials
   vercel login
   vercel link

   # Get org and project IDs
   cat .vercel/project.json
   ```

2. **Add Secrets to GitHub**:
   - Go to your repository → Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Add each required secret

## Vercel Configuration

### Environment Variables
Configure these in your Vercel dashboard:

**Production Environment:**
- Copy values from `.env.production.example`
- Set all required API keys and database URLs
- Configure Clerk, Stripe, and LLM provider keys

**Preview Environment (optional):**
- Copy values from `.env.staging.example`
- Use test/staging credentials

### Domain Configuration
- **Production**: `arizu.com`
- **Preview**: `staging.arizu.com` (optional)

## Branch Strategy

```
main        # Production deployments
├── develop # Integration branch (optional)
└── feature /* # Feature branches
```

### Workflow
1. **Feature Development**: Create feature branch from `main`
2. **Pull Request**: Open PR against `main`
3. **CI Validation**: Wait for CI checks to pass
4. **Code Review**: Get approval from team members
5. **Merge**: Merge to `main` triggers production deployment

## Local Development

### Prerequisites
```bash
# Use correct Node version
nvm use  # Reads from .nvmrc

# Install dependencies
pnpm install

# Copy environment
cp .env.example .env.local
```

### Scripts
```bash
# Development
pnpm dev

# Type checking
pnpm typecheck

# Build production
pnpm build

# Run tests
pnpm test

# Linting
pnpm lint
```

## Monitoring Deployments

### Vercel Dashboard
- **Deployments**: View deployment history and logs
- **Functions**: Monitor serverless function performance
- **Analytics**: Track usage and performance metrics

### GitHub Actions
- **Actions Tab**: View workflow runs and logs
- **Security Tab**: View security scan results
- **Pull Requests**: See CI status checks

## Troubleshooting

### Common Issues

#### CI Failures
1. **Type Errors**: Run `pnpm typecheck` locally to reproduce
2. **Build Failures**: Run `pnpm build` locally to debug
3. **Dependency Issues**: Clear cache with `pnpm store prune`

#### Deployment Failures
1. **Missing Secrets**: Verify all required secrets are configured
2. **Environment Variables**: Check Vercel dashboard environment settings
3. **Build Timeout**: Consider optimizing build process or increasing Vercel timeout

#### Vercel Configuration
1. **Domain Issues**: Check DNS configuration and Vercel domain settings
2. **Function Timeouts**: Review `vercel.json` function configuration
3. **Build Settings**: Verify build command and output directory

### Debug Commands
```bash
# Local type checking
pnpm typecheck

# Local build
pnpm build

# Vercel preview deployment
vercel

# Vercel production deployment
vercel --prod

# Check Vercel logs
vercel logs [deployment-url]
```

## Security Considerations

1. **Never commit secrets** to the repository
2. **Use GitHub Secrets** for all sensitive configuration
3. **Enable branch protection** on main branch
4. **Require status checks** before merging
5. **Regular security scans** via Trivy integration

## Performance Optimization

1. **Build Caching**: Vercel automatically caches `node_modules`
2. **Incremental Builds**: Next.js incremental static regeneration
3. **Function Optimization**: Configure appropriate timeout values
4. **Asset Optimization**: Vercel automatic image and asset optimization

## Canary Deployment Strategy

### Overview
Canary deployments reduce risk by gradually rolling out changes to a small percentage of users before full deployment.

### Workflow Steps
1. **Deploy**: Standard Vercel deployment to production
2. **Smoke Tests**: Automated health and functionality checks
3. **Canary (10%)**: Route 10% of traffic to new deployment
4. **Monitor**: 5-minute observation period with health validation
5. **Manual Approval**: GitHub environment protection requires approval
6. **Promote (100%)**: Full traffic routing to new deployment
7. **Final Tests**: Comprehensive smoke tests on full traffic

### Traffic Routing Methods

#### Option 1: Vercel Edge Config (Pro Plan)
```bash
# Setup Edge Config for canary routing
vercel env add VERCEL_EDGE_CONFIG_ID your-edge-config-id

# The workflow automatically updates these values:
# - canary_enabled: true/false
# - canary_percentage: 0-100
```

#### Option 2: Header-Based Routing (All Plans)
Uses `x-canary` header for traffic routing via middleware or edge functions.

### Manual Approval Setup

1. **Create Production Environment**:
   - Go to repository → Settings → Environments
   - Create environment named "production"
   - Add protection rules:
     - Required reviewers (recommended: 2)
     - Wait timer: 0 minutes
     - Deployment branches: main only

2. **Configure Reviewers**:
   - Add team members who can approve deployments
   - Consider requiring code owners for approval

### Rollback Procedures

#### Automatic Rollback
- Triggers on canary health check failures
- Immediately disables canary routing
- Restores traffic to previous stable deployment

#### Manual Rollback
```bash
# Emergency rollback via Vercel CLI
vercel rollback [deployment-url] --prod

# Or via GitHub Actions
# Go to Actions → Re-run "rollback" job
```

### Monitoring Canary Deployments

#### Vercel Dashboard
- **Analytics**: Monitor error rates and performance metrics
- **Functions**: Track serverless function performance
- **Edge Network**: Monitor global performance

#### Health Checks
- Automated health endpoint monitoring
- Component status validation (DB, Redis, n8n)
- SLO compliance checking

#### Metrics to Monitor
- **Error Rate**: Should remain <1% during canary
- **Latency**: P95 should stay within SLO targets
- **Success Rate**: Health checks should maintain >99%

### Canary Decision Criteria

#### Promote to 100% if:
- ✅ Error rate <1% during 5-minute window
- ✅ Health checks passing consistently
- ✅ No critical alerts triggered
- ✅ Manual approval received

#### Rollback if:
- ❌ Error rate >5% for 2+ minutes
- ❌ Health checks failing
- ❌ Critical component failures
- ❌ Manual rollback requested

### Example Canary Session

```
14:00 - Deployment starts
14:02 - Vercel deployment complete
14:03 - Smoke tests pass
14:04 - Canary starts (10% traffic)
14:05 - Health monitoring begins
14:09 - 5-minute observation complete
14:10 - Manual approval requested
14:15 - Approval granted
14:16 - Promotion to 100% starts
14:17 - Final smoke tests pass
14:18 - Deployment complete
```

## Monitoring and Alerting

Configure monitoring for:
- **Deployment Failures**: GitHub notifications + Slack
- **Canary Health**: Real-time health check monitoring
- **Build Performance**: Track build times in Vercel
- **Runtime Errors**: Application monitoring (Sentry, etc.)
- **Uptime Monitoring**: External service monitoring

---

For questions or issues with CI/CD setup, please contact the development team or create an issue in the repository.