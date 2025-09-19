#!/usr/bin/env bash

# Application Smoke Test
# Tests app connectivity and basic functionality after deployment
#
# Required environment variables:
#   APP_URL - Base URL for application (e.g., https://arizu.com)
#
# Optional environment variables:
#   APP_TIMEOUT - Request timeout in seconds (default: 10)
#   SMOKE_VERBOSE - Set to 1 for verbose output

set -euo pipefail

# Configuration
APP_TIMEOUT="${APP_TIMEOUT:-10}"
SMOKE_VERBOSE="${SMOKE_VERBOSE:-0}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    if [[ "$SMOKE_VERBOSE" == "1" ]]; then
        echo -e "${GREEN}[INFO]${NC} $*"
    fi
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Check dependencies
check_dependencies() {
    local missing_deps=()

    if ! command -v curl >/dev/null 2>&1; then
        missing_deps+=("curl")
    fi

    if ! command -v jq >/dev/null 2>&1; then
        missing_deps+=("jq")
    fi

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_error "Please install: sudo apt-get install curl jq"
        exit 1
    fi
}

# Validate environment
check_environment() {
    if [[ -z "${APP_URL:-}" ]]; then
        log_error "APP_URL environment variable is required"
        log_error "Example: export APP_URL=https://arizu.com"
        exit 1
    fi

    # Remove trailing slash from URL
    APP_URL="${APP_URL%/}"

    log_info "App URL: $APP_URL"
    log_info "Timeout: ${APP_TIMEOUT}s"
}

# Test application health endpoint
test_health() {
    log_info "Testing application health endpoint..."

    local health_url="${APP_URL}/api/health"
    local response

    if ! response=$(curl -sSf --max-time "$APP_TIMEOUT" "$health_url" 2>/dev/null); then
        log_error "App health check failed - endpoint not responding"
        log_error "URL: $health_url"
        return 1
    fi

    # Check if response is valid JSON
    if ! echo "$response" | jq empty >/dev/null 2>&1; then
        log_error "App health check failed - invalid JSON response"
        log_error "Response: $response"
        return 1
    fi

    # Check if ok field is true
    local is_ok
    if ! is_ok=$(echo "$response" | jq -r '.ok' 2>/dev/null); then
        log_error "App health check failed - no 'ok' field in response"
        log_error "Response: $response"
        return 1
    fi

    if [[ "$is_ok" != "true" ]]; then
        log_error "App health check failed - ok=$is_ok"
        log_error "Response: $response"
        return 1
    fi

    log_info "App health check passed"
    return 0
}

# Test application components
test_components() {
    log_info "Testing application component health..."

    local health_url="${APP_URL}/api/health?detailed=true"
    local response

    if ! response=$(curl -sSf --max-time "$APP_TIMEOUT" "$health_url" 2>/dev/null); then
        log_warn "App detailed health check failed - endpoint not responding"
        return 0  # Don't fail smoke test for detailed endpoint
    fi

    # Extract component status
    local components
    if ! components=$(echo "$response" | jq -r '.components' 2>/dev/null); then
        log_warn "App component check failed - no components in response"
        return 0
    fi

    # Check individual components
    local db_status redis_status n8n_status
    db_status=$(echo "$components" | jq -r '.db // "unknown"')
    redis_status=$(echo "$components" | jq -r '.redis // "unknown"')
    n8n_status=$(echo "$components" | jq -r '.n8n // "unknown"')

    log_info "Component status - DB: $db_status, Redis: $redis_status, n8n: $n8n_status"

    # Check for any critical component failures
    if [[ "$db_status" == "down" ]]; then
        log_error "Database component is down"
        return 1
    fi

    if [[ "$redis_status" == "down" ]]; then
        log_warn "Redis component is down - may affect performance"
    fi

    if [[ "$n8n_status" == "down" ]]; then
        log_warn "n8n component is down - workflow functionality may be impacted"
    fi

    return 0
}

# Test application version endpoint
test_version() {
    log_info "Testing application version..."

    local health_url="${APP_URL}/api/health"
    local response

    if ! response=$(curl -sSf --max-time "$APP_TIMEOUT" "$health_url" 2>/dev/null); then
        log_warn "Version check failed - health endpoint not responding"
        return 0
    fi

    local version
    if version=$(echo "$response" | jq -r '.version // "unknown"' 2>/dev/null); then
        if [[ "$version" != "unknown" && "$version" != "null" ]]; then
            log_info "App version: $version"
        else
            log_info "App version not available"
        fi
    fi

    return 0
}

# Test application status page
test_status_page() {
    log_info "Testing public status page..."

    local status_url="${APP_URL}/status"
    local response_code

    if response_code=$(curl -sS --max-time "$APP_TIMEOUT" -o /dev/null -w "%{http_code}" "$status_url" 2>/dev/null); then
        if [[ "$response_code" == "200" ]]; then
            log_info "Status page accessible (HTTP $response_code)"
            return 0
        else
            log_warn "Status page returned HTTP $response_code"
            return 0  # Don't fail smoke test for status page issues
        fi
    else
        log_warn "Status page not accessible"
        return 0  # Don't fail smoke test for status page issues
    fi
}

