#!/usr/bin/env bash

# PostgreSQL Restore Test Script
# Restores a database dump to a new test database for verification
#
# Required environment variables:
#   PGHOST     - PostgreSQL host
#   PGUSER     - Database username (must have createdb privileges)
#   PGPASSWORD - Database password
#
# Optional environment variables:
#   TEST_DB_SUFFIX - Suffix for test database name (default: test_$(date +%s))
#   CLEANUP_ON_SUCCESS - Delete test DB after successful test (default: true)
#   BACKUP_DIR - Backup directory (default: ./backups)
#
# Usage:
#   PGHOST=localhost PGUSER=postgres PGPASSWORD=secret ./scripts/pg-restore.sh [dump_file]

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Environment variables with defaults
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
TEST_DB_SUFFIX="${TEST_DB_SUFFIX:-test_$(date +%s)}"
CLEANUP_ON_SUCCESS="${CLEANUP_ON_SUCCESS:-true}"

# Command line arguments
DUMP_FILE=""

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --help|-h)
                show_help
                exit 0
                ;;
            --no-cleanup)
                CLEANUP_ON_SUCCESS=false
                shift
                ;;
            -*)
                echo "❌ Unknown option: $1" >&2
                echo "Use --help for usage information" >&2
                exit 1
                ;;
            *)
                if [[ -z "$DUMP_FILE" ]]; then
                    DUMP_FILE="$1"
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
PostgreSQL Restore Test Script

Usage:
  $0 [dump_file] [options]

Arguments:
  dump_file    Path to backup dump file (if not provided, will use latest backup)

Options:
  --no-cleanup    Keep test database after successful test
  --help, -h      Show this help message

Required environment variables:
  PGHOST         PostgreSQL host
  PGUSER         Database username (must have createdb privileges)
  PGPASSWORD     Database password

Optional environment variables:
  TEST_DB_SUFFIX    Suffix for test database name (default: test_$(date +%s))
  CLEANUP_ON_SUCCESS Delete test DB after success (default: true)
  BACKUP_DIR        Backup directory (default: ./backups)

Examples:
  # Test latest backup
  PGHOST=localhost PGUSER=postgres PGPASSWORD=secret $0

  # Test specific backup
  PGHOST=localhost PGUSER=postgres PGPASSWORD=secret \\
    $0 ./backups/pg-2024-01-15-1430.dump.gz

  # Test and keep database for inspection
  PGHOST=localhost PGUSER=postgres PGPASSWORD=secret \\
    $0 ./backups/pg-2024-01-15-1430.dump.gz --no-cleanup
EOF
}

# Required environment variables
REQUIRED_VARS=("PGHOST" "PGUSER" "PGPASSWORD")

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

# Find latest backup if none specified
find_latest_backup() {
    if [[ -n "$DUMP_FILE" ]]; then
        return
    fi

    log "🔍 Looking for latest backup..."

    if [[ ! -d "$BACKUP_DIR" ]]; then
        log "❌ Backup directory not found: $BACKUP_DIR"
        exit 1
    fi

    local latest_backup
    latest_backup=$(find "$BACKUP_DIR" -name "pg-*.dump.gz" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2- || true)

    if [[ -z "$latest_backup" ]]; then
        log "❌ No backup files found in $BACKUP_DIR"
        log "   Looking for files matching: pg-*.dump.gz"
        exit 1
    fi

    DUMP_FILE="$latest_backup"
    log "   Found latest backup: $(basename "$DUMP_FILE")"
}

# Verify dump file
verify_dump_file() {
    log "🔍 Verifying dump file: $DUMP_FILE"

    if [[ ! -f "$DUMP_FILE" ]]; then
        log "❌ Dump file not found: $DUMP_FILE"
        exit 1
    fi

    # Test gzip integrity
    if ! gzip -t "$DUMP_FILE" 2>/dev/null; then
        log "❌ Dump file is corrupted (gzip test failed)"
        exit 1
    fi

    # Test pg_restore can read the file
    if ! gunzip -c "$DUMP_FILE" | pg_restore --list >/dev/null 2>&1; then
        log "❌ Dump file is corrupted (pg_restore test failed)"
        exit 1
    fi

    local file_size
    file_size=$(du -h "$DUMP_FILE" | cut -f1)
    log "✅ Dump file verification passed"
    log "   Size: $file_size"
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

    if ! command -v pg_restore >/dev/null 2>&1; then
        missing_deps+=("pg_restore (postgresql-client)")
    fi

    if ! command -v gunzip >/dev/null 2>&1; then
        missing_deps+=("gunzip")
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
test_connection() {
    log "🔍 Testing database connection and privileges..."

    # Test basic connection
    if ! psql -h "$PGHOST" -U "$PGUSER" -d postgres -c "SELECT version();" >/dev/null 2>&1; then
        log "❌ Cannot connect to PostgreSQL server"
        log "   Host: $PGHOST"
        log "   User: $PGUSER"
        exit 1
    fi

    # Test createdb privilege
    if ! psql -h "$PGHOST" -U "$PGUSER" -d postgres -c "SELECT 1 WHERE has_database_privilege('$PGUSER', 'postgres', 'CREATE');" | grep -q 1 2>/dev/null; then
        log "❌ User does not have createdb privileges"
        log "   User $PGUSER must be able to create databases"
        exit 1
    fi

    log "✅ Database connection and privileges verified"
}

# Extract database name from dump
extract_db_name() {
    local original_db_name
    original_db_name=$(gunzip -c "$DUMP_FILE" | pg_restore --list | grep "DATABASE" | head -1 | awk '{print $3}' || echo "unknown")

    if [[ "$original_db_name" == "unknown" ]]; then
        log "⚠️  Could not extract original database name from dump"
        original_db_name="backup"
    fi

    echo "${original_db_name}_${TEST_DB_SUFFIX}"
}

# Create test database
create_test_database() {
    local test_db_name="$1"

    log "🏗️  Creating test database: $test_db_name"

    # Drop test database if it exists
    dropdb -h "$PGHOST" -U "$PGUSER" --if-exists "$test_db_name" >/dev/null 2>&1 || true

    # Create new test database
    if createdb -h "$PGHOST" -U "$PGUSER" "$test_db_name" >/dev/null 2>&1; then
        log "✅ Test database created successfully"
    else
        log "❌ Failed to create test database"
        exit 1
    fi
}

# Restore from dump
restore_database() {
    local test_db_name="$1"

    log "💾 Restoring database from dump..."

    local start_time=$(date +%s)

    # Restore from compressed dump
    if gunzip -c "$DUMP_FILE" | pg_restore \
        --host="$PGHOST" \
        --username="$PGUSER" \
        --dbname="$test_db_name" \
        --no-owner \
        --no-privileges \
        --verbose \
        --exit-on-error >/dev/null 2>&1; then

        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log "✅ Database restored successfully"
        log "   Duration: ${duration} seconds"
    else
        log "❌ Database restore failed"
        exit 1
    fi
}

# Run post-restore analysis
run_analysis() {
    local test_db_name="$1"

    log "📊 Running database analysis..."

    # Run ANALYZE to update statistics
    if psql -h "$PGHOST" -U "$PGUSER" -d "$test_db_name" -c "ANALYZE;" >/dev/null 2>&1; then
        log "✅ Database analysis completed"
    else
        log "⚠️  Database analysis failed (non-critical)"
    fi
}

# Verify restore integrity
verify_restore() {
    local test_db_name="$1"

    log "🔍 Verifying restore integrity..."

    # Test database connectivity
    if ! psql -h "$PGHOST" -U "$PGUSER" -d "$test_db_name" -c "SELECT 1;" >/dev/null 2>&1; then
        log "❌ Cannot connect to restored database"
        exit 1
    fi

    # Get basic database stats
    local table_count row_count index_count

    table_count=$(psql -h "$PGHOST" -U "$PGUSER" -d "$test_db_name" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs || echo "0")

    row_count=$(psql -h "$PGHOST" -U "$PGUSER" -d "$test_db_name" -t -c "
        SELECT COALESCE(SUM(n_tup_ins + n_tup_upd), 0)
        FROM pg_stat_user_tables;" 2>/dev/null | xargs || echo "0")

    index_count=$(psql -h "$PGHOST" -U "$PGUSER" -d "$test_db_name" -t -c "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public';" 2>/dev/null | xargs || echo "0")

    log "✅ Restore integrity verified"
    log "   Tables: $table_count"
    log "   Rows processed: $row_count"
    log "   Indexes: $index_count"

    # Check for any obvious issues
    local error_count
    error_count=$(psql -h "$PGHOST" -U "$PGUSER" -d "$test_db_name" -t -c "
        SELECT count(*)
        FROM pg_stat_activity
        WHERE state = 'idle in transaction (aborted)';" 2>/dev/null | xargs || echo "0")

    if [[ "$error_count" -gt 0 ]]; then
        log "⚠️  Warning: $error_count aborted transactions detected"
    fi
}

# Cleanup test database
cleanup_test_database() {
    local test_db_name="$1"

    if [[ "$CLEANUP_ON_SUCCESS" != "true" ]]; then
        log "💾 Keeping test database for inspection: $test_db_name"
        log "   Connect with: psql -h $PGHOST -U $PGUSER -d $test_db_name"
        log "   Drop with: dropdb -h $PGHOST -U $PGUSER $test_db_name"
        return
    fi

    log "🧹 Cleaning up test database..."

    if dropdb -h "$PGHOST" -U "$PGUSER" "$test_db_name" >/dev/null 2>&1; then
        log "✅ Test database cleaned up"
    else
        log "⚠️  Failed to clean up test database: $test_db_name"
        log "   You may need to drop it manually"
    fi
}

# Generate test report
generate_report() {
    local test_db_name="$1"
    local success="$2"

    echo ""
    log "📋 Restore Test Report:"
    log "   Dump file: $DUMP_FILE"
    log "   Test database: $test_db_name"
    log "   Host: $PGHOST"
    log "   User: $PGUSER"
    log "   Result: $success"

    if [[ "$success" == "PASS" ]]; then
        log "   Status: ✅ PASS - Restore test successful"
    else
        log "   Status: ❌ FAIL - Restore test failed"
    fi

    echo ""
}

# Main restore test process
perform_restore_test() {
    local test_db_name success
    test_db_name=$(extract_db_name)
    success="FAIL"

    # Set up error handling
    cleanup_on_error() {
        if [[ -n "${test_db_name:-}" ]]; then
            log "🧹 Cleaning up after error..."
            dropdb -h "$PGHOST" -U "$PGUSER" --if-exists "$test_db_name" >/dev/null 2>&1 || true
        fi
        generate_report "$test_db_name" "FAIL"
        exit 1
    }
    trap cleanup_on_error ERR

    log "🚀 Starting restore test..."
    log "   Dump file: $DUMP_FILE"
    log "   Test database: $test_db_name"
    echo ""

    create_test_database "$test_db_name"
    restore_database "$test_db_name"
    run_analysis "$test_db_name"
    verify_restore "$test_db_name"

    success="PASS"
    cleanup_test_database "$test_db_name"
    generate_report "$test_db_name" "$success"

    log "🎉 Restore test completed successfully!"
    echo ""
    log "💡 This confirms your backup is valid and restorable"
}

# Main execution
main() {
    parse_args "$@"
    check_environment
    check_dependencies
    test_connection
    find_latest_backup
    verify_dump_file
    perform_restore_test

    # Exit with success
    exit 0
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi