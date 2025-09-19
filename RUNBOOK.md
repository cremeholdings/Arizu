# Arizu Operations Runbook

This runbook provides operational guidance for managing the Arizu platform in production. Follow these procedures during incidents, maintenance, and routine operations.

## Architecture Overview

```
User Request → Next.js App → n8n Workflows → External Services
                ↓               ↓
           Database (PostgreSQL) Redis Cache
                ↓               ↓
        Stripe Payments    Clerk Auth    LLM Providers
```

### Component Dependencies
- **Next.js Application**: Core web application and API
- **PostgreSQL**: Primary data store for users, plans, workflows
- **Redis**: Session storage, caching, job queues
- **n8n**: Workflow automation engine
- **Clerk**: Authentication and user management
- **Stripe**: Payment processing and subscription management
- **LLM Providers**: Anthropic Claude, OpenAI, Google, Mistral

## Service Level Objectives (SLOs)

### Availability Targets
- **Application**: 99.9% uptime (43 minutes downtime/month)
- **n8n Workflows**: 99.5% uptime (3.6 hours downtime/month)
- **Database**: 99.95% uptime (22 minutes downtime/month)

### Performance Targets
- **Application P95 Latency**: <500ms
- **API P95 Latency**: <200ms
- **Workflow Execution**: <30 seconds
- **Health Check Response**: <100ms

### Error Budget
- **Monthly Error Budget**: 0.1% (7.2 hours/month)
- **Critical Alert Threshold**: 50% budget consumed
- **Emergency Response**: 80% budget consumed

## 5-Minute Incident Triage

When an incident is reported, follow this checklist:

### 1. Assess Severity (1 min)
```bash
# Check overall system health
curl -s https://arizu.com/api/health | jq '.'

# Check status page
curl -s https://arizu.com/status
```

**Severity Levels:**
- **P0 Critical**: Complete service outage, payment processing down
- **P1 High**: Major feature unavailable, significant user impact
- **P2 Medium**: Degraded performance, some users affected
- **P3 Low**: Minor issues, minimal user impact

### 2. Check Core Components (2 min)
```bash
# Database connectivity
curl -s https://arizu.com/api/health?detailed=true | jq '.details.db'

# Redis connectivity
curl -s https://arizu.com/api/health?detailed=true | jq '.details.redis'

# n8n status
curl -s https://arizu.com/api/health?detailed=true | jq '.details.n8n'
```

### 3. Review Recent Changes (1 min)
- Check latest Vercel deployments: https://vercel.com/dashboard
- Review recent GitHub commits: https://github.com/yourorg/arizu/commits/main
- Check team communications for planned maintenance

### 4. Check External Dependencies (1 min)
- **Clerk Status**: https://status.clerk.com
- **Stripe Status**: https://status.stripe.com
- **Vercel Status**: https://www.vercel-status.com
- **Provider Status**: Check Anthropic, OpenAI status pages

## Common Failures & Fixes

### n8n Workflow Engine Down

**Symptoms:**
- Health check shows n8n as "down"
- Workflows failing to execute
- Users unable to create/test automations

**Immediate Actions:**
```bash
# Check n8n container status
docker ps | grep n8n

# Restart n8n service
docker-compose restart n8n

# Check logs
docker-compose logs -f n8n --tail=100

# Test n8n health
curl -f http://localhost:5678/healthz || echo "n8n unhealthy"
```

**Root Causes:**
- Memory exhaustion (check `docker stats`)
- Database connection pool exhaustion
- Disk space full (`df -h`)
- Network connectivity issues

### Database Connection Issues

**Symptoms:**
- Health check shows db as "down" or "degraded"
- High response times
- Connection timeout errors

**Immediate Actions:**
```bash
# Check connection pool
curl -s https://arizu.com/api/health?detailed=true | jq '.details.db'

# Check database load
# Connect to database and run:
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

# Check slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY total_time DESC LIMIT 10;
```

**Mitigation:**
```bash
# Kill long-running queries
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'active' AND query_start < now() - interval '5 minutes';

# Restart application (forces connection pool reset)
vercel --prod --force
```

### Redis Performance Issues

**Symptoms:**
- High latency on cached operations
- Session issues
- Queue job delays

**Immediate Actions:**
```bash
# Check Redis status
redis-cli ping

# Check Redis memory usage
redis-cli info memory

# Check slow log
redis-cli slowlog get 10

# Check queue sizes
redis-cli llen "queue:pending"
redis-cli llen "queue:failed"
redis-cli llen "queue:dlq"
```

**Mitigation:**
```bash
# Clear cache if safe to do so
redis-cli flushdb

# Restart Redis
docker-compose restart redis
```

### LLM Provider Outage

**Symptoms:**
- Chat/automation generation failures
- High error rates on LLM API calls
- Fallback provider not activating

**Immediate Actions:**
```bash
# Test primary provider
curl -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  https://api.anthropic.com/v1/messages

# Check fallback configuration
curl -s https://arizu.com/api/health | jq '.components'

# Force provider switch (if needed)
# Update MODEL_PROVIDER environment variable
```

**Communication Template:**
```
🚨 LLM Provider Issue
We're experiencing issues with our AI provider.
- Chat responses may be delayed
- Some automations may fail temporarily
- We're working on a fix
ETA: [X] minutes
```

## Rollback Procedures

### Vercel Deployment Rollback

**Quick Rollback:**
```bash
# List recent deployments
vercel ls

# Rollback to previous deployment
vercel rollback [deployment-url] --scope=team

# Or promote specific deployment
vercel promote [deployment-url] --scope=team
```

**Emergency Rollback (via Dashboard):**
1. Go to https://vercel.com/dashboard
2. Select project → Deployments
3. Find last known good deployment
4. Click "..." → "Promote to Production"

### Database Schema Rollback

**If migration caused issues:**
```bash
# Connect to database
psql $DATABASE_URL

# Check migration status
SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;

# Manual rollback (if safe)
# Run specific down migration or restore from backup
```

### Docker/Self-Hosted Rollback

```bash
# Stop current containers
docker-compose down

# Pull previous image version
docker pull your-registry/arizu:previous-tag

# Update docker-compose.yml with previous tag
# Restart services
docker-compose up -d

# Verify health
curl -f http://localhost:3000/api/health
```

## Backup & Restore Quick Steps

### Database Backup
```bash
# Create backup
./scripts/pg-backup.sh

# List backups
ls -la backups/

# Restore from backup
./scripts/pg-restore.sh backups/backup-YYYY-MM-DD-HHMMSS.sql
```

### n8n Backup
```bash
# Export workflows
./scripts/n8n-export.sh

# Backup n8n data
./scripts/n8n-backup.sh

# Restore n8n
./scripts/n8n-restore.sh backups/n8n-backup-YYYY-MM-DD.tar.gz
```

### Full System Backup
```bash
# Daily backup (automated)
0 2 * * * /path/to/arizu/scripts/daily-backup.sh

# Manual backup
./scripts/full-backup.sh

# Disaster recovery
./scripts/disaster-recovery.sh backup-timestamp
```

## On-Call & Escalation

### Contact Information
- **On-Call Engineer**: Check PagerDuty rotation
- **Technical Lead**: [contact info]
- **Product Owner**: [contact info]
- **Infrastructure Team**: [contact info]

### Escalation Matrix

**P0/P1 Incidents:**
1. **0-15 min**: On-call engineer responds
2. **15-30 min**: Escalate to technical lead
3. **30-60 min**: Involve infrastructure team
4. **60+ min**: Executive notification

**Communication Channels:**
- **Internal**: #incidents Slack channel
- **External**: Status page updates
- **Customer**: Email notifications for P0/P1

### Incident Commander Duties
1. **Coordinate**: Manage incident response team
2. **Communicate**: Regular status updates
3. **Document**: Timeline and actions taken
4. **Decide**: Go/no-go for major changes

## Post-Incident Review Checklist

### Within 24 Hours
- [ ] **Timeline Created**: Document incident start to resolution
- [ ] **Impact Assessed**: Users affected, revenue impact, SLO impact
- [ ] **Root Cause**: Technical and process failures identified
- [ ] **Immediate Actions**: Temporary fixes documented

### Within 1 Week
- [ ] **Post-Mortem Draft**: Complete analysis written
- [ ] **Action Items**: Preventive measures identified
- [ ] **Stakeholder Review**: Technical team review completed
- [ ] **Customer Communication**: Follow-up sent if needed

### Post-Mortem Template
```markdown
# Incident Post-Mortem: [YYYY-MM-DD] [Brief Description]

## Summary
- **Date/Time**: [Start] - [End] ([Duration])
- **Severity**: P[0-3]
- **Impact**: [Users affected, features down]
- **Root Cause**: [Brief technical cause]

## Timeline
| Time | Event | Action Taken |
|------|-------|-------------|
| 14:00 | Alert fired | Investigation began |
| 14:05 | Root cause identified | Applied fix |
| 14:15 | Service restored | Monitoring continued |

## Root Cause Analysis
### What Happened
[Detailed technical explanation]

### Why It Happened
[Process gaps, monitoring gaps, etc.]

## Action Items
- [ ] **High Priority**: [Action] - Owner: [Name] - Due: [Date]
- [ ] **Medium Priority**: [Action] - Owner: [Name] - Due: [Date]
- [ ] **Low Priority**: [Action] - Owner: [Name] - Due: [Date]

## Lessons Learned
[What went well, what could be improved]
```

## Emergency Contacts

### Critical Services
- **Vercel Support**: support@vercel.com
- **Database Provider**: [contact info]
- **Redis Provider**: [contact info]

### External Dependencies
- **Clerk Support**: support@clerk.com
- **Stripe Support**: support@stripe.com
- **Anthropic Support**: support@anthropic.com

---

**Last Updated**: [Current Date]
**Next Review**: [Date + 3 months]
**Owner**: Operations Team

For questions about this runbook, contact the operations team or create an issue in the repository.