# Test application root endpoint
test_root() {
    log_info "Testing application root endpoint..."

    local root_url="$APP_URL/"
    local response_code

    if response_code=$(curl -sS --max-time "$APP_TIMEOUT" -o /dev/null -w "%{http_code}" "$root_url" 2>/dev/null); then
        if [[ "$response_code" =~ ^[23] ]]; then
            log_info "Root endpoint accessible (HTTP $response_code)"
            return 0
        else
            log_error "Root endpoint returned HTTP $response_code"
            return 1
        fi
    else
        log_error "Root endpoint not accessible"
        return 1
    fi
}

# Test SSL certificate (for HTTPS URLs)
test_ssl() {
    if [[ "$APP_URL" =~ ^https:// ]]; then
        log_info "Testing SSL certificate..."

        local ssl_info
        if ssl_info=$(curl -sS --max-time "$APP_TIMEOUT" -vI "$APP_URL" 2>&1 | grep -E "(SSL|TLS|certificate)" | head -3); then
            log_info "SSL certificate appears valid"
            if [[ "$SMOKE_VERBOSE" == "1" && -n "$ssl_info" ]]; then
                echo "$ssl_info" | while read -r line; do
                    log_info "SSL: $line"
                done
            fi
        else
            log_warn "Could not verify SSL certificate details"
        fi
    else
        log_info "Skipping SSL test - HTTP URL detected"
    fi

    return 0
}

# Test SLO metrics
test_slo_metrics() {
    log_info "Testing SLO metrics..."

    local health_url="${APP_URL}/api/health"
    local response

    if ! response=$(curl -sSf --max-time "$APP_TIMEOUT" "$health_url" 2>/dev/null); then
        log_warn "SLO metrics check failed - health endpoint not responding"
        return 0
    fi

    # Check for SLO data
    local slo_data
    if slo_data=$(echo "$response" | jq -r '.slo' 2>/dev/null); then
        if [[ "$slo_data" != "null" ]]; then
            log_info "SLO metrics available"
            if [[ "$SMOKE_VERBOSE" == "1" ]]; then
                echo "$slo_data" | jq . 2>/dev/null || echo "$slo_data"
            fi
        fi
    fi

    # Check for P95 latency data
    local p95_data
    if p95_data=$(echo "$response" | jq -r '.p95' 2>/dev/null); then
        if [[ "$p95_data" != "null" ]]; then
            log_info "P95 latency metrics available"
            if [[ "$SMOKE_VERBOSE" == "1" ]]; then
                echo "$p95_data" | jq . 2>/dev/null || echo "$p95_data"
            fi
        fi
    fi

    return 0
}

# Main test execution
run_smoke_tests() {
    local start_time
    start_time=$(date +%s)

    echo "🧪 Starting application smoke tests..."
    echo "Target: $APP_URL"
    echo ""

    # Run tests in order of criticality
    local tests=(
        "test_root"
        "test_health"
        "test_components"
        "test_version"
        "test_status_page"
        "test_ssl"
        "test_slo_metrics"
    )

    local failed_tests=()

    for test_func in "${tests[@]}"; do
        if ! "$test_func"; then
            failed_tests+=("$test_func")
        fi
    done

    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))

    echo ""
    echo "📊 Smoke Test Results:"
    echo "Duration: ${duration}s"
    echo "Tests run: ${#tests[@]}"
    echo "Failed: ${#failed_tests[@]}"

    if [[ ${#failed_tests[@]} -eq 0 ]]; then
        echo -e "${GREEN}✅ Application smoke tests PASSED${NC}"
        echo "app OK"
        return 0
    else
        echo -e "${RED}❌ Application smoke tests FAILED${NC}"
        echo "Failed tests: ${failed_tests[*]}"
        echo "app health failed"
        return 1
    fi
}

# Error handling
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log_error "App smoke test interrupted"
    fi
    exit $exit_code
}

trap cleanup INT TERM

# Usage information
show_usage() {
    cat << EOF
Application Smoke Test Script

Usage: $0 [options]

Environment Variables:
  APP_URL          Application base URL (required)
  APP_TIMEOUT      Request timeout in seconds (default: 10)
  SMOKE_VERBOSE    Set to 1 for verbose output (default: 0)

Examples:
  # Basic smoke test
  APP_URL=https://arizu.com $0

  # Local development testing
  APP_URL=http://localhost:3000 $0

  # Verbose output
  APP_URL=https://arizu.com SMOKE_VERBOSE=1 $0

Exit Codes:
  0 - All tests passed
  1 - One or more critical tests failed

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        -v|--verbose)
            SMOKE_VERBOSE=1
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Main execution
main() {
    check_dependencies
    check_environment
    run_smoke_tests
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi