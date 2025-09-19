#!/usr/bin/env bash

# Chaos Test: LLM Provider Blocking
# Simulates LLM provider outage to test fallback mechanisms and graceful degradation
#
# ⚠️  STAGING ENVIRONMENT ONLY ⚠️
#
# Optional environment variables:
#   BLOCK_DURATION      - Duration in seconds (default: 60)
#   PRIMARY_LLM_HOST    - Primary LLM hostname (default: api.openai.com)
#   FALLBACK_LLM_HOST   - Fallback LLM hostname (default: api.anthropic.com)
#   APP_API_URL         - Application API base URL (default: http://localhost:3000/api)
#   BLOCK_METHOD        - Blocking method: hosts|iptables (default: hosts)
#   CHECK_INTERVAL      - Test interval in seconds (default: 10)
#
# Usage:
#   ./scripts/chaos-block-llm.sh --yes

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Environment variables with defaults
BLOCK_DURATION="${BLOCK_DURATION:-60}"
PRIMARY_LLM_HOST="${PRIMARY_LLM_HOST:-api.openai.com}"
FALLBACK_LLM_HOST="${FALLBACK_LLM_HOST:-api.anthropic.com}"
APP_API_URL="${APP_API_URL:-http://localhost:3000/api}"
BLOCK_METHOD="${BLOCK_METHOD:-hosts}"
CHECK_INTERVAL="${CHECK_INTERVAL:-10}"

# Test configuration
TEST_NAME="LLM Provider Blocking"
TEST_ID="chaos-llm-$(date +%s)"
LOG_FILE="/tmp/${TEST_ID}.log"
HOSTS_BACKUP="/tmp/${TEST_ID}-hosts.backup"

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
                BLOCK_DURATION="${1#*=}"
                shift
                ;;
            --method=*)
                BLOCK_METHOD="${1#*=}"
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
Chaos Test: LLM Provider Blocking

⚠️  STAGING ENVIRONMENT ONLY ⚠️

This script simulates LLM provider outages to test fallback mechanisms.

Usage:
  $0 --yes [options]

Options:
  --yes                Confirm execution (required)
  --duration=SECONDS   Block duration (default: 60)
  --method=METHOD      Block method: hosts|iptables (default: hosts)
  --help, -h           Show this help message

Environment variables:
  BLOCK_DURATION       Duration in seconds (default: 60)
  PRIMARY_LLM_HOST     Primary LLM hostname (default: api.openai.com)
  FALLBACK_LLM_HOST    Fallback LLM hostname (default: api.anthropic.com)
  APP_API_URL          App API base URL (default: http://localhost:3000/api)
  BLOCK_METHOD         Block method: hosts|iptables (default: hosts)
  CHECK_INTERVAL       Test interval in seconds (default: 10)

Examples:
  # Standard 60-second block using /etc/hosts
  $0 --yes

  # Extended 120-second block using iptables
  $0 --yes --duration=120 --method=iptables

  # Custom LLM provider
  PRIMARY_LLM_HOST=api.custom-llm.com $0 --yes
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

    if ! command -v curl >/dev/null 2>&1; then
        missing_deps+=("curl")
    fi

    if [[ "$BLOCK_METHOD" == "iptables" ]] && ! command -v iptables >/dev/null 2>&1; then
        missing_deps+=("iptables")
    fi

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log "❌ Missing required dependencies:"
        for dep in "${missing_deps[@]}"; do
            log "   - $dep"
        done
        exit 1
    fi

    # Check for root privileges if using iptables
    if [[ "$BLOCK_METHOD" == "iptables" ]] && [[ $EUID -ne 0 ]]; then
        log "❌ iptables method requires root privileges"
        log "   Run with sudo or use --method=hosts"
        exit 1
    fi

    # Validate block method
    if [[ "$BLOCK_METHOD" != "hosts" && "$BLOCK_METHOD" != "iptables" ]]; then
        log "❌ Invalid block method: $BLOCK_METHOD"
        log "   Valid methods: hosts, iptables"
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
    echo "This will block access to the primary LLM provider for $BLOCK_DURATION seconds:"
    echo "  • Block outbound connections to $PRIMARY_LLM_HOST"
    echo "  • Monitor application behavior and fallback mechanisms"
    echo "  • Test plan generation with blocked primary provider"
    echo "  • Restore access after duration"
    echo ""
    echo "Target configuration:"
    echo "  Primary LLM: $PRIMARY_LLM_HOST"
    echo "  Fallback LLM: $FALLBACK_LLM_HOST"
    echo "  Block method: $BLOCK_METHOD"
    echo "  Block duration: $BLOCK_DURATION seconds"
    echo "  App API: $APP_API_URL"
    echo ""
    echo "⚠️  Only run this in staging/test environments! ⚠️"
    echo ""
    echo "To proceed, run this command with the --yes flag:"
    echo "  $0 --yes"
    echo ""
    exit 1
}

