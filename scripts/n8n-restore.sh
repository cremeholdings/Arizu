#!/usr/bin/env bash

# n8n Restore Script
# Restores PostgreSQL database and n8n data from backup archives
#
# ⚠️  WARNING: THIS WILL OVERWRITE EXISTING DATA ⚠️
#
# Required environment variables:
#   DB_HOST     - PostgreSQL host
#   DB_NAME     - Database name
#   DB_USER     - Database username (must have createdb privileges)
#   DB_PASSWORD - Database password
#
# Optional environment variables:
#   N8N_DATA_DIR - n8n data directory (default: ~/.n8n)
#   BACKUP_DIR   - Backup input directory (default: ./backups)
#
# Usage:
#   DB_HOST=localhost DB_NAME=arizu DB_USER=postgres DB_PASSWORD=secret ./scripts/n8n-restore.sh [backup_file] --yes

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Environment variables with defaults
N8N_DATA_DIR="${N8N_DATA_DIR:-$HOME/.n8n}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"

# Command line arguments
BACKUP_FILE=""
CONFIRMED=false

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --yes|-y)
                CONFIRMED=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            -*)
                echo "❌ Unknown option: $1" >&2
                echo "Use --help for usage information" >&2
                exit 1
                ;;
            *)
                if [[ -z "$BACKUP_FILE" ]]; then
                    BACKUP_FILE="$1"
                else
                    echo "❌ Too many arguments" >&2
                    exit 1
                fi
                shift
                ;;
        esac
    done
}

# Show help message
show_help() {
    cat <<EOF
n8n Restore Script

⚠️  WARNING: THIS WILL OVERWRITE EXISTING DATA ⚠️

Usage:
  $0 [backup_file] --yes

Arguments:
  backup_file    Path to backup archive (if not provided, will list available backups)

Options:
  --yes, -y      Confirm destructive operation (required)
  --help, -h     Show this help message

Required environment variables:
  DB_HOST        PostgreSQL host
  DB_NAME        Database name
  DB_USER        Database username (must have createdb privileges)
  DB_PASSWORD    Database password

Optional environment variables:
  N8N_DATA_DIR   n8n data directory (default: ~/.n8n)
  BACKUP_DIR     Backup input directory (default: ./backups)

Examples:
  # List available backups
  $0

  # Restore specific backup
  DB_HOST=localhost DB_NAME=arizu DB_USER=postgres DB_PASSWORD=secret \\
    $0 ./backups/n8n-2024-01-15-1430.tgz --yes

  # Restore latest backup
  DB_HOST=localhost DB_NAME=arizu DB_USER=postgres DB_PASSWORD=secret \\
    $0 \$(ls -t ./backups/n8n-*.tgz | head -1) --yes
EOF
}

# Required environment variables
REQUIRED_VARS=("DB_HOST" "DB_NAME" "DB_USER" "DB_PASSWORD")

# Validate environment
check_environment() {
    for var in "${REQUIRED_VARS[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            echo "❌ Error: Required environment variable $var is not set" >&2
            echo "" >&2
            echo "Run with --help for usage information" >&2
            exit 1
        fi
    done
}

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# List available backups
list_backups() {
    log "📋 Available backups in $BACKUP_DIR:"
    echo ""

    if [[ ! -d "$BACKUP_DIR" ]]; then
        echo "   No backup directory found: $BACKUP_DIR"
        echo ""
        return 1
    fi

    local backup_files=()
    while IFS= read -r -d '' file; do
        backup_files+=("$file")
    done < <(find "$BACKUP_DIR" -name "n8n-*.tgz" -type f -print0 2>/dev/null | sort -z)

    if [[ ${#backup_files[@]} -eq 0 ]]; then
        echo "   No backup files found (n8n-*.tgz)"
        echo ""
        echo "💡 Create a backup first:"
        echo "   ./scripts/n8n-backup.sh"
        echo ""
        return 1
    fi

    # Sort by modification time (newest first)
    local sorted_files=()
    while IFS= read -r file; do
        sorted_files+=("$file")
    done < <(printf '%s\n' "${backup_files[@]}" | xargs ls -t)

    for file in "${sorted_files[@]}"; do
        local size=$(du -h "$file" | cut -f1)
        local date=$(date -r "$file" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S' "$file" 2>/dev/null || echo "unknown")
        echo "   $(basename "$file") ($size, $date)"
    done
    echo ""
}

# Verify backup file
verify_backup() {
    log "🔍 Verifying backup file: $BACKUP_FILE"

    if [[ ! -f "$BACKUP_FILE" ]]; then
        log "❌ Backup file not found: $BACKUP_FILE"
        exit 1
    fi

    # Test archive integrity
    if ! tar -tzf "$BACKUP_FILE" >/dev/null 2>&1; then
        log "❌ Backup archive is corrupted or invalid"
        exit 1
    fi

    # Check for required files
    local required_files=("database.sql" "backup-metadata.txt")
    for file in "${required_files[@]}"; do
        if ! tar -tzf "$BACKUP_FILE" | grep -q "^$file$"; then
            log "❌ Required file missing from backup: $file"
            log "   This may not be a valid n8n backup archive"
            exit 1
        fi
    done

    log "✅ Backup file verification passed"
}

# Show backup metadata
show_metadata() {
    log "📋 Backup metadata:"
    echo ""

    if tar -xzf "$BACKUP_FILE" -O backup-metadata.txt 2>/dev/null; then
        echo ""
    else
        log "⚠️  Could not read backup metadata"
    fi
}

# Confirm destructive operation
confirm_restore() {
    if [[ "$CONFIRMED" == true ]]; then
        return 0
    fi

    echo ""
    log "⚠️  ⚠️  ⚠️  DESTRUCTIVE OPERATION WARNING ⚠️  ⚠️  ⚠️"
    echo ""
    echo "This operation will:"
    echo "  • DROP and RECREATE the database: $DB_NAME"
    echo "  • OVERWRITE the n8n data directory: $N8N_DATA_DIR"
    echo "  • PERMANENTLY DELETE all existing data"
    echo ""
    echo "Current targets:"
    echo "  Database: $DB_USER@$DB_HOST/$DB_NAME"
    echo "  n8n Data: $N8N_DATA_DIR"
    echo ""
    echo "Backup source:"
    echo "  File: $BACKUP_FILE"
    echo "  Size: $(du -h "$BACKUP_FILE" | cut -f1)"
    echo ""
    echo "⚠️  This action CANNOT be undone without a backup! ⚠️"
    echo ""
    echo "To proceed, run this command with the --yes flag:"
    echo "  $0 \"$BACKUP_FILE\" --yes"
    echo ""
    exit 1
}

# Check dependencies
check_dependencies() {
    local missing_deps=()

    if ! command -v psql >/dev/null 2>&1; then
        missing_deps+=("psql (postgresql-client)")
    fi

    if ! command -v createdb >/dev/null 2>&1; then
        missing_deps+=("createdb (postgresql-client)")
    fi

    if ! command -v dropdb >/dev/null 2>&1; then
        missing_deps+=("dropdb (postgresql-client)")
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

# Test database connection and privileges
test_db_connection() {
    log "🔍 Testing database connection and privileges..."

    # Test basic connection
    if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "SELECT version();" >/dev/null 2>&1; then
        log "❌ Cannot connect to PostgreSQL server"
        log "   Host: $DB_HOST"
        log "   User: $DB_USER"
        exit 1
    fi

    # Test createdb privilege (required for restore)
    if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "SELECT 1;" >/dev/null 2>&1; then
        log "❌ User does not have sufficient privileges"
        log "   User $DB_USER must have createdb privileges"
        exit 1
    fi

    log "✅ Database connection and privileges verified"
}

# Extract backup to temporary directory
extract_backup() {
    local temp_dir="$1"

    log "📦 Extracting backup archive..."

    if tar -xzf "$BACKUP_FILE" -C "$temp_dir"; then
        log "✅ Backup extracted successfully"
    else
        log "❌ Failed to extract backup archive"
        exit 1
    fi
}

# Restore database
restore_database() {
    local temp_dir="$1"
    local db_file="$temp_dir/database.sql"

    log "💾 Restoring database..."

    # Drop existing database if it exists
    log "   Dropping existing database (if exists)..."
    PGPASSWORD="$DB_PASSWORD" dropdb \
        --host="$DB_HOST" \
        --username="$DB_USER" \
        --if-exists \
        "$DB_NAME" >/dev/null 2>&1 || true

    # Create new database
    log "   Creating new database..."
    if ! PGPASSWORD="$DB_PASSWORD" createdb \
        --host="$DB_HOST" \
        --username="$DB_USER" \
        "$DB_NAME"; then
        log "❌ Failed to create database"
        exit 1
    fi

    # Restore from dump
    log "   Restoring data from dump..."
    if PGPASSWORD="$DB_PASSWORD" psql \
        --host="$DB_HOST" \
        --username="$DB_USER" \
        --dbname="$DB_NAME" \
        --quiet \
        --file="$db_file" >/dev/null 2>&1; then
        log "✅ Database restored successfully"
    else
        log "❌ Database restore failed"
        exit 1
    fi
}

# Restore n8n data
restore_n8n_data() {
    local temp_dir="$1"
    local n8n_backup_dir="$temp_dir/n8n_data"

    log "📦 Restoring n8n data..."

    if [[ ! -d "$n8n_backup_dir" ]]; then
        log "⚠️  No n8n data found in backup"
        return 0
    fi

    # Backup existing n8n data if it exists
    if [[ -d "$N8N_DATA_DIR" ]]; then
        local backup_suffix="backup-$(date +%Y%m%d-%H%M%S)"
        local existing_backup="${N8N_DATA_DIR}.${backup_suffix}"

        log "   Backing up existing n8n data to: $existing_backup"
        if ! mv "$N8N_DATA_DIR" "$existing_backup"; then
            log "❌ Failed to backup existing n8n data"
            exit 1
        fi
    fi

    # Create parent directory if needed
    local parent_dir=$(dirname "$N8N_DATA_DIR")
    if [[ ! -d "$parent_dir" ]]; then
        mkdir -p "$parent_dir"
    fi

    # Restore n8n data
    log "   Copying n8n data to: $N8N_DATA_DIR"
    if cp -r "$n8n_backup_dir" "$N8N_DATA_DIR"; then
        log "✅ n8n data restored successfully"
    else
        log "❌ n8n data restore failed"
        exit 1
    fi
}

# Main restore process
perform_restore() {
    local temp_dir=$(mktemp -d)

    # Cleanup function
    cleanup() {
        if [[ -d "$temp_dir" ]]; then
            rm -rf "$temp_dir"
        fi
    }
    trap cleanup EXIT

    log "🚀 Starting restore process..."
    log "   Backup file: $BACKUP_FILE"
    log "   Temporary directory: $temp_dir"
    echo ""

    extract_backup "$temp_dir"
    restore_database "$temp_dir"
    restore_n8n_data "$temp_dir"

    log ""
    log "🎉 Restore completed successfully!"
    log ""
    log "💡 Next steps:"
    log "   • Restart n8n if it's running"
    log "   • Verify workflows are working correctly"
    log "   • Check application logs for any issues"
    log "   • Run integration tests if available"
}

# Main execution
main() {
    parse_args "$@"
    check_environment

    # If no backup file specified, list available backups
    if [[ -z "$BACKUP_FILE" ]]; then
        list_backups
        echo "💡 Specify a backup file to restore:"
        echo "   $0 <backup_file> --yes"
        echo ""
        exit 0
    fi

    check_dependencies
    test_db_connection
    verify_backup
    show_metadata
    confirm_restore
    perform_restore
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi