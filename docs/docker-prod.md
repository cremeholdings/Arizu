# Arizu Production Docker Deployment

This guide walks you through deploying Arizu's n8n automation platform to production with automatic HTTPS using Traefik and Let's Encrypt.

## Architecture Overview

The production stack includes:
- **Traefik**: Reverse proxy with automatic HTTPS/SSL certificates
- **n8n**: Workflow automation platform
- **External Database**: PostgreSQL (managed service recommended)
- **External Redis**: Cache and queue (managed service recommended)

## Prerequisites

### Server Requirements

- **VPS/Cloud Instance**: 2+ CPU cores, 4GB+ RAM, 20GB+ storage
- **Operating System**: Ubuntu 20.04+ or similar Linux distribution
- **Domain**: Fully qualified domain name pointed to your server
- **Ports**: 80 (HTTP) and 443 (HTTPS) open to the internet

### External Services

- **PostgreSQL Database**: AWS RDS, Google Cloud SQL, or similar
- **Redis Instance**: AWS ElastiCache, Redis Cloud, or similar

## Step 1: Server Setup

### 1.1 Create and Configure VPS

Choose a cloud provider (AWS, DigitalOcean, Google Cloud, Linode, etc.):

```bash
# Example for DigitalOcean Droplet
# - Ubuntu 22.04 LTS
# - Basic plan: 2 vCPUs, 4GB RAM, 80GB SSD
# - Enable monitoring and backups
```

### 1.2 Connect to Server

```bash
ssh root@your-server-ip
```

### 1.3 Update System

```bash
apt update && apt upgrade -y
apt install -y curl wget git ufw fail2ban
```

### 1.4 Configure Firewall

```bash
# Configure UFW firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Check status
ufw status verbose
```

### 1.5 Install Docker and Docker Compose

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Start Docker service
systemctl enable docker
systemctl start docker

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version
```

## Step 2: DNS Configuration

Point your domain to your server:

```bash
# Example DNS records (configure in your DNS provider)
# Type: A
# Name: automation (or subdomain of choice)
# Value: YOUR_SERVER_IP
# TTL: 300

# Verify DNS propagation
dig automation.example.com
nslookup automation.example.com
```

## Step 3: External Services Setup

### 3.1 PostgreSQL Database

Set up a managed PostgreSQL instance:

**AWS RDS:**
```bash
# Create RDS instance
aws rds create-db-instance \
    --db-instance-identifier arizu-prod \
    --db-instance-class db.t3.micro \
    --engine postgres \
    --master-username arizu_prod \
    --master-user-password "SECURE_PASSWORD" \
    --allocated-storage 20 \
    --vpc-security-group-ids sg-xxxxxxxx
```

**Google Cloud SQL:**
```bash
# Create Cloud SQL instance
gcloud sql instances create arizu-prod \
    --database-version=POSTGRES_14 \
    --tier=db-f1-micro \
    --region=us-central1
```

### 3.2 Redis Instance

Set up a managed Redis instance:

**AWS ElastiCache:**
```bash
# Create ElastiCache cluster
aws elasticache create-cache-cluster \
    --cache-cluster-id arizu-prod \
    --engine redis \
    --cache-node-type cache.t3.micro \
    --num-cache-nodes 1
```

## Step 4: Application Deployment

### 4.1 Clone Repository

```bash
# Create application directory
mkdir -p /opt/arizu
cd /opt/arizu

# Clone repository (or upload files)
git clone https://github.com/your-org/arizu.git .
# OR upload docker-compose.prod.yml, traefik/, and .env files
```

### 4.2 Configure Environment

```bash
# Copy environment template
cp .env.docker.prod.example .env.docker.prod

# Edit configuration
nano .env.docker.prod
```

**Critical values to change:**
```bash
# Domain and email
DOMAIN=automation.yourdomain.com
EMAIL=you@yourdomain.com

# Database connection
DB_HOST=your-postgres-host.amazonaws.com
DB_PASSWORD=your-secure-db-password

# Redis connection
REDIS_HOST=your-redis-host.amazonaws.com
REDIS_PASSWORD=your-secure-redis-password

# Generate encryption key
N8N_ENCRYPTION_KEY=$(openssl rand -base64 32)

# Generate JWT secret
N8N_JWT_SECRET=$(openssl rand -base64 32)
```

### 4.3 Prepare SSL Certificate Storage

```bash
# Create and secure acme.json
touch traefik/acme.json
chmod 600 traefik/acme.json

# Verify permissions
ls -la traefik/acme.json
# Should show: -rw------- 1 root root 0 date traefik/acme.json
```

### 4.4 Start Services

```bash
# Start the stack
docker-compose -f docker-compose.prod.yml --env-file .env.docker.prod up -d

# Check service status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

## Step 5: Verification

### 5.1 Check HTTPS Certificate

```bash
# Test HTTPS connection
curl -I https://automation.yourdomain.com

# Check certificate details
echo | openssl s_client -servername automation.yourdomain.com -connect automation.yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates
```

### 5.2 Access n8n Interface

1. **Open browser**: Navigate to `https://automation.yourdomain.com`
2. **Setup account**: Create your first n8n admin user
3. **Test workflow**: Create a simple test workflow

### 5.3 Verify Services

```bash
# Check all containers are running
docker ps

# Check container health
docker-compose -f docker-compose.prod.yml ps --format table

# Check logs for errors
docker-compose -f docker-compose.prod.yml logs traefik
docker-compose -f docker-compose.prod.yml logs n8n
```

## Step 6: Security Hardening

### 6.1 Enable Traefik Dashboard (Optional)

```bash
# Generate password hash
echo $(htpasswd -nb admin your-secure-password) | sed -e s/\\$/\\$\\$/g

# Add to .env.docker.prod
TRAEFIK_AUTH=admin:$2y$10$hash-from-above

# Restart services
docker-compose -f docker-compose.prod.yml restart traefik
```

Access dashboard at: `https://traefik.automation.yourdomain.com`

### 6.2 Configure Fail2Ban

```bash
# Create jail for Docker containers
cat > /etc/fail2ban/jail.d/docker.conf << 'EOF'
[traefik-auth]
enabled = true
port = http,https
filter = traefik-auth
logpath = /var/lib/docker/containers/*/*.log
maxretry = 3
bantime = 86400
findtime = 600
EOF

# Create filter
cat > /etc/fail2ban/filter.d/traefik-auth.conf << 'EOF'
[Definition]
failregex = ^.*"ClientIP":"<HOST>".*"level":"error".*"msg":"authentication failed".*$
ignoreregex =
EOF

# Restart fail2ban
systemctl restart fail2ban
```

### 6.3 Set Up Log Rotation

```bash
# Configure log rotation for Docker
cat > /etc/logrotate.d/docker-containers << 'EOF'
/var/lib/docker/containers/*/*.log {
    rotate 7
    daily
    compress
    size=1M
    missingok
    delaycompress
    copytruncate
}
EOF
```

## Step 7: Monitoring and Maintenance

### 7.1 Health Monitoring

```bash
# Create health check script
cat > /opt/arizu/health-check.sh << 'EOF'
#!/bin/bash
set -e

echo "Checking Arizu production stack..."

# Check if containers are running
if ! docker-compose -f /opt/arizu/docker-compose.prod.yml ps | grep -q "Up"; then
    echo "ERROR: Some containers are not running"
    exit 1
fi

# Check HTTPS endpoint
if ! curl -f -s https://automation.yourdomain.com/healthz > /dev/null; then
    echo "ERROR: n8n health check failed"
    exit 1
fi

# Check certificate expiry (warn if < 30 days)
CERT_DAYS=$(echo | openssl s_client -servername automation.yourdomain.com -connect automation.yourdomain.com:443 2>/dev/null | openssl x509 -noout -checkend 2592000)
if [ $? -ne 0 ]; then
    echo "WARNING: SSL certificate expires in less than 30 days"
fi

echo "All checks passed!"
EOF

chmod +x /opt/arizu/health-check.sh

# Add to cron for regular checks
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/arizu/health-check.sh") | crontab -
```

### 7.2 Backup Strategy

```bash
# Create backup script
cat > /opt/arizu/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups/arizu"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup n8n data volume
docker run --rm -v arizu_n8n_data_prod:/data -v $BACKUP_DIR:/backup ubuntu tar czf /backup/n8n_data_$DATE.tar.gz -C /data .

# Backup environment and config
cp /opt/arizu/.env.docker.prod $BACKUP_DIR/env_$DATE.backup
cp -r /opt/arizu/traefik $BACKUP_DIR/traefik_$DATE/

# Remove old backups (keep 7 days)
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
find $BACKUP_DIR -name "*.backup" -mtime +7 -delete
find $BACKUP_DIR -name "traefik_*" -mtime +7 -exec rm -rf {} +

echo "Backup completed: $DATE"
EOF

chmod +x /opt/arizu/backup.sh

# Schedule daily backups
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/arizu/backup.sh") | crontab -
```

### 7.3 Log Monitoring