# Test LLM connectivity
test_llm_connectivity() {
    local host="$1"
    local timeout="${2:-10}"

    # Test DNS resolution and basic connectivity
    if curl -s --max-time "$timeout" --head "https://$host" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Test plan generation API
test_plan_generation() {
    local test_prompt="Create a simple workflow that sends an email when a form is submitted"
    local timeout="${1:-30}"

    local response
    response=$(curl -s --max-time "$timeout" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "{\"prompt\": \"$test_prompt\"}" \
        "$APP_API_URL/plan" 2>/dev/null)

    if [[ $? -eq 0 ]] && echo "$response" | grep -q '"ok".*true\|"plan"'; then
        # Check if response indicates which provider was used
        local provider="unknown"
        if echo "$response" | grep -qi "openai\|gpt"; then
            provider="openai"
        elif echo "$response" | grep -qi "anthropic\|claude"; then
            provider="anthropic"
        elif echo "$response" | grep -qi "provider\|model"; then
            provider=$(echo "$response" | grep -o '"provider"[^,]*' | cut -d'"' -f4 || echo "unknown")
        fi

        echo "success:$provider"
        return 0
    else
        echo "failure"
        return 1
    fi
}

# Block LLM access using /etc/hosts
block_with_hosts() {
    local host="$1"

    log "🚫 Blocking $host using /etc/hosts..."

    # Backup original hosts file
    cp /etc/hosts "$HOSTS_BACKUP"

    # Add blocking entry
    echo "127.0.0.1 $host" >> /etc/hosts
    echo "::1 $host" >> /etc/hosts

    # Verify blocking is in effect
    if test_llm_connectivity "$host" 5; then
        log "⚠️  Warning: $host still reachable after hosts block"
    else
        log "✅ $host blocked successfully"
    fi
}

# Restore LLM access using /etc/hosts
restore_with_hosts() {
    log "🔄 Restoring /etc/hosts..."

    if [[ -f "$HOSTS_BACKUP" ]]; then
        cp "$HOSTS_BACKUP" /etc/hosts
        rm "$HOSTS_BACKUP"
        log "✅ /etc/hosts restored"
    else
        log "⚠️  Hosts backup file not found, manual restoration may be needed"
    fi
}

# Block LLM access using iptables
block_with_iptables() {
    local host="$1"

    log "🚫 Blocking $host using iptables..."

    # Resolve hostname to IP addresses
    local ips
    ips=$(dig +short "$host" | grep -E '^[0-9]+\.' || true)

    if [[ -z "$ips" ]]; then
        log "⚠️  Could not resolve $host to IP addresses"
        return 1
    fi

    # Block each IP address
    for ip in $ips; do
        iptables -A OUTPUT -d "$ip" -j DROP
        log "   Blocked IP: $ip"
    done

    # Also block by hostname (if supported)
    iptables -A OUTPUT -d "$host" -j DROP || true

    # Verify blocking is in effect
    if test_llm_connectivity "$host" 5; then
        log "⚠️  Warning: $host still reachable after iptables block"
    else
        log "✅ $host blocked successfully"
    fi
}

# Restore LLM access using iptables
restore_with_iptables() {
    local host="$1"

    log "🔄 Restoring iptables rules..."

    # Remove blocking rules
    local ips
    ips=$(dig +short "$host" | grep -E '^[0-9]+\.' || true)

    for ip in $ips; do
        iptables -D OUTPUT -d "$ip" -j DROP 2>/dev/null || true
        log "   Unblocked IP: $ip"
    done

    # Remove hostname-based rule
    iptables -D OUTPUT -d "$host" -j DROP 2>/dev/null || true

    log "✅ iptables rules restored"
}

# Apply blocking method
apply_block() {
    local host="$1"

    case "$BLOCK_METHOD" in
        hosts)
            block_with_hosts "$host"
            ;;
        iptables)
            block_with_iptables "$host"
            ;;
        *)
            log "❌ Unknown blocking method: $BLOCK_METHOD"
            exit 1
            ;;
    esac
}

# Remove blocking method
remove_block() {
    local host="$1"

    case "$BLOCK_METHOD" in
        hosts)
            restore_with_hosts
            ;;
        iptables)
            restore_with_iptables "$host"
            ;;
        *)
            log "❌ Unknown blocking method: $BLOCK_METHOD"
            ;;
    esac
}

# Monitor application during block
monitor_during_block() {
    local duration="$1"
    local start_time=$(date +%s)
    local end_time=$((start_time + duration))

    log "📊 Monitoring application behavior during LLM block..."

    local total_tests=0
    local successful_tests=0
    local primary_provider_used=0
    local fallback_provider_used=0
    local failed_tests=0

    while [[ $(date +%s) -lt $end_time ]]; do
        local remaining=$((end_time - $(date +%s)))

        # Test plan generation
        ((total_tests++))
        local result
        result=$(test_plan_generation 20)

        if [[ "$result" == success:* ]]; then
            ((successful_tests++))
            local provider="${result#success:}"
            case "$provider" in
                openai|gpt)
                    ((primary_provider_used++))
                    log "   ⚠️  Primary provider used (block may not be effective)"
                    ;;
                anthropic|claude)
                    ((fallback_provider_used++))
                    log "   ✅ Fallback provider used successfully"
                    ;;
                *)
                    log "   ✅ Plan generated (provider: $provider)"
                    ;;
            esac
        else
            ((failed_tests++))
            log "   ❌ Plan generation failed"
        fi

        log "   ⏱️  ${remaining}s remaining | Success: $successful_tests/$total_tests | Fallback: $fallback_provider_used | Failed: $failed_tests"

        sleep "$CHECK_INTERVAL"
    done

    # Log block statistics
    local success_rate=$((successful_tests * 100 / total_tests))
    local fallback_rate=$((fallback_provider_used * 100 / total_tests))

    log "📈 Block Statistics:"
    log "   Total tests: $total_tests"
    log "   Success rate: ${success_rate}%"
    log "   Fallback usage: ${fallback_rate}%"
    log "   Failed tests: $failed_tests"

    # Store metrics for final report
    echo "total_tests=$total_tests" >> "/tmp/${TEST_ID}-metrics.txt"
    echo "success_rate=$success_rate" >> "/tmp/${TEST_ID}-metrics.txt"
    echo "fallback_rate=$fallback_rate" >> "/tmp/${TEST_ID}-metrics.txt"
    echo "failed_tests=$failed_tests" >> "/tmp/${TEST_ID}-metrics.txt"
    echo "primary_used=$primary_provider_used" >> "/tmp/${TEST_ID}-metrics.txt"
}

# Monitor recovery after unblock
monitor_recovery() {
    log "🔄 Monitoring service recovery..."

    local recovery_start=$(date +%s)
    local max_recovery_time=30
    local recovery_timeout=$((recovery_start + max_recovery_time))

    local primary_recovered=false
    local generation_recovered=false

    while [[ $(date +%s) -lt $recovery_timeout ]]; do
        local elapsed=$(($(date +%s) - recovery_start))

        # Check primary LLM connectivity
        if [[ "$primary_recovered" == false ]] && test_llm_connectivity "$PRIMARY_LLM_HOST"; then
            primary_recovered=true
            log "✅ Primary LLM connectivity recovered after ${elapsed}s"
        fi

        # Test plan generation functionality
        if [[ "$generation_recovered" == false ]]; then
            local result
            result=$(test_plan_generation 15)
            if [[ "$result" == success:* ]]; then
                generation_recovered=true
                log "✅ Plan generation recovered after ${elapsed}s"
            fi
        fi

        # Check if both have recovered
        if [[ "$primary_recovered" == true && "$generation_recovered" == true ]]; then
            log "🎉 Full recovery completed in ${elapsed}s"
            echo "recovery_time=$elapsed" >> "/tmp/${TEST_ID}-metrics.txt"
            return 0
        fi

        sleep 3
    done

    # Recovery timeout
    log "⚠️  Recovery timeout after ${max_recovery_time}s"
    log "   Primary LLM: $primary_recovered"
    log "   Plan generation: $generation_recovered"

    echo "recovery_time=timeout" >> "/tmp/${TEST_ID}-metrics.txt"
    return 1
}

