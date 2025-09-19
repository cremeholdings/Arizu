# Make Operations Guide

This document provides a comprehensive reference for all Makefile commands available in the Arizu project.

## Quick Start

```bash
# Show all available commands
make help

# Start development environment
make dev-up

# Start production environment
make prod-up

# Check system status
make status
```

## Command Categories

### Development Environment

| Command | Description | Example |
|---------|-------------|---------|
| `dev-up` | Start development environment | `make dev-up` |
| `dev-down` | Stop development environment | `make dev-down` |
| `dev-logs` | Show development logs | `make dev-logs` |
| `dev-restart` | Restart development environment | `make dev-restart` |
| `quick-dev` | Setup + start development | `make quick-dev` |

**Development Services:**
- **App**: http://localhost:3000
- **n8n**: http://localhost:5678
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### Production Environment

| Command | Description | Example |
|---------|-------------|---------|
| `prod-up` | Start production environment | `make prod-up` |
| `prod-down` | Stop production environment | `make prod-down` |
| `prod-logs` | Show production logs | `make prod-logs` |
| `prod-restart` | Restart production environment | `make prod-restart` |
| `quick-prod` | Setup + start production | `make quick-prod` |

### Logging

| Command | Description | Example |
|---------|-------------|---------|
| `logs` | Show n8n logs (production) | `make logs` |
| `logs-dev` | Show n8n logs (development) | `make logs-dev` |
| `logs-app` | Show app logs | `make logs-app` |
| `logs-db` | Show database logs | `make logs-db` |
| `logs-redis` | Show Redis logs | `make logs-redis` |

### Backup & Restore

| Command | Description | Example |
|---------|-------------|---------|
| `backup` | Create backup of n8n and database | `make backup` |
| `restore` | Restore from backup | `make restore BACKUP_FILE=backups/backup.tar.gz` |
| `backup-list` | List available backups | `make backup-list` |
| `quick-backup` | Backup + list | `make quick-backup` |

**Backup Examples:**
```bash
# Create backup
make backup

# List backups
make backup-list

# Restore specific backup
make restore BACKUP_FILE=backups/n8n-backup-2024-01-15.tar.gz

# Quick backup and list
make quick-backup
```

### Health & Status

| Command | Description | Example |
|---------|-------------|---------|
| `health` | Check system health | `make health` |
| `status` | Show container status | `make status` |
| `check-env` | Check environment files | `make check-env` |
| `setup-env` | Copy environment templates | `make setup-env` |

**Health Check Output:**
```json
{
  "ok": true,
  "components": {
    "db": "ok",
    "redis": "ok",
    "n8n": "ok"
  },
  "slo": {
    "availability_app_pct": 99.9,
    "latency_app_p95_ms": 500
  }
}
```

### Application Development

| Command | Description | Example |
|---------|-------------|---------|
| `install` | Install dependencies | `make install` |
| `dev` | Start development server | `make dev` |
| `build` | Build application | `make build` |
| `test` | Run tests | `make test` |
| `lint` | Run linting | `make lint` |
| `typecheck` | Run type checking | `make typecheck` |

### Database Operations

| Command | Description | Example |
|---------|-------------|---------|
| `db-shell` | Connect to database shell | `make db-shell` |
| `db-migrate` | Run database migrations | `make db-migrate` |
| `db-reset` | Reset database | `make db-reset` |
| `db-seed` | Seed database | `make db-seed` |

**Database Examples:**
```bash
# Connect to PostgreSQL
make db-shell

# Run migrations
make db-migrate

# Reset and seed database
make db-reset
make db-seed
```

### Redis Operations

| Command | Description | Example |
|---------|-------------|---------|
| `redis-shell` | Connect to Redis shell | `make redis-shell` |
| `redis-flush` | Flush Redis cache | `make redis-flush` |

**Redis Examples:**
```bash
# Connect to Redis CLI
make redis-shell

# Clear all cache
make redis-flush
```

### n8n Operations

| Command | Description | Example |
|---------|-------------|---------|
| `n8n-shell` | Connect to n8n container shell | `make n8n-shell` |
| `n8n-export` | Export n8n workflows | `make n8n-export` |

### Cleanup & Maintenance

| Command | Description | Example |
|---------|-------------|---------|
| `clean` | Clean up containers and volumes | `make clean` |
| `clean-all` | Clean everything including images | `make clean-all` |

**Cleanup Examples:**
```bash
# Basic cleanup (containers and volumes)
make clean

# Deep cleanup (everything including images)
make clean-all
```

### Security & SSL

| Command | Description | Example |
|---------|-------------|---------|
| `ssl-cert` | Generate SSL certificate for development | `make ssl-cert` |

**SSL Certificate:**
Creates self-signed certificate in `certs/` directory for local HTTPS development.

### Monitoring

| Command | Description | Example |
|---------|-------------|---------|
| `monitor` | Start monitoring dashboard | `make monitor` |
| `monitor-down` | Stop monitoring | `make monitor-down` |

**Monitoring Services:**
- **Grafana**: http://localhost:3001
- **Prometheus**: http://localhost:9090

### Chaos Engineering

| Command | Description | Example |
|---------|-------------|---------|
| `chaos-test` | Run chaos engineering tests | `make chaos-test` |

**Chaos Tests Include:**
- n8n service disruption
- LLM provider blocking
- Redis latency simulation

⚠️ **Warning**: Chaos tests will temporarily disrupt services.

### Help Commands

| Command | Description | Example |
|---------|-------------|---------|
| `help` | Show all commands | `make help` |
| `help-dev` | Show development commands | `make help-dev` |
| `help-prod` | Show production commands | `make help-prod` |
| `help-ops` | Show operations commands | `make help-ops` |

## Common Workflows

### Development Setup
```bash
# First time setup
make setup-env
make install
make dev-up

# Daily development
make dev-up
make dev-logs  # In another terminal

# When done
make dev-down
```

### Production Deployment
```bash
# Setup production
make setup-env
make prod-up
make health

# Monitor
make prod-logs

# Backup before changes
make backup

# After updates
make prod-restart
make health
```

### Troubleshooting
```bash
# Check what's running
make status

# Check system health
make health

# Check environment setup
make check-env

# View logs
make logs
make logs-app
make logs-db

# Clean up issues
make clean
```

### Backup & Recovery
```bash
# Regular backup
make backup

# List backups
make backup-list

# Emergency restore
make prod-down
make restore BACKUP_FILE=backups/latest-backup.tar.gz
make prod-up
make health
```

## Environment Files

### Required Files
- `.env.docker.dev` - Development environment variables
- `.env.docker.prod` - Production environment variables

### Setup Commands
```bash
# Check if environment files exist
make check-env

# Create from templates
make setup-env
```

### Manual Setup
```bash
# Development
cp .env.example .env.docker.dev

# Production
cp .env.production.example .env.docker.prod
```

## Docker Compose Files

The Makefile assumes these Docker Compose files:
- `docker-compose.dev.yml` - Development services
- `docker-compose.prod.yml` - Production services
- `docker-compose.monitoring.yml` - Monitoring stack (optional)

## Utility Scripts

### wait-for-it.sh
TCP service availability checker used by health checks.

**Usage:**
```bash
# Wait for service to be available
scripts/wait-for-it.sh localhost:3000 -- 30

# Used internally by make health
scripts/wait-for-it.sh localhost:3000 -- 30 && curl -s http://localhost:3000/api/health
```

## Tips & Best Practices

### Performance
- Use `make quick-dev` for fast development setup
- Use `make clean` regularly to free disk space
- Monitor logs with `make logs` during development

### Safety
- Always run `make backup` before major changes
- Use `make health` to verify system state
- Test changes in development before production

### Debugging
- Use `make status` to see what's running
- Check logs with service-specific commands
- Use `make db-shell` or `make redis-shell` for direct access

### Environment Management
- Keep `.env.docker.*` files secure and out of version control
- Use `make check-env` to verify configuration
- Update environment templates when adding new variables

## Error Handling

### Common Issues

**Services won't start:**
```bash
make status
make logs
make clean
make dev-up
```

**Database connection issues:**
```bash
make db-shell
make logs-db
```

**Redis connection issues:**
```bash
make redis-shell
make logs-redis
```

**Health check failures:**
```bash
make health
make status
make logs
```

### Recovery Steps
1. Check status: `make status`
2. View logs: `make logs`
3. Clean up: `make clean`
4. Restart: `make dev-restart` or `make prod-restart`
5. Verify: `make health`

---

For additional help, run `make help` or check the project documentation.