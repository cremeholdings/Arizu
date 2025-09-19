#!/usr/bin/env bash

# Chaos Test: Redis Latency Simulation
# Simulates Redis latency and connection issues to test backpressure handling
#
# ⚠️  STAGING ENVIRONMENT ONLY ⚠️
#
# Optional environment variables:
#   LATENCY_DURATION    - Duration in seconds (default: 90)
#   REDIS_HOST          - Redis hostname (default: localhost)
#   REDIS_PORT          - Redis port (default: 6379)
#   ADDED_LATENCY       - Added latency in ms (default: 500)
#   PACKET_LOSS         - Packet loss percentage (default: 5)
#   APP_API_URL         - Application API base URL (default: http://localhost:3000/api)
#   CHECK_INTERVAL      - Test interval in seconds (default: 15)
#   INTERFACE           - Network interface (default: auto-detect)
#
# Usage:
#   ./scripts/chaos-stall-redis.sh --yes

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Environment variables with defaults
LATENCY_DURATION="${LATENCY_DURATION:-90}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
ADDED_LATENCY="${ADDED_LATENCY:-500}"
PACKET_LOSS="${PACKET_LOSS:-5}"
APP_API_URL="${APP_API_URL:-http://localhost:3000/api}"
CHECK_INTERVAL="${CHECK_INTERVAL:-15}"
INTERFACE="${INTERFACE:-}"

# Test configuration
TEST_NAME="Redis Latency Simulation"
TEST_ID="chaos-redis-$(date +%s)"
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
                LATENCY_DURATION="${1#*=}"
                shift
                ;;
            --latency=*)
                ADDED_LATENCY="${1#*=}"
                shift
                ;;
            --loss=*)
                PACKET_LOSS="${1#*=}"
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
Chaos Test: Redis Latency Simulation

⚠️  STAGING ENVIRONMENT ONLY ⚠️

This script simulates Redis latency and connection issues using tc (traffic control).

Usage:
  $0 --yes [options]

Options:
  --yes                 Confirm execution (required)
  --duration=SECONDS    Latency duration (default: 90)
  --latency=MS          Added latency in ms (default: 500)
  --loss=PERCENT        Packet loss percentage (default: 5)
  --help, -h            Show this help message

Environment variables:
  LATENCY_DURATION      Duration in seconds (default: 90)
  REDIS_HOST            Redis hostname (default: localhost)
  REDIS_PORT            Redis port (default: 6379)
  ADDED_LATENCY         Added latency in ms (default: 500)
  PACKET_LOSS           Packet loss percentage (default: 5)
  APP_API_URL           App API base URL (default: http://localhost:3000/api)
  CHECK_INTERVAL        Test interval in seconds (default: 15)
  INTERFACE             Network interface (default: auto-detect)

Examples:
  # Standard 90-second test with 500ms latency
  $0 --yes

  # High latency test
  $0 --yes --latency=1000 --loss=10

  # Custom Redis host
  REDIS_HOST=redis.staging.internal $0 --yes

Note: Requires root privileges for tc (traffic control) commands.
EOF
}

# Logging function
log() {
    local message="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$message"
    echo "$message" >> "$LOG_FILE"
}

# Auto-detect network interface
detect_interface() {
    # Find the primary network interface
    local interface
    interface=$(ip route | grep default | head -1 | awk '{print $5}' || echo "")

    if [[ -z "$interface" ]]; then
        # Fallback: find first non-loopback interface
        interface=$(ip link show | grep -E '^[0-9]+:' | grep -v lo: | head -1 | awk -F: '{print $2}' | xargs || echo "")
    fi

    if [[ -z "$interface" ]]; then
        log "❌ Could not auto-detect network interface"
        log "   Please set INTERFACE environment variable"
        exit 1
    fi

    echo "$interface"
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

    # Check for root privileges (required for tc)
    if [[ $EUID -ne 0 ]]; then
        log "❌ This script requires root privileges for traffic control"
        log "   Run with sudo"
        exit 1
    fi

    # Check for required tools
    local missing_deps=()

    if ! command -v tc >/dev/null 2>&1; then
        missing_deps+=("tc (iproute2)")
    fi

    if ! command -v redis-cli >/dev/null 2>&1; then
        missing_deps+=("redis-cli")
    fi

    if ! command -v curl >/dev/null 2>&1; then
        missing_deps+=("curl")
    fi

    if ! command -v ping >/dev/null 2>&1; then
        missing_deps+=("ping")
    fi

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log "❌ Missing required dependencies:"
        for dep in "${missing_deps[@]}"; do
            log "   - $dep"
        done
        exit 1
    fi

    # Auto-detect interface if not specified
    if [[ -z "$INTERFACE" ]]; then
        INTERFACE=$(detect_interface)
        log "   Auto-detected interface: $INTERFACE"
    fi

    # Validate interface exists
    if ! ip link show "$INTERFACE" >/dev/null 2>&1; then
        log "❌ Network interface not found: $INTERFACE"
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
    echo "This will add network latency and packet loss for $LATENCY_DURATION seconds:"
    echo "  • Add ${ADDED_LATENCY}ms latency to Redis traffic"
    echo "  • Add ${PACKET_LOSS}% packet loss"
    echo "  • Monitor application behavior and backpressure handling"
    echo "  • Test caching and session management under stress"
    echo "  • Restore normal network conditions after duration"
    echo ""
    echo "Target configuration:"
    echo "  Redis: $REDIS_HOST:$REDIS_PORT"
    echo "  Interface: $INTERFACE"
    echo "  Added latency: ${ADDED_LATENCY}ms"
    echo "  Packet loss: ${PACKET_LOSS}%"
    echo "  Duration: $LATENCY_DURATION seconds"
    echo ""
    echo "⚠️  Requires root privileges - only run in staging! ⚠️"
    echo ""
    echo "To proceed, run this command with the --yes flag:"
    echo "  sudo $0 --yes"
    echo ""
    exit 1
}

# Test Redis connectivity and latency
test_redis_connectivity() {
    local timeout="${1:-5}"

    # Test basic connectivity
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --connect-timeout "$timeout" ping >/dev/null 2>&1; then
        # Measure latency
        local latency
        latency=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --latency-history -i 1 2>/dev/null | head -1 | awk '{print $4}' || echo "unknown")
        echo "connected:$latency"
        return 0
    else
        echo "disconnected"
        return 1
    fi
}

# Test application caching endpoints
test_caching_endpoints() {
    local timeout="${1:-10}"

    # Test various caching scenarios
    local cache_tests=0
    local cache_successes=0
    local total_latency=0

    # Test 1: Health endpoint (likely cached)
    ((cache_tests++))
    local start_time=$(date +%s%N)
    if curl -s --max-time "$timeout" "$APP_API_URL/../health" >/dev/null 2>&1; then
        ((cache_successes++))
        local end_time=$(date +%s%N)
        local request_latency=$(((end_time - start_time) / 1000000))
        total_latency=$((total_latency + request_latency))
    fi

    # Test 2: User session validation (Redis-dependent)
    ((cache_tests++))
    start_time=$(date +%s%N)
    if curl -s --max-time "$timeout" "$APP_API_URL/auth/status" >/dev/null 2>&1; then
        ((cache_successes++))
        end_time=$(date +%s%N)
        request_latency=$(((end_time - start_time) / 1000000))
        total_latency=$((total_latency + request_latency))
    fi

    # Test 3: Rate limit check (Redis-dependent)
    ((cache_tests++))
    start_time=$(date +%s%N)
    if curl -s --max-time "$timeout" -X POST "$APP_API_URL/plan" -d '{"prompt":"test"}' -H "Content-Type: application/json" >/dev/null 2>&1; then
        ((cache_successes++))
        end_time=$(date +%s%N)
        request_latency=$(((end_time - start_time) / 1000000))
        total_latency=$((total_latency + request_latency))
    fi

    local success_rate=$((cache_successes * 100 / cache_tests))
    local avg_latency=0
    if [[ $cache_successes -gt 0 ]]; then
        avg_latency=$((total_latency / cache_successes))
    fi

    echo "success_rate:$success_rate,avg_latency:$avg_latency,tests:$cache_tests"
}

