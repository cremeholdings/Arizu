#!/usr/bin/env bash

# n8n Export Script
# Exports workflows and executions via REST API or volume backup
#
# Optional environment variables:
#   N8N_API_URL    - n8n API URL (default: http://localhost:5678)
#   N8N_API_KEY    - n8n API key for authentication
#   N8N_DATA_DIR   - n8n data directory for volume backup (default: ~/.n8n)
#   BACKUP_DIR     - Export directory (default: ./backups)
#   EXPORT_PREFIX  - Filename prefix (default: n8n)
#   REDACT_SENSITIVE - Redact sensitive fields (default: true)
#
# Usage:
#   N8N_API_KEY=your_api_key ./scripts/n8n-export.sh

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TIMESTAMP="$(date +%F-%H%M)"

# Environment variables with defaults
N8N_API_URL="${N8N_API_URL:-http://localhost:5678}"
N8N_DATA_DIR="${N8N_DATA_DIR:-$HOME/.n8n}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
EXPORT_PREFIX="${EXPORT_PREFIX:-n8n}"
REDACT_SENSITIVE="${REDACT_SENSITIVE:-true}"

# Output configuration
EXPORT_NAME="${EXPORT_PREFIX}-export-${TIMESTAMP}"
EXPORT_DIR="${BACKUP_DIR}/${EXPORT_NAME}"
EXPORT_ARCHIVE="${BACKUP_DIR}/${EXPORT_NAME}.tgz"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# Show help message
show_help() {
    cat <<EOF
n8n Export Script

Exports n8n workflows and executions via REST API or volume backup.

Usage:
  $0 [options]

Options:
  --api-only      Use only REST API export (skip volume backup)
  --volume-only   Use only volume backup (skip REST API)
  --help, -h      Show this help message

Environment variables:
  N8N_API_URL       n8n API URL (default: http://localhost:5678)
  N8N_API_KEY       n8n API key for authentication (optional)
  N8N_DATA_DIR      n8n data directory (default: ~/.n8n)
  BACKUP_DIR        Export directory (default: ./backups)
  EXPORT_PREFIX     Filename prefix (default: n8n)
  REDACT_SENSITIVE  Redact sensitive fields (default: true)

Examples:
  # Export with API (if available) and volume backup
  N8N_API_KEY=your_api_key $0

  # Volume backup only
  $0 --volume-only

  # API export only
  N8N_API_KEY=your_api_key $0 --api-only
EOF
}

# Parse command line arguments
API_ONLY=false
VOLUME_ONLY=false

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --api-only)
                API_ONLY=true
                shift
                ;;
            --volume-only)
                VOLUME_ONLY=true
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
                echo "❌ Unexpected argument: $1" >&2
                echo "Use --help for usage information" >&2
                exit 1
                ;;
        esac
    done
}

# Check required tools
check_dependencies() {
    local missing_deps=()

    if [[ "$API_ONLY" != true ]] && ! command -v tar >/dev/null 2>&1; then
        missing_deps+=("tar")
    fi

    if [[ "$VOLUME_ONLY" != true ]] && ! command -v curl >/dev/null 2>&1; then
        missing_deps+=("curl")
    fi

    if [[ "$REDACT_SENSITIVE" == true ]] && ! command -v jq >/dev/null 2>&1; then
        missing_deps+=("jq (for sensitive data redaction)")
    fi

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log "❌ Missing required dependencies:"
        for dep in "${missing_deps[@]}"; do
            log "   - $dep"
        done
        exit 1
    fi
}

# Setup export directory
setup_export_dir() {
    log "📁 Setting up export directory..."

    if [[ ! -d "$BACKUP_DIR" ]]; then
        mkdir -p "$BACKUP_DIR"
        log "   Created backup directory: $BACKUP_DIR"
    fi

    if [[ -d "$EXPORT_DIR" ]]; then
        rm -rf "$EXPORT_DIR"
    fi

    mkdir -p "$EXPORT_DIR"
    log "   Created export directory: $EXPORT_DIR"
}

# Test n8n API connectivity
test_api_connectivity() {
    if [[ "$VOLUME_ONLY" == true ]]; then
        return 0
    fi

    log "🔍 Testing n8n API connectivity..."

    local health_url="${N8N_API_URL}/healthz"
    local auth_header=""

    if [[ -n "${N8N_API_KEY:-}" ]]; then
        auth_header="-H X-N8N-API-KEY:$N8N_API_KEY"
    fi

    # Test API health endpoint
    if curl -s --max-time 10 $auth_header "$health_url" >/dev/null 2>&1; then
        log "✅ n8n API is accessible"
        return 0
    else
        log "⚠️  n8n API not accessible at $N8N_API_URL"
        if [[ "$API_ONLY" == true ]]; then
            log "❌ API-only mode requested but API is not available"
            exit 1
        fi
        log "   Will use volume backup only"
        return 1
    fi
}