# Execute chaos test
execute_chaos_test() {
    log "🚀 Starting chaos test: $TEST_NAME"
    log "   Test ID: $TEST_ID"
    log "   Block duration: ${BLOCK_DURATION}s"
    log "   Block method: $BLOCK_METHOD"
    echo ""

    # Initial connectivity check
    log "🔍 Pre-test connectivity check..."
    if ! test_llm_connectivity "$PRIMARY_LLM_HOST"; then
        log "❌ Primary LLM ($PRIMARY_LLM_HOST) is not reachable before test"
        exit 1
    fi

    if ! test_llm_connectivity "$FALLBACK_LLM_HOST"; then
        log "⚠️  Fallback LLM ($FALLBACK_LLM_HOST) is not reachable"
        log "   Test will proceed but fallback may not work"
    fi

    # Test plan generation works
    local baseline_result
    baseline_result=$(test_plan_generation 15)
    if [[ "$baseline_result" != success:* ]]; then
        log "❌ Plan generation is not working before test"
        exit 1
    fi

    log "✅ Pre-test checks passed"

    # Record baseline
    echo "test_start=$(date +%s)" > "/tmp/${TEST_ID}-metrics.txt"

    # Apply block
    apply_block "$PRIMARY_LLM_HOST"

    # Monitor during block
    monitor_during_block "$BLOCK_DURATION"

    # Remove block
    remove_block "$PRIMARY_LLM_HOST"

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
    log "   Duration: ${BLOCK_DURATION}s"
    log "   Method: $BLOCK_METHOD"
    log "   Result: $(if [[ $test_result -eq 0 ]]; then echo "PASS"; else echo "FAIL"; fi)"

    # Load metrics
    if [[ -f "/tmp/${TEST_ID}-metrics.txt" ]]; then
        source "/tmp/${TEST_ID}-metrics.txt"

        log ""
        log "📊 Test Metrics:"
        log "   Total tests during block: ${total_tests:-0}"
        log "   Success rate: ${success_rate:-0}%"
        log "   Fallback usage rate: ${fallback_rate:-0}%"
        log "   Failed tests: ${failed_tests:-0}"
        log "   Recovery time: ${recovery_time:-unknown}s"

        # Evaluate success criteria
        local criteria_passed=0
        local total_criteria=3

        # Criterion 1: Adequate success rate during block
        if [[ "${success_rate:-0}" -ge 70 ]]; then
            log "   ✅ Success rate ≥70% during block: PASS"
            ((criteria_passed++))
        else
            log "   ❌ Success rate <70% during block: FAIL"
        fi

        # Criterion 2: Fallback mechanism activated
        if [[ "${fallback_rate:-0}" -ge 50 ]]; then
            log "   ✅ Fallback usage ≥50%: PASS"
            ((criteria_passed++))
        else
            log "   ❌ Fallback usage <50%: FAIL"
        fi

        # Criterion 3: Quick recovery
        if [[ "$recovery_time" != "timeout" ]] && [[ "${recovery_time:-999}" -le 15 ]]; then
            log "   ✅ Recovery time ≤15s: PASS"
            ((criteria_passed++))
        else
            log "   ❌ Recovery time >15s: FAIL"
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

    # Ensure LLM access is restored
    remove_block "$PRIMARY_LLM_HOST"

    # Clean up temporary files (keep logs for analysis)
    rm -f "/tmp/${TEST_ID}-metrics.txt"
    rm -f "$HOSTS_BACKUP"
}

# Emergency rollback
emergency_rollback() {
    log "🚨 Emergency rollback triggered!"

    # Restore LLM access
    remove_block "$PRIMARY_LLM_HOST"

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