# Apply network impairment using tc
apply_network_impairment() {
    log "🌐 Applying network impairment to interface $INTERFACE..."

    # Clean any existing qdisc
    tc qdisc del dev "$INTERFACE" root 2>/dev/null || true

    # Apply network impairment
    tc qdisc add dev "$INTERFACE" root handle 1: prio

    # Add latency and packet loss for Redis traffic
    tc qdisc add dev "$INTERFACE" parent 1:3 handle 30: netem \
        delay "${ADDED_LATENCY}ms" \
        loss "${PACKET_LOSS}%" \
        duplicate 1%

    # Filter Redis traffic to the impaired class
    tc filter add dev "$INTERFACE" protocol ip parent 1:0 prio 3 \
        u32 match ip dport "$REDIS_PORT" 0xffff flowid 1:3

    tc filter add dev "$INTERFACE" protocol ip parent 1:0 prio 3 \
        u32 match ip sport "$REDIS_PORT" 0xffff flowid 1:3

    log "✅ Network impairment applied:"
    log "   Latency: +${ADDED_LATENCY}ms"
    log "   Packet loss: ${PACKET_LOSS}%"
    log "   Target port: $REDIS_PORT"
}

# Remove network impairment
remove_network_impairment() {
    log "🔄 Removing network impairment..."

    # Remove all tc rules
    tc qdisc del dev "$INTERFACE" root 2>/dev/null || true

    log "✅ Network impairment removed"
}

# Monitor application during latency
monitor_during_latency() {
    local duration="$1"
    local start_time=$(date +%s)
    local end_time=$((start_time + duration))

    log "📊 Monitoring application behavior during Redis latency..."

    local total_intervals=0
    local redis_connection_issues=0
    local app_degradation_count=0
    local total_app_latency=0
    local min_success_rate=100
    local max_latency=0

    while [[ $(date +%s) -lt $end_time ]]; do
        local remaining=$((end_time - $(date +%s)))
        ((total_intervals++))

        # Test Redis connectivity
        local redis_result
        redis_result=$(test_redis_connectivity 8)
        if [[ "$redis_result" == "disconnected" ]]; then
            ((redis_connection_issues++))
            log "   ❌ Redis connectivity lost"
        else
            local redis_latency="${redis_result#connected:}"
            if [[ "$redis_latency" != "unknown" ]] && [[ "$redis_latency" -gt 100 ]]; then
                log "   ⚠️  Redis latency: ${redis_latency}ms"
            fi
        fi

        # Test application caching
        local app_result
        app_result=$(test_caching_endpoints 15)
        local success_rate=$(echo "$app_result" | cut -d',' -f1 | cut -d':' -f2)
        local avg_latency=$(echo "$app_result" | cut -d',' -f2 | cut -d':' -f2)

        if [[ "$success_rate" -lt 80 ]]; then
            ((app_degradation_count++))
        fi

        if [[ "$success_rate" -lt "$min_success_rate" ]]; then
            min_success_rate=$success_rate
        fi

        if [[ "$avg_latency" -gt "$max_latency" ]]; then
            max_latency=$avg_latency
        fi

        total_app_latency=$((total_app_latency + avg_latency))

        log "   ⏱️  ${remaining}s remaining | App success: ${success_rate}% | Latency: ${avg_latency}ms | Redis issues: $redis_connection_issues"

        sleep "$CHECK_INTERVAL"
    done

    # Log latency statistics
    local avg_app_latency=0
    if [[ $total_intervals -gt 0 ]]; then
        avg_app_latency=$((total_app_latency / total_intervals))
    fi

    local redis_issue_rate=$((redis_connection_issues * 100 / total_intervals))
    local app_degradation_rate=$((app_degradation_count * 100 / total_intervals))

    log "📈 Latency Test Statistics:"
    log "   Redis connection issues: ${redis_issue_rate}%"
    log "   App degradation events: ${app_degradation_rate}%"
    log "   Min success rate: ${min_success_rate}%"
    log "   Max latency observed: ${max_latency}ms"
    log "   Average app latency: ${avg_app_latency}ms"

    # Store metrics for final report
    echo "redis_issue_rate=$redis_issue_rate" >> "/tmp/${TEST_ID}-metrics.txt"
    echo "app_degradation_rate=$app_degradation_rate" >> "/tmp/${TEST_ID}-metrics.txt"
    echo "min_success_rate=$min_success_rate" >> "/tmp/${TEST_ID}-metrics.txt"
    echo "max_latency=$max_latency" >> "/tmp/${TEST_ID}-metrics.txt"
    echo "avg_app_latency=$avg_app_latency" >> "/tmp/${TEST_ID}-metrics.txt"
    echo "total_intervals=$total_intervals" >> "/tmp/${TEST_ID}-metrics.txt"
}