# Redact sensitive information from JSON
redact_sensitive_data() {
    local input_file="$1"
    local output_file="$2"

    if [[ "$REDACT_SENSITIVE" != true ]] || ! command -v jq >/dev/null 2>&1; then
        cp "$input_file" "$output_file"
        return
    fi

    # List of fields to redact
    local sensitive_fields=(
        ".credentials"
        ".nodes[].credentials"
        ".nodes[].parameters.password"
        ".nodes[].parameters.apiKey"
        ".nodes[].parameters.token"
        ".nodes[].parameters.secret"
        ".nodes[].parameters.auth"
        ".nodes[].parameters.authentication"
        ".data.executionData.contextData"
        ".data.startData.destinationNode"
        ".data.executionData.nodeExecutionStack"
    )

    # Create jq filter to redact sensitive fields
    local jq_filter=""
    for field in "${sensitive_fields[@]}"; do
        if [[ -n "$jq_filter" ]]; then
            jq_filter="$jq_filter | "
        fi
        jq_filter="$jq_filter($field // empty) = \"[REDACTED]\""
    done

    # Apply redaction
    if jq "$jq_filter" "$input_file" > "$output_file" 2>/dev/null; then
        log "   Applied sensitive data redaction"
    else
        log "   Redaction failed, using original data"
        cp "$input_file" "$output_file"
    fi
}

# Export workflows via API
export_workflows_api() {
    local api_available="$1"

    if [[ "$api_available" != "true" ]]; then
        return 0
    fi

    log "📋 Exporting workflows via API..."

    local workflows_url="${N8N_API_URL}/api/v1/workflows"
    local auth_header=""
    local workflows_file="$EXPORT_DIR/workflows-raw.json"
    local workflows_clean="$EXPORT_DIR/workflows.json"

    if [[ -n "${N8N_API_KEY:-}" ]]; then
        auth_header="-H X-N8N-API-KEY:$N8N_API_KEY"
    fi

    # Fetch workflows
    if curl -s --max-time 30 $auth_header "$workflows_url" > "$workflows_file" 2>/dev/null; then
        local workflow_count
        workflow_count=$(jq '. | length' "$workflows_file" 2>/dev/null || echo "unknown")

        # Redact sensitive data
        redact_sensitive_data "$workflows_file" "$workflows_clean"
        rm "$workflows_file"

        log "✅ Exported $workflow_count workflows via API"
    else
        log "⚠️  Failed to export workflows via API"
    fi
}

# Export executions via API
export_executions_api() {
    local api_available="$1"

    if [[ "$api_available" != "true" ]]; then
        return 0
    fi

    log "🚀 Exporting executions via API..."

    local executions_url="${N8N_API_URL}/api/v1/executions"
    local auth_header=""
    local executions_file="$EXPORT_DIR/executions-raw.json"
    local executions_clean="$EXPORT_DIR/executions.json"

    if [[ -n "${N8N_API_KEY:-}" ]]; then
        auth_header="-H X-N8N-API-KEY:$N8N_API_KEY"
    fi

    # Fetch recent executions (limit to last 100)
    if curl -s --max-time 30 $auth_header "${executions_url}?limit=100" > "$executions_file" 2>/dev/null; then
        local execution_count
        execution_count=$(jq '.data | length' "$executions_file" 2>/dev/null || echo "unknown")

        # Redact sensitive data
        redact_sensitive_data "$executions_file" "$executions_clean"
        rm "$executions_file"

        log "✅ Exported $execution_count executions via API"
    else
        log "⚠️  Failed to export executions via API"
    fi
}

# Export settings via API
export_settings_api() {
    local api_available="$1"

    if [[ "$api_available" != "true" ]]; then
        return 0
    fi

    log "⚙️  Exporting settings via API..."

    local settings_url="${N8N_API_URL}/api/v1/variables"
    local auth_header=""
    local settings_file="$EXPORT_DIR/settings-raw.json"
    local settings_clean="$EXPORT_DIR/settings.json"

    if [[ -n "${N8N_API_KEY:-}" ]]; then
        auth_header="-H X-N8N-API-KEY:$N8N_API_KEY"
    fi

    # Fetch variables/settings
    if curl -s --max-time 30 $auth_header "$settings_url" > "$settings_file" 2>/dev/null; then
        # Redact sensitive data
        redact_sensitive_data "$settings_file" "$settings_clean"
        rm "$settings_file"

        log "✅ Exported settings via API"
    else
        log "⚠️  Failed to export settings via API"
    fi
}

# Backup n8n data directory
backup_volume_data() {
    if [[ "$API_ONLY" == true ]]; then
        return 0
    fi

    log "📦 Backing up n8n data directory..."

    if [[ ! -d "$N8N_DATA_DIR" ]]; then
        log "⚠️  n8n data directory not found: $N8N_DATA_DIR"
        return 0
    fi

    local volume_backup_dir="$EXPORT_DIR/volume_data"
    mkdir -p "$volume_backup_dir"

    # Copy n8n data with exclusions for sensitive files
    local exclude_patterns=(
        "*.log"
        "logs/*"
        "cache/*"
        "temp/*"
        ".DS_Store"
        "Thumbs.db"
    )

    local rsync_excludes=""
    for pattern in "${exclude_patterns[@]}"; do
        rsync_excludes="$rsync_excludes --exclude=$pattern"
    done

    if command -v rsync >/dev/null 2>&1; then
        # Use rsync for better control over exclusions
        if rsync -av $rsync_excludes "$N8N_DATA_DIR/" "$volume_backup_dir/" >/dev/null 2>&1; then
            log "✅ Volume backup completed with rsync"
        else
            log "⚠️  rsync failed, falling back to cp"
            cp -r "$N8N_DATA_DIR"/* "$volume_backup_dir/" 2>/dev/null || true
        fi
    else
        # Fallback to cp
        cp -r "$N8N_DATA_DIR"/* "$volume_backup_dir/" 2>/dev/null || true
        log "✅ Volume backup completed with cp"
    fi

    # Get backup size
    local backup_size
    backup_size=$(du -h "$volume_backup_dir" | tail -1 | cut -f1)
    log "   Volume backup size: $backup_size"
}

# Create export metadata
create_metadata() {
    log "📝 Creating export metadata..."

    local metadata_file="$EXPORT_DIR/export-metadata.txt"

    cat > "$metadata_file" <<EOF
# n8n Export Metadata
# Generated: $(date)

[Export Info]
timestamp=$TIMESTAMP
export_version=1.0
script_version=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
redact_sensitive=$REDACT_SENSITIVE

[n8n Instance]
api_url=$N8N_API_URL
api_available=$(test_api_connectivity && echo "true" || echo "false")
data_dir=$N8N_DATA_DIR
data_dir_exists=$(if [[ -d "$N8N_DATA_DIR" ]]; then echo "true"; else echo "false"; fi)

[Export Methods]
api_export=$(if [[ "$VOLUME_ONLY" != true ]]; then echo "attempted"; else echo "skipped"; fi)
volume_backup=$(if [[ "$API_ONLY" != true ]]; then echo "attempted"; else echo "skipped"; fi)

[System]
hostname=$(hostname)
os=$(uname -s)
arch=$(uname -m)
user=$(whoami)
pwd=$(pwd)

[Files Exported]
$(find "$EXPORT_DIR" -type f -exec basename {} \; | sort)
EOF

    log "✅ Metadata created"
}

# Create compressed archive
create_archive() {
    log "🗜️  Creating compressed archive..."

    # Create tarball
    if tar -czf "$EXPORT_ARCHIVE" -C "$BACKUP_DIR" "$(basename "$EXPORT_DIR")"; then
        local archive_size
        archive_size=$(du -h "$EXPORT_ARCHIVE" | cut -f1)
        log "✅ Archive created successfully"
        log "   Path: $EXPORT_ARCHIVE"
        log "   Size: $archive_size"
    else
        log "❌ Archive creation failed"
        exit 1
    fi

    # Clean up temporary directory
    rm -rf "$EXPORT_DIR"
}

# Verify export integrity
verify_export() {
    log "🔍 Verifying export integrity..."

    # Test archive integrity
    if tar -tzf "$EXPORT_ARCHIVE" >/dev/null 2>&1; then
        log "✅ Export archive integrity verified"
    else
        log "❌ Export archive is corrupted!"
        exit 1
    fi

    # Check for required files
    local expected_files=("export-metadata.txt")
    for file in "${expected_files[@]}"; do
        if tar -tzf "$EXPORT_ARCHIVE" | grep -q "$file$"; then
            log "   ✓ $file found in archive"
        else
            log "   ⚠️  $file missing from archive"
        fi
    done
}

# Generate export report
generate_report() {
    log "📊 Export Summary:"
    log "   Timestamp: $TIMESTAMP"
    log "   Archive: $EXPORT_ARCHIVE"
    log "   Size: $(du -h "$EXPORT_ARCHIVE" | cut -f1)"
    log "   API URL: $N8N_API_URL"
    log "   Data Dir: $N8N_DATA_DIR"
    log "   Sensitive Data: $(if [[ "$REDACT_SENSITIVE" == true ]]; then echo "redacted"; else echo "preserved"; fi)"
}

# Main execution
main() {
    parse_args "$@"

    log "🚀 Starting n8n export..."
    log "   Export name: $EXPORT_NAME"
    log "   API URL: $N8N_API_URL"
    log "   Data directory: $N8N_DATA_DIR"
    log "   Redact sensitive: $REDACT_SENSITIVE"
    echo ""

    check_dependencies
    setup_export_dir

    # Determine available export methods
    local api_available="false"
    if test_api_connectivity; then
        api_available="true"
    fi

    # Perform exports
    export_workflows_api "$api_available"
    export_executions_api "$api_available"
    export_settings_api "$api_available"
    backup_volume_data
    create_metadata
    create_archive
    verify_export

    echo ""
    generate_report
    echo ""

    log "🎉 Export completed successfully!"
    echo ""
    log "💡 Next steps:"
    log "   • Verify export: tar -tzf $EXPORT_ARCHIVE"
    log "   • Test restore in dev environment"
    log "   • Store securely with other backups"

    # Exit with success
    exit 0
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi