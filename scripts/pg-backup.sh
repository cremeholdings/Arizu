#!/usr/bin/env bash

# PostgreSQL Backup Script
# Creates compressed database dumps with automatic pruning and optional cloud upload
#
# Required environment variables:
#   PGHOST     - PostgreSQL host
#   PGDATABASE - Database name
#   PGUSER     - Database username
#   PGPASSWORD - Database password
#
# Optional environment variables:
#   BACKUP_DIR        - Backup directory (default: ./backups)
#   BACKUP_RETENTION  - Number of backups to keep (default: 14)
#   S3_BUCKET         - S3 bucket for upload (optional)
#   R2_BUCKET         - Cloudflare R2 bucket for upload (optional)
#   BACKUP_PREFIX     - Filename prefix (default: pg)
#   COMPRESSION_LEVEL - Gzip compression level 1-9 (default: 6)
#
# Usage:
#   PGHOST=localhost PGDATABASE=arizu PGUSER=postgres PGPASSWORD=secret ./scripts/pg-backup.sh

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TIMESTAMP="$(date +%F-%H%M)"

# Environment variables with defaults
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
BACKUP_RETENTION="${BACKUP_RETENTION:-14}"
BACKUP_PREFIX="${BACKUP_PREFIX:-pg}"
COMPRESSION_LEVEL="${COMPRESSION_LEVEL:-6}"

# Required environment variables
REQUIRED_VARS=("PGHOST" "PGDATABASE" "PGUSER" "PGPASSWORD")
for var in "${REQUIRED_VARS[@]}"; do
    if [[ -z "${!var:-}" ]]; then
        echo "❌ Error: Required environment variable $var is not set" >&2
        echo "" >&2
        echo "Usage:" >&2
        echo "  PGHOST=localhost PGDATABASE=arizu PGUSER=postgres PGPASSWORD=secret $0" >&2
        echo "" >&2
        echo "Required variables:" >&2
        echo "  PGHOST      PostgreSQL host" >&2
        echo "  PGDATABASE  Database name" >&2
        echo "  PGUSER      Database username" >&2
        echo "  PGPASSWORD  Database password" >&2
        echo "" >&2
        echo "Optional variables:" >&2
        echo "  BACKUP_DIR        Backup directory (default: ./backups)" >&2
        echo "  BACKUP_RETENTION  Number of backups to keep (default: 14)" >&2
        echo "  S3_BUCKET         S3 bucket for upload (optional)" >&2
        echo "  R2_BUCKET         Cloudflare R2 bucket for upload (optional)" >&2
        echo "  BACKUP_PREFIX     Filename prefix (default: pg)" >&2
        echo "  COMPRESSION_LEVEL Gzip compression 1-9 (default: 6)" >&2
        exit 1
    fi
done

# Output configuration
BACKUP_NAME="${BACKUP_PREFIX}-${TIMESTAMP}"
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_NAME}.dump.gz"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# Check required tools
check_dependencies() {
    local missing_deps=()

    if ! command -v pg_dump >/dev/null 2>&1; then
        missing_deps+=("pg_dump (postgresql-client)")
    fi

    if ! command -v gzip >/dev/null 2>&1; then
        missing_deps+=("gzip")
    fi

    # Check for cloud upload tools if buckets are configured
    if [[ -n "${S3_BUCKET:-}" ]] && ! command -v aws >/dev/null 2>&1; then
        missing_deps+=("aws (aws-cli)")
    fi

    if [[ -n "${R2_BUCKET:-}" ]] && ! command -v aws >/dev/null 2>&1; then
        missing_deps+=("aws (aws-cli for R2)")
    fi

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log "❌ Missing required dependencies:"
        for dep in "${missing_deps[@]}"; do
            log "   - $dep"
        done
        exit 1
    fi
}

# Test database connection
test_connection() {
    log "🔍 Testing database connection..."

    if ! pg_isready -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" >/dev/null 2>&1; then
        log "❌ Cannot connect to database"
        log "   Host: $PGHOST"
        log "   Database: $PGDATABASE"
        log "   User: $PGUSER"
        exit 1
    fi

    log "✅ Database connection successful"
}

# Create backup directory
setup_backup_dir() {
    log "📁 Setting up backup directory..."

    if [[ ! -d "$BACKUP_DIR" ]]; then
        mkdir -p "$BACKUP_DIR"
        log "   Created backup directory: $BACKUP_DIR"
    fi

    # Check disk space (warn if less than 1GB free)
    local available_space
    available_space=$(df "$BACKUP_DIR" | awk 'NR==2 {print $4}')
    local available_gb=$((available_space / 1024 / 1024))

    if [[ $available_gb -lt 1 ]]; then
        log "⚠️  WARNING: Low disk space: ${available_gb}GB available"
    fi

    log "   Backup directory ready: $BACKUP_DIR"
    log "   Available space: ${available_gb}GB"
}

