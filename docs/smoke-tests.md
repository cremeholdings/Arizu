# Smoke Tests Documentation

This document explains how to use the post-deployment smoke tests to verify that both the application and n8n are functioning correctly after deployment.

## Overview

Smoke tests are lightweight, automated tests that verify basic functionality after deployment. They help catch critical issues early and provide confidence that the deployment was successful.

Our smoke tests cover:
- **Application Health**: Core app endpoints and health checks
- **n8n Connectivity**: Workflow engine availability and API functionality
- **Component Integration**: Database, Redis, and external service connectivity

## Test Scripts

### Application Smoke Test (`scripts/smoke-app.sh`)

Tests the main application for:
- Root endpoint accessibility
- Health check endpoint (`/api/health`)
- Component status (database, Redis, n8n)
- Status page availability
- SSL certificate validation (for HTTPS)
- SLO metrics availability

### n8n Smoke Test (`scripts/smoke-n8n.sh`)

Tests the n8n workflow engine for:
- Health endpoint (`/healthz`)
- Version endpoint (`/rest/version`)
- API settings accessibility
- Workflow API functionality (if API key provided)

## Environment Variables

### Required Variables

#### Application Tests
```bash
APP_URL="https://arizu.com"          # Application base URL
```

#### n8n Tests
```bash
N8N_URL="https://workflows.arizu.com" # n8n instance URL
```

### Optional Variables

```bash
# Timeouts
APP_TIMEOUT=10                       # App request timeout (seconds)
N8N_TIMEOUT=10                       # n8n request timeout (seconds)

# Authentication
N8N_API_KEY="your-n8n-api-key"       # For authenticated n8n endpoints

# Output
SMOKE_VERBOSE=1                      # Enable verbose logging
```

## Usage Examples

### Basic Usage

```bash
# Test application
APP_URL=https://arizu.com ./scripts/smoke-app.sh

# Test n8n
N8N_URL=https://workflows.arizu.com ./scripts/smoke-n8n.sh

# Test both
APP_URL=https://arizu.com ./scripts/smoke-app.sh && \
N8N_URL=https://workflows.arizu.com ./scripts/smoke-n8n.sh
```

### Local Development

```bash
# Test local development environment
APP_URL=http://localhost:3000 ./scripts/smoke-app.sh
N8N_URL=http://localhost:5678 ./scripts/smoke-n8n.sh
```

### Production with Authentication

```bash
# Test production with n8n API key
APP_URL=https://arizu.com \
N8N_URL=https://workflows.arizu.com \
N8N_API_KEY=your-production-api-key \
./scripts/smoke-n8n.sh
```

### Verbose Output

```bash
# Enable detailed logging
APP_URL=https://arizu.com \
SMOKE_VERBOSE=1 \
./scripts/smoke-app.sh
```

## Sample Outputs

### Successful Application Test

```
🧪 Starting application smoke tests...
Target: https://arizu.com

📊 Smoke Test Results:
Duration: 3s
Tests run: 7
Failed: 0
✅ Application smoke tests PASSED
app OK
```

### Successful n8n Test

```
🧪 Starting n8n smoke tests...
Target: https://workflows.arizu.com

📊 Smoke Test Results:
Duration: 2s
Tests run: 4
Failed: 0
✅ n8n smoke tests PASSED
n8n OK
```

### Failed Test Example

```
🧪 Starting application smoke tests...
Target: https://staging.arizu.com

[ERROR] App health check failed - ok=false
Response: {"ok":false,"components":{"db":"down","redis":"ok","n8n":"ok"}}

📊 Smoke Test Results:
Duration: 5s
Tests run: 7
Failed: 1
❌ Application smoke tests FAILED
Failed tests: test_health
app health failed
```

### Verbose Output Example

```
🧪 Starting application smoke tests...
Target: https://arizu.com

[INFO] App URL: https://arizu.com
[INFO] Timeout: 10s
[INFO] Testing application root endpoint...
[INFO] Root endpoint accessible (HTTP 200)
[INFO] Testing application health endpoint...
[INFO] App health check passed
[INFO] Testing application component health...
[INFO] Component status - DB: ok, Redis: ok, n8n: ok
[INFO] Testing application version...
[INFO] App version: 1.2.3
[INFO] Testing public status page...
[INFO] Status page accessible (HTTP 200)
[INFO] Testing SSL certificate...
[INFO] SSL certificate appears valid
[INFO] Testing SLO metrics...
[INFO] SLO metrics available
[INFO] P95 latency metrics available

📊 Smoke Test Results:
Duration: 4s
Tests run: 7
Failed: 0
✅ Application smoke tests PASSED
app OK
```

## CI/CD Integration

### GitHub Actions

Add smoke tests as a post-deployment job:

```yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    # ... deployment steps

  smoke-tests:
    name: Post-Deploy Smoke Tests
    needs: deploy
    runs-on: ubuntu-latest
    if: success()

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y curl jq

      - name: Test application
        env:
          APP_URL: https://arizu.com
          APP_TIMEOUT: 30
        run: ./scripts/smoke-app.sh

      - name: Test n8n
        env:
          N8N_URL: https://workflows.arizu.com
          N8N_TIMEOUT: 30
          N8N_API_KEY: ${{ secrets.N8N_API_KEY }}
        run: ./scripts/smoke-n8n.sh

      - name: Notify on failure
        if: failure()
        uses: 8398a7/action-slack@v3
        with:
          status: failure
          text: "🚨 Smoke tests failed after deployment!"
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### Makefile Integration

Add to your Makefile:

```make
smoke-test: ## Run smoke tests
	@echo "🧪 Running smoke tests..."
	APP_URL=${APP_URL} ./scripts/smoke-app.sh
	N8N_URL=${N8N_URL} ./scripts/smoke-n8n.sh
	@echo "✅ All smoke tests passed"

smoke-prod: ## Run production smoke tests
	APP_URL=https://arizu.com \
	N8N_URL=https://workflows.arizu.com \
	$(MAKE) smoke-test

smoke-staging: ## Run staging smoke tests
	APP_URL=https://staging.arizu.com \
	N8N_URL=https://workflows.staging.arizu.com \
	$(MAKE) smoke-test
```

Usage:
```bash
# Test production
make smoke-prod

# Test staging
make smoke-staging

# Test with custom URLs
APP_URL=https://custom.com N8N_URL=https://n8n.custom.com make smoke-test
```

### Docker Integration

Create a smoke test container:

```dockerfile
# Dockerfile.smoke-tests
FROM alpine:latest

RUN apk add --no-cache curl jq bash

COPY scripts/smoke-*.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/smoke-*.sh

ENTRYPOINT ["/bin/bash"]
```

Run smoke tests in Docker:
```bash
# Build smoke test image
docker build -f Dockerfile.smoke-tests -t arizu/smoke-tests .

# Run tests
docker run --rm \
  -e APP_URL=https://arizu.com \
  -e N8N_URL=https://workflows.arizu.com \
  arizu/smoke-tests -c "smoke-app.sh && smoke-n8n.sh"
```

## Test Configuration

### Environment-Specific Settings

#### Development
```bash
# .env.smoke.dev
APP_URL=http://localhost:3000
N8N_URL=http://localhost:5678
APP_TIMEOUT=5
N8N_TIMEOUT=5
SMOKE_VERBOSE=1
```

#### Staging
```bash
# .env.smoke.staging
APP_URL=https://staging.arizu.com
N8N_URL=https://workflows.staging.arizu.com
APP_TIMEOUT=15
N8N_TIMEOUT=15
N8N_API_KEY=staging-api-key
```

#### Production
```bash
# .env.smoke.prod
APP_URL=https://arizu.com
N8N_URL=https://workflows.arizu.com
APP_TIMEOUT=30
N8N_TIMEOUT=30
N8N_API_KEY=production-api-key
```

Load environment:
```bash
# Source environment and run tests
source .env.smoke.prod
./scripts/smoke-app.sh && ./scripts/smoke-n8n.sh
```

## Dependencies

### Required Tools

Both scripts require:
- **curl**: HTTP client for making requests
- **jq**: JSON parser for response validation
- **bash**: Shell for script execution

### Installation

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install -y curl jq
```

#### Alpine Linux
```bash
apk add --no-cache curl jq bash
```

#### macOS
```bash
brew install curl jq
```

#### CentOS/RHEL
```bash
sudo yum install -y curl jq
```

## Troubleshooting

### Common Issues

#### Connection Timeouts
```bash
# Increase timeout for slow networks
APP_TIMEOUT=60 N8N_TIMEOUT=60 ./scripts/smoke-app.sh
```

#### SSL Certificate Issues
```bash
# Test with verbose SSL information
SMOKE_VERBOSE=1 APP_URL=https://arizu.com ./scripts/smoke-app.sh
```

#### Authentication Failures
```bash
# Verify API key is correct
N8N_API_KEY=your-key N8N_URL=https://n8n.com ./scripts/smoke-n8n.sh
```

#### Network Connectivity
```bash
# Test basic connectivity first
curl -I https://arizu.com
curl -I https://workflows.arizu.com
```

### Exit Codes

| Exit Code | Meaning |
|-----------|---------|
| 0 | All tests passed |
| 1 | One or more critical tests failed |

### Debugging

Enable verbose output:
```bash
SMOKE_VERBOSE=1 ./scripts/smoke-app.sh
```

Test individual endpoints manually:
```bash
# Test app health
curl -s https://arizu.com/api/health | jq .

# Test n8n version
curl -s https://workflows.arizu.com/rest/version | jq .
```

## Best Practices

### Timing
- Run smoke tests immediately after deployment
- Include in CI/CD pipeline as a required gate
- Set appropriate timeouts for your network conditions

### Monitoring
- Alert on smoke test failures
- Track smoke test duration trends
- Include in deployment metrics

### Maintenance
- Review and update tests when adding new endpoints
- Test the tests themselves in development
- Keep environment variables up to date

---

For questions about smoke tests, contact the development team or create an issue in the repository.