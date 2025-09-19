# n8n Backup and Restore Documentation

This document provides comprehensive guidance for backing up and restoring n8n workflows and data, including PostgreSQL database and n8n data directory.

## Overview

The backup system consists of two main scripts:
- `scripts/n8n-backup.sh` - Creates compressed archives of database and n8n data
- `scripts/n8n-restore.sh` - Restores from backup archives with safety checks

## Quick Start

### Creating a Backup

```bash
# Set environment variables
export DB_HOST=localhost
export DB_NAME=arizu
export DB_USER=postgres
export DB_PASSWORD=your_password

# Create backup
./scripts/n8n-backup.sh
```

### Restoring from Backup

```bash
# List available backups
./scripts/n8n-restore.sh

# Restore specific backup (requires --yes flag)
./scripts/n8n-restore.sh ./backups/n8n-2024-01-15-1430.tgz --yes
```

## Environment Configuration

### Required Environment Variables

All scripts require these database connection variables:

```bash
export DB_HOST=localhost        # PostgreSQL host
export DB_NAME=arizu           # Database name
export DB_USER=postgres        # Database username
export DB_PASSWORD=secret      # Database password
```

### Optional Environment Variables

```bash
export N8N_DATA_DIR=~/.n8n              # n8n data directory (default: ~/.n8n)
export BACKUP_DIR=./backups              # Backup directory (default: ./backups)
export BACKUP_RETENTION=7               # Number of backups to keep (default: 7)
```

### Using Environment Files

For production use, store credentials in environment files:

```bash
# Create .env.backup file
cat > .env.backup <<EOF
DB_HOST=localhost
DB_NAME=arizu
DB_USER=postgres
DB_PASSWORD=your_secure_password
N8N_DATA_DIR=/opt/n8n/data
BACKUP_DIR=/opt/backups/n8n
BACKUP_RETENTION=30
EOF

# Source environment file before running scripts
source .env.backup && ./scripts/n8n-backup.sh
```

**Security Note**: Never commit `.env.backup` files to version control. Add them to `.gitignore`.

## Automated Backups

### Cron Examples

#### Nightly Backups

```bash
# Add to crontab (crontab -e)
# Daily backup at 2:30 AM
30 2 * * * cd /path/to/arizu && source .env.backup && ./scripts/n8n-backup.sh >/dev/null 2>&1

# Weekly backup with email notification
0 3 * * 0 cd /path/to/arizu && source .env.backup && ./scripts/n8n-backup.sh 2>&1 | mail -s "n8n Weekly Backup" admin@company.com
```

#### Hourly Backups During Business Hours

```bash
# Backup every hour from 9 AM to 6 PM on weekdays
0 9-18 * * 1-5 cd /path/to/arizu && source .env.backup && ./scripts/n8n-backup.sh >/dev/null 2>&1
```

#### Custom Retention Policies

```bash
# Keep 30 daily backups
30 2 * * * cd /path/to/arizu && source .env.backup && BACKUP_RETENTION=30 ./scripts/n8n-backup.sh

# Keep 90 backups for compliance
0 1 * * * cd /path/to/arizu && source .env.backup && BACKUP_RETENTION=90 ./scripts/n8n-backup.sh
```

### Docker Compose Integration

```yaml
# docker-compose.yml
version: '3.8'
services:
  backup:
    image: postgres:15
    environment:
      - DB_HOST=postgres
      - DB_NAME=arizu
      - DB_USER=postgres
      - DB_PASSWORD_FILE=/run/secrets/db_password
      - BACKUP_DIR=/backups
      - BACKUP_RETENTION=30
    volumes:
      - ./scripts:/scripts:ro
      - ./backups:/backups
      - ~/.n8n:/n8n_data:ro
    secrets:
      - db_password
    command: /scripts/n8n-backup.sh
    depends_on:
      - postgres

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

### Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: n8n-backup
spec:
  schedule: "30 2 * * *"  # Daily at 2:30 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:15
            env:
            - name: DB_HOST
              value: "postgres-service"
            - name: DB_NAME
              value: "arizu"
            - name: DB_USER
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: username
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: password
            - name: BACKUP_RETENTION
              value: "30"
            volumeMounts:
            - name: backup-storage
              mountPath: /backups
            - name: n8n-data
              mountPath: /root/.n8n
              readOnly: true
            - name: scripts
              mountPath: /scripts
              readOnly: true
            command: ["/scripts/n8n-backup.sh"]
          volumes:
          - name: backup-storage
            persistentVolumeClaim:
              claimName: backup-pvc
          - name: n8n-data
            persistentVolumeClaim:
              claimName: n8n-data-pvc
          - name: scripts
            configMap:
              name: backup-scripts
              defaultMode: 0755
          restartPolicy: OnFailure
```

## Backup Verification and Testing

### Monthly Restore Drill Checklist

Perform these steps monthly to ensure backup integrity:

#### 1. Pre-Flight Checks

- [ ] Identify latest backup file
- [ ] Check backup file size (should be > 1MB typically)
- [ ] Verify backup age (should be recent)
- [ ] Ensure test environment is available

#### 2. Backup Integrity Verification

```bash
# Verify archive integrity
tar -tzf ./backups/n8n-2024-01-15-1430.tgz

# Check required files are present
tar -tzf ./backups/n8n-2024-01-15-1430.tgz | grep -E "(database\.sql|backup-metadata\.txt|n8n_data/)"

# Examine backup metadata
tar -xzf ./backups/n8n-2024-01-15-1430.tgz -O backup-metadata.txt
```

#### 3. Test Environment Restore

```bash
# Set up test database
export DB_HOST=test-postgres
export DB_NAME=arizu_test
export DB_USER=postgres
export DB_PASSWORD=test_password
export N8N_DATA_DIR=/tmp/n8n_test

# Perform restore
./scripts/n8n-restore.sh ./backups/n8n-2024-01-15-1430.tgz --yes
```

#### 4. Functional Verification

- [ ] Database restore completed without errors
- [ ] n8n data directory restored
- [ ] Start n8n in test environment
- [ ] Verify workflow list loads
- [ ] Test a simple workflow execution
- [ ] Check n8n logs for errors

#### 5. Documentation

```bash
# Record test results
echo "$(date): Backup restore test PASSED - n8n-2024-01-15-1430.tgz" >> restore-test-log.txt
```

### Automated Integrity Checks

```bash
#!/bin/bash
# integrity-check.sh - Run after each backup

LATEST_BACKUP=$(ls -t ./backups/n8n-*.tgz | head -1)

echo "Checking integrity of: $LATEST_BACKUP"

# Basic archive test
if tar -tzf "$LATEST_BACKUP" >/dev/null 2>&1; then
    echo "✅ Archive integrity: PASS"
else
    echo "❌ Archive integrity: FAIL"
    exit 1
fi

# Check required files
REQUIRED_FILES=("database.sql" "backup-metadata.txt")
for file in "${REQUIRED_FILES[@]}"; do
    if tar -tzf "$LATEST_BACKUP" | grep -q "^$file$"; then
        echo "✅ Required file $file: PRESENT"
    else
        echo "❌ Required file $file: MISSING"
        exit 1
    fi
done

# Check backup size (warn if < 100KB)
SIZE=$(du -k "$LATEST_BACKUP" | cut -f1)
if [ "$SIZE" -lt 100 ]; then
    echo "⚠️  WARNING: Backup size unusually small: ${SIZE}KB"
fi

echo "✅ Integrity check completed successfully"
```

## Backup Storage Strategies

### Local Storage

```bash
# Organize by date
export BACKUP_DIR="/opt/backups/n8n/$(date +%Y/%m)"
mkdir -p "$BACKUP_DIR"
```

### Remote Storage

#### AWS S3 Upload

```bash
#!/bin/bash
# upload-to-s3.sh

LATEST_BACKUP=$(ls -t ./backups/n8n-*.tgz | head -1)
S3_BUCKET="your-backup-bucket"
S3_PREFIX="n8n-backups/$(date +%Y/%m)"

# Upload to S3
aws s3 cp "$LATEST_BACKUP" "s3://${S3_BUCKET}/${S3_PREFIX}/"

# Set lifecycle policy for automatic deletion
aws s3api put-object-lifecycle-configuration \
  --bucket "$S3_BUCKET" \
  --lifecycle-configuration file://lifecycle.json
```

#### Rsync to Remote Server

```bash
#!/bin/bash
# sync-backups.sh

BACKUP_SERVER="backup.company.com"
REMOTE_PATH="/backups/n8n/"

# Sync backups to remote server
rsync -avz --delete ./backups/ "${BACKUP_SERVER}:${REMOTE_PATH}"
```

## Disaster Recovery Procedures

### Complete System Recovery

1. **Set up new environment**
   ```bash
   # Install dependencies
   sudo apt update
   sudo apt install postgresql-client

   # Clone repository
   git clone https://github.com/company/arizu.git
   cd arizu
   ```

2. **Configure environment**
   ```bash
   # Set database connection
   export DB_HOST=new-postgres-host
   export DB_NAME=arizu
   export DB_USER=postgres
   export DB_PASSWORD=recovery_password
   ```

3. **Restore from backup**
   ```bash
   # Download backup from remote storage
   aws s3 cp s3://backup-bucket/n8n-backups/latest.tgz ./

   # Restore
   ./scripts/n8n-restore.sh ./latest.tgz --yes
   ```

4. **Verify and restart services**
   ```bash
   # Start n8n
   n8n start

   # Verify workflows
   curl http://localhost:5678/rest/workflows
   ```

### Partial Recovery Scenarios

#### Database Only Recovery

```bash
# Extract just the database
tar -xzf backup.tgz database.sql

# Restore manually
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f database.sql
```