# Create database backup
create_backup() {
    log "💾 Starting database backup..."
    log "   Database: $PGDATABASE"
    log "   Output: $BACKUP_FILE"

    # Get database size for reference
    local db_size
    db_size=$(psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -t -c "SELECT pg_size_pretty(pg_database_size('$PGDATABASE'));" 2>/dev/null | xargs || echo "unknown")
    log "   Database size: $db_size"

    # Create backup with compression
    if pg_dump \
        --host="$PGHOST" \
        --username="$PGUSER" \
        --dbname="$PGDATABASE" \
        --no-password \
        --verbose \
        --format=custom \
        --compress=0 \
        --file=/dev/stdout \
        2>/dev/null | gzip -"$COMPRESSION_LEVEL" > "$BACKUP_FILE"; then

        local backup_size
        backup_size=$(du -h "$BACKUP_FILE" | cut -f1)
        log "✅ Backup completed successfully"
        log "   Compressed size: $backup_size"
    else
        log "❌ Backup failed"
        [[ -f "$BACKUP_FILE" ]] && rm -f "$BACKUP_FILE"
        exit 1
    fi
}

# Verify backup integrity
verify_backup() {
    log "🔍 Verifying backup integrity..."

    # Test gzip integrity
    if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
        log "❌ Backup file is corrupted (gzip test failed)"
        exit 1
    fi

    # Test pg_restore can read the file structure
    if ! gunzip -c "$BACKUP_FILE" | pg_restore --list >/dev/null 2>&1; then
        log "❌ Backup file is corrupted (pg_restore test failed)"
        exit 1
    fi

    log "✅ Backup integrity verified"
}

# Upload to cloud storage
upload_to_cloud() {
    local upload_success=true

    # Upload to S3
    if [[ -n "${S3_BUCKET:-}" ]]; then
        log "☁️  Uploading to S3..."
        local s3_path="s3://${S3_BUCKET}/postgres-backups/$(date +%Y/%m)/${BACKUP_NAME}.dump.gz"

        if aws s3 cp "$BACKUP_FILE" "$s3_path" --no-progress 2>/dev/null; then
            log "✅ S3 upload successful: $s3_path"
        else
            log "❌ S3 upload failed"
            upload_success=false
        fi
    fi

    # Upload to Cloudflare R2
    if [[ -n "${R2_BUCKET:-}" ]]; then
        log "☁️  Uploading to Cloudflare R2..."
        local r2_path="s3://${R2_BUCKET}/postgres-backups/$(date +%Y/%m)/${BACKUP_NAME}.dump.gz"

        # R2 uses S3-compatible API
        if aws s3 cp "$BACKUP_FILE" "$r2_path" --endpoint-url="${R2_ENDPOINT:-}" --no-progress 2>/dev/null; then
            log "✅ R2 upload successful: $r2_path"
        else
            log "❌ R2 upload failed"
            upload_success=false
        fi
    fi

    if [[ "$upload_success" == false ]]; then
        log "⚠️  Some cloud uploads failed, but local backup is available"
    fi
}

# Prune old backups
prune_backups() {
    log "🗑️  Pruning old backups (keeping $BACKUP_RETENTION)..."

    # Find backup files matching our pattern
    local backup_files=()
    while IFS= read -r -d '' file; do
        backup_files+=("$file")
    done < <(find "$BACKUP_DIR" -name "${BACKUP_PREFIX}-*.dump.gz" -type f -print0 2>/dev/null | sort -z)

    local total_backups=${#backup_files[@]}

    if [[ $total_backups -le $BACKUP_RETENTION ]]; then
        log "   No pruning needed ($total_backups <= $BACKUP_RETENTION)"
        return
    fi

    # Sort by modification time (newest first) and remove oldest
    local sorted_files=()
    while IFS= read -r file; do
        sorted_files+=("$file")
    done < <(printf '%s\n' "${backup_files[@]}" | xargs ls -t)

    local files_to_remove=$((total_backups - BACKUP_RETENTION))
    local removed_count=0

    for ((i = BACKUP_RETENTION; i < total_backups; i++)); do
        local file_to_remove="${sorted_files[i]}"
        if [[ -f "$file_to_remove" ]]; then
            rm "$file_to_remove"
            log "   Removed: $(basename "$file_to_remove")"
            ((removed_count++))
        fi
    done

    log "   Pruned $removed_count old backup(s)"
}

# Generate backup report
generate_report() {
    log "📊 Backup Summary:"
    log "   Timestamp: $TIMESTAMP"
    log "   Database: $PGDATABASE"
    log "   File: $BACKUP_FILE"
    log "   Size: $(du -h "$BACKUP_FILE" | cut -f1)"
    log "   Retention: $BACKUP_RETENTION files"

    local total_backups
    total_backups=$(find "$BACKUP_DIR" -name "${BACKUP_PREFIX}-*.dump.gz" -type f | wc -l)
    log "   Total backups: $total_backups"

    if [[ -n "${S3_BUCKET:-}" ]] || [[ -n "${R2_BUCKET:-}" ]]; then
        log "   Cloud uploads: configured"
    fi
}

# Main execution
main() {
    log "🚀 Starting PostgreSQL backup..."
    log "   Host: $PGHOST"
    log "   Database: $PGDATABASE"
    log "   User: $PGUSER"
    log "   Compression: level $COMPRESSION_LEVEL"
    echo ""

    check_dependencies
    test_connection
    setup_backup_dir
    create_backup
    verify_backup
    upload_to_cloud
    prune_backups

    echo ""
    generate_report
    echo ""

    log "🎉 Backup completed successfully!"
    echo ""
    log "💡 Next steps:"
    log "   • Test restore: ./scripts/pg-restore.sh $BACKUP_FILE"
    log "   • Verify with: gunzip -c $BACKUP_FILE | pg_restore --list"
    log "   • Schedule nightly: see docs/backups-restore-drill.md"

    # Exit with success
    exit 0
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi