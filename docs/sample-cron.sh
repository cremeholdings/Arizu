#!/bin/bash

# Sample Cron Configuration for Arizu Backups
#
# To install these cron jobs:
# 1. Make sure you have a .env.backup file with credentials
# 2. Copy the lines below into your crontab (crontab -e)
# 3. Adjust paths to match your installation

# Example .env.backup file content:
# export PGHOST=localhost
# export PGDATABASE=arizu
# export PGUSER=postgres
# export PGPASSWORD=your_secure_password
# export N8N_API_URL=http://localhost:5678
# export N8N_API_KEY=your_n8n_api_key
# export BACKUP_DIR=/opt/arizu/backups
# export BACKUP_RETENTION=14

echo "# Arizu Backup Cron Jobs"
echo "# Add these lines to your crontab (crontab -e)"
echo ""
echo "# Nightly PostgreSQL backup at 2:00 AM"
echo "0 2 * * * cd /opt/arizu && source .env.backup && ./scripts/pg-backup.sh >/dev/null 2>&1"
echo ""
echo "# Nightly n8n export at 2:30 AM"
echo "30 2 * * * cd /opt/arizu && source .env.backup && ./scripts/n8n-export.sh >/dev/null 2>&1"
echo ""
echo "# Weekly restore test at 3:00 AM on Sundays"
echo "0 3 * * 0 cd /opt/arizu && source .env.backup && ./scripts/pg-restore.sh --no-cleanup"
echo ""
echo "# Monthly cleanup of old backups at 1:00 AM on 1st of month"
echo "0 1 1 * * find /opt/arizu/backups -name 'pg-*.dump.gz' -mtime +30 -delete"
echo ""
echo "# Monthly cleanup of old n8n exports"
echo "5 1 1 * * find /opt/arizu/backups -name 'n8n-export-*.tgz' -mtime +30 -delete"
echo ""
echo "Copy and paste the lines above into your crontab."
echo "Remember to:"
echo "1. Update /opt/arizu to your actual installation path"
echo "2. Ensure .env.backup file exists with proper credentials"
echo "3. Test the scripts manually before setting up cron jobs"