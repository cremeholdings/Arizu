#!/usr/bin/env bash

# n8n Backup Script
# Creates compressed archives of PostgreSQL database and n8n data directory
#
# Required environment variables:
#   DB_HOST     - PostgreSQL host
#   DB_NAME     - Database name
#   DB_USER     - Database username
#   DB_PASSWORD - Database password (use secret mount in production)
#
# Optional environment variables:
#   N8N_DATA_DIR - n8n data directory (default: ~/.n8n)
#   BACKUP_DIR   - Backup output directory (default: ./backups)
#   BACKUP_RETENTION - Number of backups to keep (default: 7)
#
# Usage:
#   DB_HOST=localhost DB_NAME=arizu DB_USER=postgres DB_PASSWORD=secret ./scripts/n8n-backup.sh

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TIMESTAMP="$(date +%F-%H%M)"

# Environment variables with defaults
N8N_DATA_DIR="${N8N_DATA_DIR:-$HOME/.n8n}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
BACKUP_RETENTION="${BACKUP_RETENTION:-7}"

# Required environment variables
REQUIRED_VARS=("DB_HOST" "DB_NAME" "DB_USER" "DB_PASSWORD")
for var in "${REQUIRED_VARS[@]}"; do
    if [[ -z "${!var:-}" ]]; then
        echo "❌ Error: Required environment variable $var is not set" >&2
        echo "" >&2
        echo "Usage:" >&2
        echo "  DB_HOST=localhost DB_NAME=arizu DB_USER=postgres DB_PASSWORD=secret $0" >&2
        echo "" >&2
        echo "Required variables:" >&2
        echo "  DB_HOST      PostgreSQL host" >&2
        echo "  DB_NAME      Database name" >&2
        echo "  DB_USER      Database username" >&2
        echo "  DB_PASSWORD  Database password" >&2
        echo "" >&2
        echo "Optional variables:" >&2
        echo "  N8N_DATA_DIR      n8n data directory (default: ~/.n8n)" >&2
        echo "  BACKUP_DIR        Backup output directory (default: ./backups)" >&2
        echo "  BACKUP_RETENTION  Number of backups to keep (default: 7)" >&2
        exit 1
    fi
done

# Output configuration
BACKUP_NAME="n8n-${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}.tgz"
TEMP_DIR="${BACKUP_DIR}/.tmp-${TIMESTAMP}"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# Error handling
cleanup() {
    if [[ -d "$TEMP_DIR" ]]; then
        log "🧹 Cleaning up temporary directory..."
        rm -rf "$TEMP_DIR"
    fi
}
trap cleanup EXIT

# Verify required tools
check_dependencies() {
    local missing_deps=()

    if ! command -v pg_dump >/dev/null 2>&1; then
        missing_deps+=("pg_dump (postgresql-client)")
    fi

    if ! command -v tar >/dev/null 2>&1; then
        missing_deps+=("tar")
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
test_db_connection() {
    log "🔍 Testing database connection..."

    # Use pg_isready to test connection without exposing password in logs
    if ! PGPASSWORD="$DB_PASSWORD" pg_isready -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
        log "❌ Cannot connect to database"
        log "   Host: $DB_HOST"
        log "   Database: $DB_NAME"
        log "   User: $DB_USER"
        exit 1
    fi

    log "✅ Database connection successful"
}

# Create backup directory structure
setup_backup_dir() {
    log "📁 Setting up backup directories..."

    if [[ ! -d "$BACKUP_DIR" ]]; then
        mkdir -p "$BACKUP_DIR"
        log "   Created backup directory: $BACKUP_DIR"
    fi

    mkdir -p "$TEMP_DIR"
    log "   Created temporary directory: $TEMP_DIR"
}

# Backup PostgreSQL database
backup_database() {
    log "💾 Starting database backup..."

    local db_backup_file="$TEMP_DIR/database.sql"

    # Create database dump with compression
    if PGPASSWORD="$DB_PASSWORD" pg_dump \
        --host="$DB_HOST" \
        --username="$DB_USER" \
        --dbname="$DB_NAME" \
        --no-password \
        --verbose \
        --create \
        --clean \
        --if-exists \
        --format=plain \
        --file="$db_backup_file" \
        2>/dev/null; then

        log "✅ Database backup completed"
        log "   Size: $(du -h "$db_backup_file" | cut -f1)"
    else
        log "❌ Database backup failed"
        exit 1
    fi
}

# Backup n8n data directory
backup_n8n_data() {
    log "📦 Starting n8n data backup..."

    if [[ ! -d "$N8N_DATA_DIR" ]]; then
        log "⚠️  n8n data directory not found: $N8N_DATA_DIR"
        log "   Creating empty n8n data archive..."
        mkdir -p "$TEMP_DIR/n8n_data"
        echo "# n8n data directory was not found during backup" > "$TEMP_DIR/n8n_data/README.txt"
        echo "# Original path: $N8N_DATA_DIR" >> "$TEMP_DIR/n8n_data/README.txt"
        echo "# Backup timestamp: $TIMESTAMP" >> "$TEMP_DIR/n8n_data/README.txt"
        return
    fi

    # Copy n8n data directory
    if cp -r "$N8N_DATA_DIR" "$TEMP_DIR/n8n_data"; then
        log "✅ n8n data backup completed"
        log "   Source: $N8N_DATA_DIR"
        log "   Size: $(du -h "$TEMP_DIR/n8n_data" | tail -1 | cut -f1)"
    else
        log "❌ n8n data backup failed"
        exit 1
    fi
}

# Create metadata file
create_metadata() {
    log "📝 Creating backup metadata..."

    local metadata_file="$TEMP_DIR/backup-metadata.txt"

    cat > "$metadata_file" <<EOF
# n8n Backup Metadata
# Generated: $(date)

[Backup Info]
timestamp=$TIMESTAMP
backup_version=1.0
script_version=$(git rev-parse HEAD 2>/dev/null || echo "unknown")

[Database]
host=$DB_HOST
name=$DB_NAME
user=$DB_USER
pg_dump_version=$(pg_dump --version | head -1)

[n8n Data]
source_dir=$N8N_DATA_DIR
data_exists=$(if [[ -d "$N8N_DATA_DIR" ]]; then echo "true"; else echo "false"; fi)

[System]
hostname=$(hostname)
os=$(uname -s)
arch=$(uname -m)
user=$(whoami)
pwd=$(pwd)

[Files]
$(find "$TEMP_DIR" -type f -exec basename {} \; | sort)
EOF

    log "✅ Metadata created"
}

# Create compressed archive
create_archive() {
    log "🗜️  Creating compressed archive..."

    # Create tarball with compression
    if tar -czf "$BACKUP_PATH" -C "$TEMP_DIR" .; then
        log "✅ Archive created successfully"
        log "   Path: $BACKUP_PATH"
        log "   Size: $(du -h "$BACKUP_PATH" | cut -f1)"
    else
        log "❌ Archive creation failed"
        exit 1
    fi
}

# Prune old backups
prune_backups() {
    log "🗑️  Pruning old backups (keeping $BACKUP_RETENTION)..."

    # Find and sort backup files by modification time (newest first)
    local backup_files=()
    while IFS= read -r -d '' file; do
        backup_files+=("$file")
    done < <(find "$BACKUP_DIR" -name "n8n-*.tgz" -type f -print0 | sort -z)

    local total_backups=${#backup_files[@]}

    if [[ $total_backups -le $BACKUP_RETENTION ]]; then
        log "   No pruning needed ($total_backups <= $BACKUP_RETENTION)"
        return
    fi

    # Sort by modification time (newest first) and remove oldest
    local sorted_files=()
    while IFS= read -r -d '' file; do
        sorted_files+=("$file")
    done < <(printf '%s\0' "${backup_files[@]}" | sort -z -k1,1 -t/ -k2,2nr)

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

# Verify backup integrity
verify_backup() {
    log "🔍 Verifying backup integrity..."

    # Test if tarball can be read
    if tar -tzf "$BACKUP_PATH" >/dev/null 2>&1; then
        log "✅ Backup archive integrity verified"
    else
        log "❌ Backup archive is corrupted!"
        exit 1
    fi

    # Check if required files exist in archive
    local required_files=("database.sql" "backup-metadata.txt")
    for file in "${required_files[@]}"; do
        if tar -tzf "$BACKUP_PATH" | grep -q "^$file$"; then
            log "   ✓ $file found in archive"
        else
            log "   ❌ $file missing from archive"
            exit 1
        fi
    done
}

# Main execution
main() {
    log "🚀 Starting n8n backup process..."
    log "   Timestamp: $TIMESTAMP"
    log "   Backup directory: $BACKUP_DIR"
    log "   Retention: $BACKUP_RETENTION files"
    log ""

    check_dependencies
    test_db_connection
    setup_backup_dir
    backup_database
    backup_n8n_data
    create_metadata
    create_archive
    verify_backup
    prune_backups

    log ""
    log "🎉 Backup completed successfully!"
    log "   Archive: $BACKUP_PATH"
    log "   Size: $(du -h "$BACKUP_PATH" | cut -f1)"
    log ""
    log "💡 Next steps:"
    log "   • Test restore: ./scripts/n8n-restore.sh $BACKUP_PATH"
    log "   • Verify integrity: tar -tzf $BACKUP_PATH"
    log "   • Set up automated backups: see docs/backups.md"
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi