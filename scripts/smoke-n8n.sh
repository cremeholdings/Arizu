#!/usr/bin/env bash

# n8n Smoke Test
# Tests n8n connectivity and basic functionality after deployment
#
# Required environment variables:
#   N8N_URL - Base URL for n8n instance (e.g., https://workflows.arizu.com)
#
# Optional environment variables:
#   N8N_TIMEOUT - Request timeout in seconds (default: 10)
#   N8N_API_KEY - API key for authenticated endpoints (optional)
#   SMOKE_VERBOSE - Set to 1 for verbose output

set -euo pipefail

# Configuration
N8N_TIMEOUT="${N8N_TIMEOUT:-10}"
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
    if [[ -z "${N8N_URL:-}" ]]; then
        log_error "N8N_URL environment variable is required"
        log_error "Example: export N8N_URL=https://workflows.arizu.com"
        exit 1
    fi

    # Remove trailing slash from URL
    N8N_URL="${N8N_URL%/}"

    log_info "n8n URL: $N8N_URL"
    log_info "Timeout: ${N8N_TIMEOUT}s"
}

# Test n8n health endpoint
test_health() {
    log_info "Testing n8n health endpoint..."

    local health_url="${N8N_URL}/healthz"
    local response

    if ! response=$(curl -sSf --max-time "$N8N_TIMEOUT" "$health_url" 2>/dev/null); then
        log_error "n8n health check failed - endpoint not responding"
        log_error "URL: $health_url"
        return 1
    fi

    # n8n health endpoint typically returns just "OK" or status object
    if [[ "$response" == "OK" ]] || echo "$response" | jq -e '.status' >/dev/null 2>&1; then
        log_info "n8n health check passed"
        return 0
    else
        log_error "n8n health check failed - unexpected response: $response"
        return 1
    fi
}

# Test n8n version endpoint
test_version() {
    log_info "Testing n8n version endpoint..."

    local version_url="${N8N_URL}/rest/version"
    local response

    if ! response=$(curl -sSf --max-time "$N8N_TIMEOUT" "$version_url" 2>/dev/null); then
        log_error "n8n version check failed - endpoint not responding"
        log_error "URL: $version_url"
        return 1
    fi

    # Extract version from response
    local version
    if ! version=$(echo "$response" | jq -r '.version' 2>/dev/null); then
        log_error "n8n version check failed - invalid JSON response"
        log_error "Response: $response"
        return 1
    fi

    if [[ "$version" == "null" || -z "$version" ]]; then
        log_error "n8n version check failed - no version in response"
        log_error "Response: $response"
        return 1
    fi

    log_info "n8n version: $version"
    return 0
}

# Test n8n settings endpoint (basic API functionality)
test_settings() {
    log_info "Testing n8n settings endpoint..."

    local settings_url="${N8N_URL}/rest/settings"
    local response
    local curl_args=("-sSf" "--max-time" "$N8N_TIMEOUT")

    # Add API key if provided
    if [[ -n "${N8N_API_KEY:-}" ]]; then
        curl_args+=("-H" "X-N8N-API-KEY: $N8N_API_KEY")
        log_info "Using API key for authentication"
    fi

    if ! response=$(curl "${curl_args[@]}" "$settings_url" 2>/dev/null); then
        log_warn "n8n settings check failed - this might be expected if authentication is required"
        return 0  # Don't fail the smoke test for this
    fi

    # Check if response is valid JSON
    if echo "$response" | jq empty >/dev/null 2>&1; then
        log_info "n8n API settings endpoint accessible"
        return 0
    else
        log_warn "n8n settings endpoint returned non-JSON response"
        return 0  # Don't fail the smoke test for this
    fi
}

# Test workflow execution endpoint (if API key provided)
test_workflow_api() {
    if [[ -z "${N8N_API_KEY:-}" ]]; then
        log_info "Skipping workflow API test - no API key provided"
        return 0
    fi

    log_info "Testing n8n workflow API endpoint..."

    local workflows_url="${N8N_URL}/api/v1/workflows"
    local response

    if ! response=$(curl -sSf --max-time "$N8N_TIMEOUT" \
        -H "X-N8N-API-KEY: $N8N_API_KEY" \
        "$workflows_url" 2>/dev/null); then
        log_warn "n8n workflow API test failed - might indicate authentication issues"
        return 0  # Don't fail smoke test for API-specific issues
    fi

    # Check if response is valid JSON array
    if echo "$response" | jq -e 'type == "array"' >/dev/null 2>&1; then
        local workflow_count
        workflow_count=$(echo "$response" | jq length)
        log_info "n8n workflow API accessible - $workflow_count workflows found"
        return 0
    else
        log_warn "n8n workflow API returned unexpected response format"
        return 0  # Don't fail the smoke test for this
    fi
}

# Main test execution
run_smoke_tests() {
    local start_time
    start_time=$(date +%s)

    echo "🧪 Starting n8n smoke tests..."
    echo "Target: $N8N_URL"
    echo ""

    # Run tests in order of criticality
    local tests=(
        "test_health"
        "test_version"
        "test_settings"
        "test_workflow_api"
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
        echo -e "${GREEN}✅ n8n smoke tests PASSED${NC}"
        echo "n8n OK"
        return 0
    else
        echo -e "${RED}❌ n8n smoke tests FAILED${NC}"
        echo "Failed tests: ${failed_tests[*]}"
        echo "n8n smoke failed"
        return 1
    fi
}

# Error handling
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log_error "n8n smoke test interrupted"
    fi
    exit $exit_code
}

trap cleanup INT TERM

# Usage information
show_usage() {
    cat << EOF
n8n Smoke Test Script

Usage: $0 [options]

Environment Variables:
  N8N_URL          n8n base URL (required)
  N8N_TIMEOUT      Request timeout in seconds (default: 10)
  N8N_API_KEY      API key for authenticated endpoints (optional)
  SMOKE_VERBOSE    Set to 1 for verbose output (default: 0)

Examples:
  # Basic smoke test
  N8N_URL=https://workflows.arizu.com $0

  # With API key for extended testing
  N8N_URL=https://workflows.arizu.com N8N_API_KEY=your-key $0

  # Verbose output
  N8N_URL=https://workflows.arizu.com SMOKE_VERBOSE=1 $0

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