```bash
# Monitor logs in real-time
docker-compose -f docker-compose.prod.yml logs -f

# Check for errors
docker-compose -f docker-compose.prod.yml logs | grep ERROR

# Monitor certificate renewal
docker-compose -f docker-compose.prod.yml logs traefik | grep acme
```

## Step 8: Updates and Maintenance

### 8.1 Update n8n

```bash
cd /opt/arizu

# Pull latest images
docker-compose -f docker-compose.prod.yml pull

# Recreate containers with new images
docker-compose -f docker-compose.prod.yml up -d

# Clean up old images
docker image prune -f
```

### 8.2 Update Traefik

```bash
# Update Traefik version in docker-compose.prod.yml
# Then recreate container
docker-compose -f docker-compose.prod.yml up -d traefik
```

### 8.3 Rotate Secrets

```bash
# Generate new encryption key
NEW_KEY=$(openssl rand -base64 32)

# Update .env.docker.prod
sed -i "s/N8N_ENCRYPTION_KEY=.*/N8N_ENCRYPTION_KEY=$NEW_KEY/" .env.docker.prod

# Restart n8n (this will re-encrypt data)
docker-compose -f docker-compose.prod.yml restart n8n
```

## Troubleshooting

### Common Issues

**1. SSL Certificate Not Issued**
```bash
# Check Traefik logs
docker-compose -f docker-compose.prod.yml logs traefik | grep acme

# Verify DNS resolution
dig automation.yourdomain.com

# Check firewall
ufw status
netstat -tlnp | grep :80
netstat -tlnp | grep :443
```

**2. n8n Not Accessible**
```bash
# Check n8n health
docker-compose -f docker-compose.prod.yml exec n8n wget -O- http://localhost:5678/healthz

# Check database connection
docker-compose -f docker-compose.prod.yml logs n8n | grep -i database
```

**3. High Resource Usage**
```bash
# Check container resource usage
docker stats

# Monitor system resources
htop
df -h
free -h
```

**4. Certificate Renewal Issues**
```bash
# Force certificate renewal
docker-compose -f docker-compose.prod.yml restart traefik

# Check acme.json permissions
ls -la traefik/acme.json

# Clear acme.json if corrupted
docker-compose -f docker-compose.prod.yml down
rm traefik/acme.json
touch traefik/acme.json
chmod 600 traefik/acme.json
docker-compose -f docker-compose.prod.yml up -d
```

### Performance Optimization

**1. Database Connection Pooling**
```bash
# Add to .env.docker.prod
N8N_DB_POSTGRESDB_POOL_SIZE=10
N8N_DB_POSTGRESDB_MAX_CONNECTIONS=20
```

**2. Redis Memory Optimization**
```bash
# Monitor Redis memory usage
docker-compose -f docker-compose.prod.yml exec redis redis-cli info memory
```

**3. n8n Performance Tuning**
```bash
# Increase concurrency (adjust based on resources)
N8N_CONCURRENCY_LIMIT=20

# Optimize execution settings
EXECUTIONS_DATA_SAVE_ON_ERROR=all
EXECUTIONS_DATA_SAVE_ON_SUCCESS=first
```

## Security Checklist

- [ ] **Firewall configured** (only ports 22, 80, 443 open)
- [ ] **Strong passwords** for all services
- [ ] **Encryption key rotated** from default
- [ ] **Database credentials** secured
- [ ] **Redis password** set
- [ ] **Traefik dashboard** protected or disabled
- [ ] **Fail2ban configured** for brute force protection
- [ ] **SSL certificates** auto-renewing
- [ ] **Security headers** enabled
- [ ] **Log monitoring** set up
- [ ] **Backup strategy** implemented
- [ ] **Update schedule** planned

## Support and Monitoring

### Logs Location

- **Application logs**: `docker-compose logs`
- **System logs**: `/var/log/`
- **Container logs**: `/var/lib/docker/containers/`

### Key Metrics to Monitor

- **Container health status**
- **SSL certificate expiry**
- **Database connection health**
- **Redis memory usage**
- **Disk space usage**
- **Memory and CPU usage**
- **Network connectivity**

### Emergency Procedures

**Complete Stack Restart:**
```bash
cd /opt/arizu
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

**Rollback to Previous Version:**
```bash
# Tag current state
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml.backup up -d
```

**Emergency Access:**
```bash
# Direct container access
docker exec -it arizu_n8n_prod /bin/sh
```

This production deployment provides a secure, scalable foundation for running Arizu's automation platform with automatic HTTPS and robust monitoring.