# Monitor recovery after removing impairment
monitor_recovery() {
    log "🔄 Monitoring service recovery..."

    local recovery_start=$(date +%s)
    local max_recovery_time=45
    local recovery_timeout=$((recovery_start + max_recovery_time))

    local redis_recovered=false
    local app_recovered=false

    while [[ $(date +%s) -lt $recovery_timeout ]]; do
        local elapsed=$(($(date +%s) - recovery_start))

        # Check Redis recovery
        if [[ "$redis_recovered" == false ]]; then
            local redis_result
            redis_result=$(test_redis_connectivity 5)
            if [[ "$redis_result" == connected:* ]]; then
                local latency="${redis_result#connected:}"
                if [[ "$latency" != "unknown" ]] && [[ "$latency" -lt 50 ]]; then
                    redis_recovered=true
                    log "✅ Redis latency normalized after ${elapsed}s (${latency}ms)"
                fi
            fi
        fi

        # Check application recovery
        if [[ "$app_recovered" == false ]]; then
            local app_result
            app_result=$(test_caching_endpoints 10)
            local success_rate=$(echo "$app_result" | cut -d',' -f1 | cut -d':' -f2)
            local avg_latency=$(echo "$app_result" | cut -d',' -f2 | cut -d':' -f2)

            if [[ "$success_rate" -ge 95 ]] && [[ "$avg_latency" -lt 1000 ]]; then
                app_recovered=true
                log "✅ Application performance recovered after ${elapsed}s"
            fi
        fi

        # Check if both have recovered
        if [[ "$redis_recovered" == true && "$app_recovered" == true ]]; then
            log "🎉 Full recovery completed in ${elapsed}s"
            echo "recovery_time=$elapsed" >> "/tmp/${TEST_ID}-metrics.txt"
            return 0
        fi

        sleep 3
    done

    # Recovery timeout
    log "⚠️  Recovery timeout after ${max_recovery_time}s"
    log "   Redis recovered: $redis_recovered"
    log "   App recovered: $app_recovered"

    echo "recovery_time=timeout" >> "/tmp/${TEST_ID}-metrics.txt"
    return 1
}

# Execute chaos test
execute_chaos_test() {
    log "🚀 Starting chaos test: $TEST_NAME"
    log "   Test ID: $TEST_ID"
    log "   Latency duration: ${LATENCY_DURATION}s"
    log "   Added latency: ${ADDED_LATENCY}ms"
    log "   Packet loss: ${PACKET_LOSS}%"
    echo ""

    # Initial connectivity check
    log "🔍 Pre-test connectivity check..."
    local redis_baseline
    redis_baseline=$(test_redis_connectivity 5)
    if [[ "$redis_baseline" == "disconnected" ]]; then
        log "❌ Redis is not reachable before test"
        exit 1
    fi

    local app_baseline
    app_baseline=$(test_caching_endpoints 10)
    local baseline_success=$(echo "$app_baseline" | cut -d',' -f1 | cut -d':' -f2)
    if [[ "$baseline_success" -lt 80 ]]; then
        log "❌ Application is not performing well before test (${baseline_success}% success)"
        exit 1
    fi

    log "✅ Pre-test checks passed"
    log "   Redis: ${redis_baseline}"
    log "   App baseline success: ${baseline_success}%"

    # Record baseline
    echo "test_start=$(date +%s)" > "/tmp/${TEST_ID}-metrics.txt"
    echo "baseline_success=$baseline_success" >> "/tmp/${TEST_ID}-metrics.txt"

    # Apply network impairment
    apply_network_impairment

    # Monitor during latency
    monitor_during_latency "$LATENCY_DURATION"

    # Remove impairment
    remove_network_impairment

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
    log "   Duration: ${LATENCY_DURATION}s"
    log "   Added latency: ${ADDED_LATENCY}ms"
    log "   Packet loss: ${PACKET_LOSS}%"
    log "   Result: $(if [[ $test_result -eq 0 ]]; then echo "PASS"; else echo "FAIL"; fi)"

    # Load metrics
    if [[ -f "/tmp/${TEST_ID}-metrics.txt" ]]; then
        source "/tmp/${TEST_ID}-metrics.txt"

        log ""
        log "📊 Test Metrics:"
        log "   Baseline success rate: ${baseline_success:-unknown}%"
        log "   Min success rate during test: ${min_success_rate:-unknown}%"
        log "   Redis connection issues: ${redis_issue_rate:-unknown}%"
        log "   App degradation rate: ${app_degradation_rate:-unknown}%"
        log "   Max latency observed: ${max_latency:-unknown}ms"
        log "   Recovery time: ${recovery_time:-unknown}s"

        # Evaluate success criteria
        local criteria_passed=0
        local total_criteria=4

        # Criterion 1: App should maintain reasonable performance
        if [[ "${min_success_rate:-0}" -ge 60 ]]; then
            log "   ✅ Min success rate ≥60% during latency: PASS"
            ((criteria_passed++))
        else
            log "   ❌ Min success rate <60% during latency: FAIL"
        fi

        # Criterion 2: System should handle Redis issues gracefully
        if [[ "${redis_issue_rate:-0}" -le 30 ]]; then
            log "   ✅ Redis issue rate ≤30%: PASS"
            ((criteria_passed++))
        else
            log "   ❌ Redis issue rate >30%: FAIL"
        fi

        # Criterion 3: App degradation should be limited
        if [[ "${app_degradation_rate:-100}" -le 50 ]]; then
            log "   ✅ App degradation rate ≤50%: PASS"
            ((criteria_passed++))
        else
            log "   ❌ App degradation rate >50%: FAIL"
        fi

        # Criterion 4: Recovery should be quick
        if [[ "$recovery_time" != "timeout" ]] && [[ "${recovery_time:-999}" -le 30 ]]; then
            log "   ✅ Recovery time ≤30s: PASS"
            ((criteria_passed++))
        else
            log "   ❌ Recovery time >30s: FAIL"
        fi

        log ""
        log "🎯 Success Criteria: $criteria_passed/$total_criteria passed"

        if [[ $criteria_passed -ge 3 ]]; then
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

    # Ensure network impairment is removed
    remove_network_impairment

    # Clean up temporary files (keep logs for analysis)
    rm -f "/tmp/${TEST_ID}-metrics.txt"
}

# Emergency rollback
emergency_rollback() {
    log "🚨 Emergency rollback triggered!"

    # Remove network impairment immediately
    remove_network_impairment

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