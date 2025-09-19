# n8n CI/CD Documentation

This document explains how to build, push, and deploy custom n8n images using GitHub Actions.

## Overview

The n8n deployment workflow allows you to:
1. Build custom n8n Docker images with your modifications
2. Push images to your container registry
3. Deploy to staging or production servers via SSH
4. Perform health checks and cleanup

## Workflow Configuration

### Trigger
The workflow is triggered manually via GitHub Actions UI with these inputs:
- **tag**: Image tag (e.g., `main`, `v1.0.0`, `hotfix-123`)
- **environment**: Target environment (`staging` or `production`)

### Jobs
1. **build-push**: Builds and pushes Docker image to registry
2. **remote-deploy**: Deploys to target server via SSH
3. **notify**: Sends deployment status to Slack (optional)

## Required GitHub Secrets

Configure these secrets in your GitHub repository settings:

### Container Registry
```
REGISTRY              # Container registry URL (e.g., ghcr.io, registry.gitlab.com)
IMAGE                 # Image name (e.g., arizu/n8n-custom)
REGISTRY_USER         # Registry username
REGISTRY_TOKEN        # Registry access token or password
```

### SSH Access
```
SSH_HOST_STAGING      # Staging server hostname or IP
SSH_HOST_PRODUCTION   # Production server hostname or IP
SSH_USER              # SSH username (same for both environments)
SSH_KEY               # SSH private key (RSA/ED25519)
SSH_PORT              # SSH port (optional, defaults to 22)
```

### Server Paths
```
COMPOSE_PATH_STAGING     # Path to staging docker-compose files
COMPOSE_PATH_PRODUCTION  # Path to production docker-compose files
```

### Optional Notifications
```
SLACK_WEBHOOK_URL     # Slack webhook for deployment notifications
```

## Setting Up Secrets

### 1. Container Registry Setup

#### GitHub Container Registry (ghcr.io)
```bash
# Generate personal access token with packages:write scope
# Go to GitHub Settings → Developer settings → Personal access tokens

# Set secrets:
REGISTRY=ghcr.io
IMAGE=yourusername/arizu-n8n
REGISTRY_USER=yourusername
REGISTRY_TOKEN=ghp_xxxxxxxxxxxx
```

#### Docker Hub
```bash
# Set secrets:
REGISTRY=docker.io
IMAGE=yourusername/arizu-n8n
REGISTRY_USER=yourusername
REGISTRY_TOKEN=dckr_pat_xxxxxxxxxxxx
```

### 2. SSH Key Setup

```bash
# Generate SSH key pair (if not exists)
ssh-keygen -t ed25519 -C "github-actions@arizu.com" -f ~/.ssh/arizu-deploy

# Copy public key to servers
ssh-copy-id -i ~/.ssh/arizu-deploy.pub user@staging-server
ssh-copy-id -i ~/.ssh/arizu-deploy.pub user@production-server

# Add private key to GitHub Secrets (SSH_KEY)
cat ~/.ssh/arizu-deploy
```

### 3. Server Configuration

#### Staging Server Secrets
```
SSH_HOST_STAGING=staging.yourcompany.com
COMPOSE_PATH_STAGING=/opt/arizu/staging
```

#### Production Server Secrets
```
SSH_HOST_PRODUCTION=production.yourcompany.com
COMPOSE_PATH_PRODUCTION=/opt/arizu/production
```

## Custom n8n Dockerfile

If you need to customize the n8n image, create this directory structure:

```
./n8n/
├── Dockerfile
├── custom-nodes/
├── scripts/
└── config/
```

### Example Dockerfile

```dockerfile
# ./n8n/Dockerfile
FROM n8nio/n8n:latest

# Set user to root for installation
USER root

# Install additional system packages
RUN apk add --no-cache \
    git \
    python3 \
    py3-pip \
    build-base

# Install custom n8n nodes
COPY custom-nodes/ /tmp/custom-nodes/
RUN cd /tmp/custom-nodes && \
    npm install -g . && \
    rm -rf /tmp/custom-nodes

# Install additional npm packages
RUN npm install -g \
    @n8n/nodes-langchain \
    n8n-nodes-playwright

# Copy custom scripts
COPY scripts/ /opt/custom-scripts/
RUN chmod +x /opt/custom-scripts/*.sh

# Copy configuration files
COPY config/ /opt/custom-config/

# Set back to n8n user
USER node

# Set environment variables
ENV N8N_CUSTOM_EXTENSIONS="/opt/custom-config"
ENV N8N_NODES_INCLUDE="['@n8n/nodes-langchain','n8n-nodes-playwright']"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:5678/healthz || exit 1
```

