# Arizu Development Docker Stack

This document describes how to set up and use the local development Docker environment for Arizu, which includes n8n, PostgreSQL, and Redis.

## Quick Start

1. **Copy the environment file:**
   ```bash
   cp .env.docker.dev.example .env.docker.dev
   ```

2. **Start the development stack:**
   ```bash
   docker compose -f docker-compose.dev.yml --env-file .env.docker.dev up -d
   ```

3. **Access the services:**
   - n8n Web Interface: http://localhost:5678
   - PostgreSQL: localhost:5432
   - Redis: localhost:6379

## Services Overview

### n8n (Workflow Automation)
- **URL:** http://localhost:5678
- **Container:** `arizu_n8n_dev`
- **Image:** `n8nio/n8n:latest`
- **Data Volume:** `arizu_n8n_data_dev`
- **Features:**
  - Debug logging enabled
  - Metrics collection enabled
  - No authentication required (dev mode)
  - Webhook URL: http://localhost:5678

### PostgreSQL Database
- **Host:** localhost:5432
- **Container:** `arizu_postgres_dev`
- **Image:** `postgres:14`
- **Default Credentials:**
  - Database: `arizu_dev`
  - Username: `arizu_dev`
  - Password: `dev_password_123`
- **Data Volume:** `arizu_pg_data_dev`

### Redis Cache/Queue
- **Host:** localhost:6379
- **Container:** `arizu_redis_dev`
- **Image:** `redis:7-alpine`
- **Data Volume:** `arizu_redis_data_dev`
- **Configuration:**
  - Persistence enabled (AOF)
  - Max memory: 256MB
  - Eviction policy: allkeys-lru

## Commands Reference

### Starting Services

```bash
# Start all services in detached mode
docker compose -f docker-compose.dev.yml --env-file .env.docker.dev up -d

# Start with logs visible
docker compose -f docker-compose.dev.yml --env-file .env.docker.dev up

# Start specific service
docker compose -f docker-compose.dev.yml --env-file .env.docker.dev up -d postgres
```

### Monitoring Services

```bash
# View status of all services
docker compose -f docker-compose.dev.yml ps

# View logs for all services
docker compose -f docker-compose.dev.yml logs -f

# View logs for specific service
docker compose -f docker-compose.dev.yml logs -f n8n

# Check health status
docker compose -f docker-compose.dev.yml ps --format table
```

### Managing Services

```bash
# Stop all services
docker compose -f docker-compose.dev.yml down

# Stop and remove volumes (⚠️ This will delete all data!)
docker compose -f docker-compose.dev.yml down -v

# Restart a specific service
docker compose -f docker-compose.dev.yml restart n8n

# Rebuild services (if needed)
docker compose -f docker-compose.dev.yml up -d --build
```

### Database Operations

```bash
# Connect to PostgreSQL via Docker
docker exec -it arizu_postgres_dev psql -U arizu_dev -d arizu_dev

# Create a database backup
docker exec arizu_postgres_dev pg_dump -U arizu_dev arizu_dev > backup.sql

# Restore from backup
docker exec -i arizu_postgres_dev psql -U arizu_dev -d arizu_dev < backup.sql
```

### Redis Operations

```bash
# Connect to Redis CLI
docker exec -it arizu_redis_dev redis-cli

# Monitor Redis commands
docker exec -it arizu_redis_dev redis-cli monitor

# Check Redis info
docker exec -it arizu_redis_dev redis-cli info
```

## Volume Management

All data is persisted in named Docker volumes:

```bash
# List all volumes
docker volume ls | grep arizu

# Inspect volume details
docker volume inspect arizu_pg_data_dev
docker volume inspect arizu_redis_data_dev
docker volume inspect arizu_n8n_data_dev

# Backup volume data
docker run --rm -v arizu_pg_data_dev:/data -v $(pwd):/backup ubuntu tar czf /backup/pg_backup.tar.gz -C /data .

# Remove all volumes (⚠️ This will delete all data!)
docker volume rm arizu_pg_data_dev arizu_redis_data_dev arizu_n8n_data_dev
```

## Troubleshooting

### Common Issues

**1. Port conflicts**
```
Error: Port 5432 is already in use
```
Solution: Stop local PostgreSQL service or change port in docker-compose.dev.yml:
```yaml
ports:
  - "5433:5432"  # Use different host port
```

**2. Permission issues with volumes**
```
Error: Permission denied
```
Solution: Reset volume permissions:
```bash
docker compose -f docker-compose.dev.yml down -v
docker volume prune -f
docker compose -f docker-compose.dev.yml up -d
```

**3. n8n fails to start**
```
Error: Database connection failed
```
Solution: Check if PostgreSQL is healthy:
```bash
docker compose -f docker-compose.dev.yml ps postgres
docker compose -f docker-compose.dev.yml logs postgres
```

**4. Services start but are unhealthy**
```bash
# Check detailed health status
docker inspect arizu_postgres_dev | grep -A 10 Health
docker inspect arizu_redis_dev | grep -A 10 Health
docker inspect arizu_n8n_dev | grep -A 10 Health
```

### Health Checks

Each service has health checks configured:

- **PostgreSQL:** `pg_isready` command every 10s
- **Redis:** `redis-cli ping` command every 10s
- **n8n:** HTTP request to `/healthz` endpoint every 30s

### Logs and Debugging

```bash
# View real-time logs for all services
docker compose -f docker-compose.dev.yml logs -f

# View last 100 lines of logs for n8n
docker compose -f docker-compose.dev.yml logs --tail=100 n8n

# Enable verbose Docker Compose logging
COMPOSE_LOG_LEVEL=DEBUG docker compose -f docker-compose.dev.yml up
```

### Network Issues

```bash
# List Docker networks
docker network ls | grep arizu

# Inspect the development network
docker network inspect arizu_dev_net

# Test connectivity between containers
docker exec arizu_n8n_dev ping postgres
docker exec arizu_n8n_dev ping redis
```

## Configuration

### Environment Variables

Modify `.env.docker.dev` to customize:

```bash
# Database settings
POSTGRES_USER=my_user
POSTGRES_PASSWORD=my_secure_password
POSTGRES_DB=my_database

# Timezone
TZ=America/New_York
```

### Custom n8n Configuration

Add to docker-compose.dev.yml environment section:

```yaml
environment:
  # ... existing vars ...
  N8N_BASIC_AUTH_ACTIVE: true
  N8N_BASIC_AUTH_USER: admin
  N8N_BASIC_AUTH_PASSWORD: password
```

## Security Notes

⚠️ **Important Security Considerations:**

1. **Development Only:** This stack is configured for development and should never be used in production
2. **No Authentication:** n8n authentication is disabled by default
3. **Default Passwords:** Uses simple default passwords that should be changed
4. **Open Ports:** All services expose ports without restriction
5. **Debug Logging:** Verbose logging may expose sensitive information

## Integration with Arizu Application

### Database Connection

Use these settings in your Arizu application:

```typescript
// DATABASE_URL for Prisma
DATABASE_URL="postgresql://arizu_dev:dev_password_123@localhost:5432/arizu_dev"

// Individual connection settings
DB_HOST=localhost
DB_PORT=5432
DB_USER=arizu_dev
DB_PASSWORD=dev_password_123
DB_NAME=arizu_dev
```

### Redis Connection

```typescript
// Redis connection settings
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
```

### n8n API Connection

```typescript
// n8n API settings
N8N_API_URL=http://localhost:5678/api/v1
N8N_WEBHOOK_URL=http://localhost:5678
```

## Cleanup and Reset

### Complete Teardown

```bash
# Stop and remove everything
docker compose -f docker-compose.dev.yml down -v --remove-orphans

# Remove custom network
docker network rm arizu_dev_net

# Remove all Arizu-related volumes
docker volume rm $(docker volume ls -q | grep arizu)

# Clean up unused Docker resources
docker system prune -f
```

### Fresh Start

```bash
# Complete reset and restart
docker compose -f docker-compose.dev.yml down -v --remove-orphans
docker system prune -f
cp .env.docker.dev.example .env.docker.dev
docker compose -f docker-compose.dev.yml --env-file .env.docker.dev up -d
```

## Next Steps

1. **Set up n8n workflows:** Access http://localhost:5678 and create your first workflow
2. **Configure webhooks:** Use `http://localhost:5678/webhook/` as your webhook base URL
3. **Database migrations:** Run your Arizu database migrations against the PostgreSQL instance
4. **API integration:** Test your Arizu application's integration with these services