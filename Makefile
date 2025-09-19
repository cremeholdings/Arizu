.PHONY: help dev-up dev-down dev-logs dev-restart prod-up prod-down prod-logs prod-restart logs backup restore health check-env install clean test lint typecheck build chaos-test

# Default target
help: ## Show this help message
	@echo "Arizu Operations Commands"
	@echo "========================"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# Development Environment
dev-up: ## Start development environment
	@echo "🚀 Starting development environment..."
	docker compose -f docker-compose.dev.yml --env-file .env.docker.dev up -d
	@echo "✅ Development environment started"
	@echo "Services available at:"
	@echo "  - App: http://localhost:3000"
	@echo "  - n8n: http://localhost:5678"
	@echo "  - PostgreSQL: localhost:5432"
	@echo "  - Redis: localhost:6379"

dev-down: ## Stop development environment
	@echo "🛑 Stopping development environment..."
	docker compose -f docker-compose.dev.yml --env-file .env.docker.dev down -v
	@echo "✅ Development environment stopped"

dev-logs: ## Show development logs
	docker compose -f docker-compose.dev.yml logs -f

dev-restart: ## Restart development environment
	@echo "🔄 Restarting development environment..."
	$(MAKE) dev-down
	$(MAKE) dev-up

# Production Environment
prod-up: ## Start production environment
	@echo "🚀 Starting production environment..."
	docker compose -f docker-compose.prod.yml --env-file .env.docker.prod up -d
	@echo "✅ Production environment started"
	@$(MAKE) health

prod-down: ## Stop production environment
	@echo "🛑 Stopping production environment..."
	docker compose -f docker-compose.prod.yml --env-file .env.docker.prod down -v
	@echo "✅ Production environment stopped"

prod-logs: ## Show production logs
	docker compose -f docker-compose.prod.yml logs -f

prod-restart: ## Restart production environment
	@echo "🔄 Restarting production environment..."
	$(MAKE) prod-down
	$(MAKE) prod-up

# Logging shortcuts
logs: ## Show n8n logs (production)
	docker compose -f docker-compose.prod.yml logs -f n8n

logs-dev: ## Show n8n logs (development)
	docker compose -f docker-compose.dev.yml logs -f n8n

logs-app: ## Show app logs
	docker compose -f docker-compose.prod.yml logs -f app

logs-db: ## Show database logs
	docker compose -f docker-compose.prod.yml logs -f db

logs-redis: ## Show Redis logs
	docker compose -f docker-compose.prod.yml logs -f redis

# Backup and Restore
backup: ## Create backup of n8n and database
	@echo "💾 Creating backup..."
	bash scripts/n8n-backup.sh
	bash scripts/pg-backup.sh
	@echo "✅ Backup completed"

restore: ## Restore from backup (requires BACKUP_FILE)
	@if [ -z "$(BACKUP_FILE)" ]; then \
		echo "❌ Error: BACKUP_FILE not specified"; \
		echo "Usage: make restore BACKUP_FILE=path/to/backup.tar.gz"; \
		exit 1; \
	fi
	@echo "🔄 Restoring from backup: $(BACKUP_FILE)"
	bash scripts/n8n-restore.sh $(BACKUP_FILE)
	@echo "✅ Restore completed"

backup-list: ## List available backups
	@echo "📋 Available backups:"
	@ls -la backups/ 2>/dev/null || echo "No backups found"

# Health and Status
health: ## Check system health
	@echo "🔍 Checking system health..."
	@scripts/wait-for-it.sh localhost:3000 -- 30 && \
		curl -s http://localhost:3000/api/health | jq '.' || \
		echo "❌ Health check failed"

status: ## Show container status
	@echo "📊 Container Status:"
	@echo "Development:"
	@docker compose -f docker-compose.dev.yml ps 2>/dev/null || echo "  Not running"
	@echo ""
	@echo "Production:"
	@docker compose -f docker-compose.prod.yml ps 2>/dev/null || echo "  Not running"

# Environment Setup
check-env: ## Check environment files
	@echo "🔍 Checking environment files..."
	@for env in .env.docker.dev .env.docker.prod; do \
		if [ -f $$env ]; then \
			echo "✅ $$env exists"; \
		else \
			echo "❌ $$env missing"; \
		fi; \
	done

setup-env: ## Copy environment templates
	@echo "📋 Setting up environment files..."
	@if [ ! -f .env.docker.dev ]; then \
		cp .env.example .env.docker.dev && \
		echo "✅ Created .env.docker.dev"; \
	fi
	@if [ ! -f .env.docker.prod ]; then \
		cp .env.production.example .env.docker.prod && \
		echo "✅ Created .env.docker.prod"; \
	fi

# Development Tools
install: ## Install dependencies
	@echo "📦 Installing dependencies..."
	pnpm install

clean: ## Clean up containers and volumes
	@echo "🧹 Cleaning up..."
	docker system prune -f
	docker volume prune -f
	@echo "✅ Cleanup completed"

clean-all: ## Clean everything including images
	@echo "🧹 Deep cleaning..."
	docker system prune -af
	docker volume prune -f
	@echo "✅ Deep cleanup completed"

# Application Development
test: ## Run tests
	pnpm test

lint: ## Run linting
	pnpm lint

typecheck: ## Run type checking
	pnpm typecheck

build: ## Build application
	pnpm build

dev: ## Start development server
	pnpm dev

# Database Operations
db-shell: ## Connect to database shell
	docker compose -f docker-compose.dev.yml exec db psql -U postgres -d arizu

db-migrate: ## Run database migrations
	pnpm prisma migrate dev

db-reset: ## Reset database
	pnpm prisma migrate reset --force

db-seed: ## Seed database
	pnpm prisma db seed

# Redis Operations
redis-shell: ## Connect to Redis shell
	docker compose -f docker-compose.dev.yml exec redis redis-cli

redis-flush: ## Flush Redis cache
	docker compose -f docker-compose.dev.yml exec redis redis-cli flushall

# n8n Operations
n8n-shell: ## Connect to n8n container shell
	docker compose -f docker-compose.dev.yml exec n8n sh

n8n-export: ## Export n8n workflows
	bash scripts/n8n-export.sh

# Chaos Engineering
chaos-test: ## Run chaos engineering tests
	@echo "🧪 Running chaos tests..."
	@echo "⚠️  This will disrupt services temporarily"
	@read -p "Continue? (y/N) " confirm && [ "$$confirm" = "y" ] || exit 1
	bash scripts/chaos-kill-n8n.sh --yes
	bash scripts/chaos-block-llm.sh --yes --duration=60
	bash scripts/chaos-stall-redis.sh --yes --duration=30

# SSL/TLS
ssl-cert: ## Generate SSL certificate for development
	@echo "🔐 Generating SSL certificate..."
	@mkdir -p certs
	openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes \
		-subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
	@echo "✅ SSL certificate generated in certs/"

# Monitoring
monitor: ## Start monitoring dashboard
	@echo "📊 Starting monitoring..."
	docker compose -f docker-compose.monitoring.yml up -d
	@echo "Grafana: http://localhost:3001"
	@echo "Prometheus: http://localhost:9090"

monitor-down: ## Stop monitoring
	docker compose -f docker-compose.monitoring.yml down

# Quick Commands
quick-dev: setup-env dev-up ## Quick start development (setup + start)

quick-prod: setup-env prod-up ## Quick start production (setup + start)

quick-backup: backup backup-list ## Quick backup and list

# Help for specific categories
help-dev: ## Show development commands
	@echo "Development Commands:"
	@echo "===================="
	@awk 'BEGIN {FS = ":.*?## "} /^dev-.*:.*?## / {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

help-prod: ## Show production commands
	@echo "Production Commands:"
	@echo "==================="
	@awk 'BEGIN {FS = ":.*?## "} /^prod-.*:.*?## / {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

help-ops: ## Show operations commands
	@echo "Operations Commands:"
	@echo "==================="
	@awk 'BEGIN {FS = ":.*?## "} /^(backup|restore|health|status|clean).*:.*?## / {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)