### Custom Node Example

```javascript
// ./n8n/custom-nodes/package.json
{
  "name": "n8n-nodes-arizu-custom",
  "version": "1.0.0",
  "description": "Custom nodes for Arizu",
  "main": "index.js",
  "n8n": {
    "nodes": ["dist/nodes/ArizuWebhook/ArizuWebhook.node.js"],
    "credentials": ["dist/credentials/ArizuApi.credentials.js"]
  }
}
```

## Manual Deployment

### Via GitHub Actions UI
1. Go to Actions tab in your repository
2. Select "n8n Deploy" workflow
3. Click "Run workflow"
4. Select environment and enter image tag
5. Click "Run workflow"

### Via GitHub CLI
```bash
# Deploy to staging
gh workflow run n8n-deploy.yml \
  -f tag=main \
  -f environment=staging

# Deploy to production
gh workflow run n8n-deploy.yml \
  -f tag=v1.2.3 \
  -f environment=production
```

## Expected Outputs

### Successful Build
```
✅ Successfully built and pushed image
Registry: ghcr.io
Image: arizu/n8n-custom
Tag: main
Environment: staging
```

### Successful Deployment
```
🚀 Starting n8n deployment to staging...
📦 Pulling n8n image...
💾 Creating backup...
🛑 Stopping n8n service...
▶️ Starting n8n service...
🔍 Waiting for n8n to be healthy...
🧹 Cleaning up old images...
✅ n8n staging deployment completed successfully
```

### Health Check
The deployment includes automatic health checks:
- Waits up to 120 seconds for n8n to respond
- Checks `/healthz` endpoint
- Shows container logs if health check fails

## Server Requirements

### Directory Structure
```
/opt/arizu/staging/
├── docker-compose.staging.yml
├── .env.docker.staging
├── backups/
└── scripts/
    └── n8n-backup.sh

/opt/arizu/production/
├── docker-compose.prod.yml
├── .env.docker.prod
├── backups/
└── scripts/
    └── n8n-backup.sh
```

### Environment File Example
```bash
# .env.docker.staging
N8N_IMAGE_TAG=main
N8N_PORT=5678
DB_POSTGRESDB_HOST=db
DB_POSTGRESDB_PASSWORD=secure_password
WEBHOOK_URL=https://staging.arizu.com
```

### Docker Compose Example
```yaml
# docker-compose.staging.yml
version: '3.8'
services:
  n8n:
    image: ${REGISTRY}/${IMAGE}:${N8N_IMAGE_TAG:-latest}
    container_name: n8n-staging
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=${WEBHOOK_URL}
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - NODE_ENV=production
      - WEBHOOK_URL=${WEBHOOK_URL}
      - GENERIC_TIMEZONE=UTC
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      - db
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5678/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

volumes:
  n8n_data:
```

## Troubleshooting

### Build Failures
```bash
# Check Dockerfile syntax
docker build --no-cache -t test ./n8n/

# Debug build process
docker build --progress=plain --no-cache ./n8n/
```

### Registry Issues
```bash
# Test registry login
echo $REGISTRY_TOKEN | docker login $REGISTRY -u $REGISTRY_USER --password-stdin

# Check image exists
docker pull $REGISTRY/$IMAGE:$TAG
```

### SSH Connection Issues
```bash
# Test SSH connection
ssh -i ~/.ssh/arizu-deploy user@server "echo 'Connection successful'"

# Check SSH key format
ssh-keygen -l -f ~/.ssh/arizu-deploy
```

### Deployment Failures
```bash
# Check server logs
ssh user@server "cd /opt/arizu/staging && docker compose logs n8n"

# Check disk space
ssh user@server "df -h"

# Check service status
ssh user@server "cd /opt/arizu/staging && docker compose ps"
```

## Security Best Practices

1. **Use least-privilege SSH keys**: Create dedicated deploy keys
2. **Rotate secrets regularly**: Update registry tokens and SSH keys
3. **Limit SSH access**: Use firewall rules and fail2ban
4. **Secure registries**: Use private registries for custom images
5. **Monitor deployments**: Set up alerts for failed deployments

## Monitoring

### Post-Deployment Checks
- Health endpoint responds: `curl -f https://workflows.arizu.com/healthz`
- Workflows execute successfully
- Database connections stable
- No memory/CPU spikes

### Rollback Procedure
If deployment fails:
1. SSH to affected server
2. Check previous image tag in logs
3. Update environment variable: `export N8N_IMAGE_TAG=previous-tag`
4. Restart service: `docker compose up -d n8n`
5. Verify health check passes

---

For questions about n8n deployment, contact the infrastructure team or create an issue in the repository.