#### n8n Data Only Recovery

```bash
# Extract just n8n data
tar -xzf backup.tgz n8n_data/

# Restore manually
mv ~/.n8n ~/.n8n.backup
mv n8n_data ~/.n8n
```

## Monitoring and Alerting

### Backup Success Monitoring

```bash
#!/bin/bash
# check-backup-freshness.sh

BACKUP_DIR="./backups"
MAX_AGE_HOURS=25  # Alert if backup older than 25 hours

LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/n8n-*.tgz 2>/dev/null | head -1)

if [[ -z "$LATEST_BACKUP" ]]; then
    echo "CRITICAL: No backups found"
    exit 2
fi

BACKUP_AGE=$(( ($(date +%s) - $(stat -c %Y "$LATEST_BACKUP")) / 3600 ))

if [[ $BACKUP_AGE -gt $MAX_AGE_HOURS ]]; then
    echo "WARNING: Latest backup is $BACKUP_AGE hours old"
    exit 1
else
    echo "OK: Latest backup is $BACKUP_AGE hours old"
    exit 0
fi
```

### Integration with Monitoring Systems

#### Prometheus Metrics

```bash
# Export backup metrics
echo "n8n_backup_age_hours $BACKUP_AGE" > /var/lib/prometheus/node-exporter/n8n-backup.prom
echo "n8n_backup_size_bytes $(stat -c %s "$LATEST_BACKUP")" >> /var/lib/prometheus/node-exporter/n8n-backup.prom
```

#### Slack Notifications

```bash
# Send Slack notification on backup completion
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"n8n backup completed successfully: '"$BACKUP_FILE"'"}' \
  "$SLACK_WEBHOOK_URL"
```

## Troubleshooting

### Common Issues

#### Permission Errors

```bash
# Fix script permissions
chmod +x scripts/n8n-backup.sh scripts/n8n-restore.sh

# Fix backup directory permissions
chmod 755 backups/
```

#### Database Connection Issues

```bash
# Test connection manually
PGPASSWORD=$DB_PASSWORD pg_isready -h $DB_HOST -U $DB_USER -d $DB_NAME

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

#### Disk Space Issues

```bash
# Check available space
df -h ./backups

# Clean old backups manually
find ./backups -name "n8n-*.tgz" -mtime +30 -delete
```

### Recovery from Corrupted Backups

```bash
# List all available backups
ls -la ./backups/n8n-*.tgz

# Test each backup
for backup in ./backups/n8n-*.tgz; do
    echo "Testing $backup..."
    tar -tzf "$backup" >/dev/null 2>&1 && echo "✅ Good" || echo "❌ Corrupted"
done
```

## Security Considerations

### Credentials Management

- **Never** commit database passwords to version control
- Use environment files or secret management systems
- Rotate database passwords regularly
- Use read-only database users for backups when possible

### Backup Encryption

```bash
# Encrypt backups with GPG
gpg --symmetric --cipher-algo AES256 backup.tgz

# Decrypt for restore
gpg --decrypt backup.tgz.gpg > backup.tgz
```

### Access Control

```bash
# Restrict backup file permissions
chmod 600 ./backups/*.tgz

# Set proper directory permissions
chmod 700 ./backups/
```

## Performance Optimization

### Large Database Optimization

```bash
# Use parallel dump for large databases
export PGDUMP_OPTS="--jobs=4"

# Compress during dump
pg_dump ... | gzip > database.sql.gz
```

### Network Transfer Optimization

```bash
# Use compression for remote transfers
rsync -avz --compress-level=9 ./backups/ remote:/backups/

# Parallel uploads to cloud storage
aws s3 sync ./backups/ s3://bucket/ --cli-write-timeout 0
```

## Best Practices Summary

1. **Regular Testing**: Test restore procedures monthly
2. **Multiple Locations**: Store backups in multiple locations
3. **Retention Policy**: Keep appropriate number of backups
4. **Monitoring**: Monitor backup freshness and integrity
5. **Documentation**: Keep this documentation updated
6. **Security**: Protect backup files and credentials
7. **Automation**: Automate backup creation and verification
8. **Recovery Planning**: Maintain disaster recovery procedures

## Script Reference

### Backup Script Options

```bash
DB_HOST=localhost \
DB_NAME=arizu \
DB_USER=postgres \
DB_PASSWORD=secret \
N8N_DATA_DIR=~/.n8n \
BACKUP_DIR=./backups \
BACKUP_RETENTION=7 \
./scripts/n8n-backup.sh
```

### Restore Script Options

```bash
# List backups
./scripts/n8n-restore.sh

# Restore with confirmation
./scripts/n8n-restore.sh backup.tgz --yes

# Show help
./scripts/n8n-restore.sh --help
```

### Make Scripts Executable

```bash
chmod +x scripts/n8n-backup.sh scripts/n8n-restore.sh
```

For additional support or questions, refer to the project documentation or contact the infrastructure team.