#!/usr/bin/env bash

# Chaos Test: n8n Service Disruption
# Simulates n8n service outage to test application resilience and recovery
#
# ⚠️  STAGING ENVIRONMENT ONLY ⚠️
#
# Optional environment variables:
#   OUTAGE_DURATION    - Duration in seconds (default: 30)
#   COMPOSE_FILE       - Docker compose file path (default: docker-compose.yml)
#   N8N_SERVICE_NAME   - n8n service name in compose (default: n8n)
#   APP_HEALTH_URL     - Application health endpoint (default: http://localhost:3000/health)
#   CHECK_INTERVAL     - Health check interval in seconds (default: 5)
#
# Usage:
#   ./scripts/chaos-kill-n8n.sh --yes

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Environment variables with defaults
OUTAGE_DURATION="${OUTAGE_DURATION:-30}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
N8N_SERVICE_NAME="${N8N_SERVICE_NAME:-n8n}"
APP_HEALTH_URL="${APP_HEALTH_URL:-http://localhost:3000/health}"
CHECK_INTERVAL="${CHECK_INTERVAL:-5}"

# Test configuration
TEST_NAME="n8n Service Disruption"
TEST_ID="chaos-n8n-$(date +%s)"
LOG_FILE="/tmp/${TEST_ID}.log"

# Command line arguments
CONFIRMED=false

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --yes|-y)
                CONFIRMED=true
                shift
                ;;
            --duration=*)
                OUTAGE_DURATION="${1#*=}"
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
                exit 1
                ;;
        esac
    done
}

# Show help message
show_help() {
    cat <<EOF
Chaos Test: n8n Service Disruption

⚠️  STAGING ENVIRONMENT ONLY ⚠️

This script simulates n8n service outages to test application resilience.

Usage:
  $0 --yes [options]

Options:
  --yes                Confirm execution (required)
  --duration=SECONDS   Outage duration (default: 30)
  --help, -h           Show this help message

Environment variables:
  OUTAGE_DURATION      Duration in seconds (default: 30)
  COMPOSE_FILE         Docker compose file (default: docker-compose.yml)
  N8N_SERVICE_NAME     n8n service name (default: n8n)
  APP_HEALTH_URL       App health endpoint (default: http://localhost:3000/health)
  CHECK_INTERVAL       Health check interval (default: 5)

Examples:
  # Standard 30-second outage
  $0 --yes

  # Extended 60-second outage
  $0 --yes --duration=60

  # Custom service name
  N8N_SERVICE_NAME=automation-engine $0 --yes
EOF
}

# Logging function
log() {
    local message="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$message"
    echo "$message" >> "$LOG_FILE"
}

# Environment checks
check_environment() {
    log "🔍 Checking environment..."

    # Check for staging environment
    if [[ "${ENVIRONMENT:-}" != "staging" ]] && [[ "${NODE_ENV:-}" != "staging" ]]; then
        if [[ "${FORCE_CHAOS:-}" != "true" ]]; then
            log "❌ This script should only run in staging environment"
            log "   Set ENVIRONMENT=staging or FORCE_CHAOS=true to override"
            exit 1
        else
            log "⚠️  FORCE_CHAOS enabled - proceeding despite environment"
        fi
    fi

    # Check for required tools
    local missing_deps=()

    if ! command -v docker >/dev/null 2>&1; then
        missing_deps+=("docker")
    fi

    if ! command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1; then
        missing_deps+=("docker-compose")
    fi

    if ! command -v curl >/dev/null 2>&1; then
        missing_deps+=("curl")
    fi

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log "❌ Missing required dependencies:"
        for dep in "${missing_deps[@]}"; do
            log "   - $dep"
        done
        exit 1
    fi

    # Check compose file exists
    if [[ ! -f "$PROJECT_ROOT/$COMPOSE_FILE" ]]; then
        log "❌ Docker compose file not found: $PROJECT_ROOT/$COMPOSE_FILE"
        exit 1
    fi

    log "✅ Environment checks passed"
}

# Confirm destructive operation
confirm_chaos_test() {
    if [[ "$CONFIRMED" == true ]]; then
        return 0
    fi

    echo ""
    log "⚠️  ⚠️  ⚠️  CHAOS TEST WARNING ⚠️  ⚠️  ⚠️"
    echo ""
    echo "This will disrupt the n8n service for $OUTAGE_DURATION seconds:"
    echo "  • Stop n8n container/service"
    echo "  • Monitor application behavior during outage"
    echo "  • Restart n8n service after duration"
    echo "  • Verify recovery and functionality"
    echo ""
    echo "Target configuration:"
    echo "  Compose file: $COMPOSE_FILE"
    echo "  Service name: $N8N_SERVICE_NAME"
    echo "  Outage duration: $OUTAGE_DURATION seconds"
    echo "  Health endpoint: $APP_HEALTH_URL"
    echo ""
    echo "⚠️  Only run this in staging/test environments! ⚠️"
    echo ""
    echo "To proceed, run this command with the --yes flag:"
    echo "  $0 --yes"
    echo ""
    exit 1
}

# Check application health
check_app_health() {
    local endpoint="$1"
    local timeout="${2:-10}"

    if curl -s --max-time "$timeout" "$endpoint" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Check n8n service status
check_n8n_status() {
    local compose_cmd
    if command -v docker-compose >/dev/null 2>&1; then
        compose_cmd="docker-compose"
    else
        compose_cmd="docker compose"
    fi

    cd "$PROJECT_ROOT"
    if $compose_cmd ps "$N8N_SERVICE_NAME" | grep -q "Up"; then
        return 0
    else
        return 1
    fi
}

# Get n8n health status
get_n8n_health() {
    local n8n_url="${N8N_API_URL:-http://localhost:5678}"
    if curl -s --max-time 5 "$n8n_url/healthz" >/dev/null 2>&1; then
        echo "healthy"
    else
        echo "unhealthy"
    fi
}

# Monitor application during outage
monitor_during_outage() {
    local duration="$1"
    local start_time=$(date +%s)
    local end_time=$((start_time + duration))

    log "📊 Monitoring application behavior during outage..."

    local health_checks=0
    local health_failures=0
    local n8n_checks=0
    local n8n_failures=0

    while [[ $(date +%s) -lt $end_time ]]; do
        local remaining=$((end_time - $(date +%s)))

        # Check application health
        ((health_checks++))
        if ! check_app_health "$APP_HEALTH_URL"; then
            ((health_failures++))
        fi

        # Check n8n health (should fail during outage)
        ((n8n_checks++))
        if [[ "$(get_n8n_health)" == "unhealthy" ]]; then
            ((n8n_failures++))
        fi

        log "   ⏱️  ${remaining}s remaining | App health: $((health_checks - health_failures))/$health_checks | n8n down: $n8n_failures/$n8n_checks"

        sleep "$CHECK_INTERVAL"
    done

    # Log outage statistics
    local app_availability=$((((health_checks - health_failures) * 100) / health_checks))
    local n8n_outage_rate=$(((n8n_failures * 100) / n8n_checks))

    log "📈 Outage Statistics:"
    log "   App availability during outage: ${app_availability}%"
    log "   n8n outage detection rate: ${n8n_outage_rate}%"

    # Store metrics for final report
    echo "app_availability=$app_availability" >> "/tmp/${TEST_ID}-metrics.txt"
    echo "n8n_outage_rate=$n8n_outage_rate" >> "/tmp/${TEST_ID}-metrics.txt"
}

# Monitor recovery after restart
monitor_recovery() {
    log "🔄 Monitoring service recovery..."

    local recovery_start=$(date +%s)
    local max_recovery_time=60  # Maximum time to wait for recovery
    local recovery_timeout=$((recovery_start + max_recovery_time))

    local app_recovered=false
    local n8n_recovered=false

    while [[ $(date +%s) -lt $recovery_timeout ]]; do
        local elapsed=$(($(date +%s) - recovery_start))

        # Check application recovery
        if [[ "$app_recovered" == false ]] && check_app_health "$APP_HEALTH_URL"; then
            app_recovered=true
            log "✅ Application health recovered after ${elapsed}s"
        fi

        # Check n8n recovery
        if [[ "$n8n_recovered" == false ]] && [[ "$(get_n8n_health)" == "healthy" ]]; then
            n8n_recovered=true
            log "✅ n8n service recovered after ${elapsed}s"
        fi

        # Check if both services have recovered
        if [[ "$app_recovered" == true && "$n8n_recovered" == true ]]; then
            log "🎉 Full recovery completed in ${elapsed}s"
            echo "recovery_time=$elapsed" >> "/tmp/${TEST_ID}-metrics.txt"
            return 0
        fi

        sleep 2
    done

    # Recovery timeout
    log "⚠️  Recovery timeout after ${max_recovery_time}s"
    log "   App recovered: $app_recovered"
    log "   n8n recovered: $n8n_recovered"

    echo "recovery_time=timeout" >> "/tmp/${TEST_ID}-metrics.txt"
    return 1
}

# Execute chaos test
execute_chaos_test() {
    local compose_cmd
    if command -v docker-compose >/dev/null 2>&1; then
        compose_cmd="docker-compose"
    else
        compose_cmd="docker compose"
    fi

    log "🚀 Starting chaos test: $TEST_NAME"
    log "   Test ID: $TEST_ID"
    log "   Outage duration: ${OUTAGE_DURATION}s"
    echo ""

    # Initial health check
    log "🔍 Pre-test health check..."
    if ! check_app_health "$APP_HEALTH_URL"; then
        log "❌ Application is not healthy before test"
        exit 1
    fi

    if ! check_n8n_status; then
        log "❌ n8n service is not running before test"
        exit 1
    fi

    log "✅ Pre-test health check passed"

    # Record baseline
    echo "test_start=$(date +%s)" > "/tmp/${TEST_ID}-metrics.txt"

    # Stop n8n service
    log "🛑 Stopping n8n service..."
    cd "$PROJECT_ROOT"
    if $compose_cmd stop "$N8N_SERVICE_NAME"; then
        log "✅ n8n service stopped"
    else
        log "❌ Failed to stop n8n service"
        exit 1
    fi

    # Monitor during outage
    monitor_during_outage "$OUTAGE_DURATION"

    # Restart n8n service
    log "🔄 Restarting n8n service..."
    if $compose_cmd start "$N8N_SERVICE_NAME"; then
        log "✅ n8n service restart command completed"
    else
        log "❌ Failed to restart n8n service"
        exit 1
    fi

    # Monitor recovery
    monitor_recovery
    local recovery_result=$?

    # Record test completion
    echo "test_end=$(date +%s)" >> "/tmp/${TEST_ID}-metrics.txt"

    return $recovery_result
}

# Generate test report
generate_report() {
    local test_result="$1"

    log ""
    log "📋 Chaos Test Report: $TEST_NAME"
    log "   Test ID: $TEST_ID"
    log "   Duration: ${OUTAGE_DURATION}s"
    log "   Result: $(if [[ $test_result -eq 0 ]]; then echo "PASS"; else echo "FAIL"; fi)"

    # Load metrics
    if [[ -f "/tmp/${TEST_ID}-metrics.txt" ]]; then
        source "/tmp/${TEST_ID}-metrics.txt"

        log ""
        log "📊 Test Metrics:"
        log "   App availability during outage: ${app_availability:-unknown}%"
        log "   n8n outage detection rate: ${n8n_outage_rate:-unknown}%"
        log "   Recovery time: ${recovery_time:-unknown}s"

        # Evaluate success criteria
        local criteria_passed=0
        local total_criteria=3

        # Criterion 1: App should maintain some availability
        if [[ "${app_availability:-0}" -ge 80 ]]; then
            log "   ✅ App availability ≥80%: PASS"
            ((criteria_passed++))
        else
            log "   ❌ App availability <80%: FAIL"
        fi

        # Criterion 2: n8n outage should be detected
        if [[ "${n8n_outage_rate:-0}" -ge 70 ]]; then
            log "   ✅ n8n outage detection ≥70%: PASS"
            ((criteria_passed++))
        else
            log "   ❌ n8n outage detection <70%: FAIL"
        fi

        # Criterion 3: Recovery should be quick
        if [[ "$recovery_time" != "timeout" ]] && [[ "${recovery_time:-999}" -le 30 ]]; then
            log "   ✅ Recovery time ≤30s: PASS"
            ((criteria_passed++))
        else
            log "   ❌ Recovery time >30s: FAIL"
        fi

        log ""
        log "🎯 Success Criteria: $criteria_passed/$total_criteria passed"

        if [[ $criteria_passed -eq $total_criteria ]]; then
            log "✅ Overall Test Result: PASS"
            test_result=0
        else
            log "❌ Overall Test Result: FAIL"
            test_result=1
        fi
    fi

    log ""
    log "📝 Log file: $LOG_FILE"
    log "📈 Metrics file: /tmp/${TEST_ID}-metrics.txt"

    return $test_result
}

# Cleanup function
cleanup() {
    log "🧹 Cleaning up test artifacts..."

    # Ensure n8n service is running
    local compose_cmd
    if command -v docker-compose >/dev/null 2>&1; then
        compose_cmd="docker-compose"
    else
        compose_cmd="docker compose"
    fi

    cd "$PROJECT_ROOT"
    if ! check_n8n_status; then
        log "🔄 Ensuring n8n service is running..."
        $compose_cmd start "$N8N_SERVICE_NAME" || true
    fi

    # Clean up temporary files (keep logs for analysis)
    rm -f "/tmp/${TEST_ID}-metrics.txt"
}

# Emergency rollback
emergency_rollback() {
    log "🚨 Emergency rollback triggered!"

    local compose_cmd
    if command -v docker-compose >/dev/null 2>&1; then
        compose_cmd="docker-compose"
    else
        compose_cmd="docker compose"
    fi

    cd "$PROJECT_ROOT"
    log "🔄 Restarting all services..."
    $compose_cmd restart

    log "✅ Emergency rollback completed"
}

# Signal handlers
trap 'emergency_rollback; exit 1' INT TERM
trap 'cleanup' EXIT

# Main execution
main() {
    parse_args "$@"
    check_environment
    confirm_chaos_test

    log "🧪 Chaos Engineering Test: $TEST_NAME"
    log "⚠️  STAGING ENVIRONMENT ONLY"
    echo ""

    if execute_chaos_test; then
        generate_report 0
        exit 0
    else
        generate_report 1
        exit 1
    fi
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi