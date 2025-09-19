# Chaos Engineering Documentation

This document provides comprehensive guidance for conducting chaos engineering experiments to validate system resilience, identify weaknesses, and improve fault tolerance.

## Overview

Chaos engineering is the practice of intentionally introducing controlled failures into a system to test its resilience and ability to recover from unexpected conditions. Our chaos testing suite includes three primary scenarios:

1. **n8n Service Disruption** - Tests workflow engine outages
2. **LLM Provider Blocking** - Tests AI service fallback mechanisms
3. **Redis Latency Simulation** - Tests caching and session resilience

## Safety Guidelines

### ⚠️ STAGING ENVIRONMENT ONLY ⚠️

**NEVER run chaos tests in production environments unless:**
- You have explicit approval from engineering leadership
- You have a detailed rollback plan
- You have monitoring and alerting in place
- You have scheduled the test during low-traffic periods

### Environment Requirements

```bash
# Required environment variables for safety
export ENVIRONMENT=staging
export NODE_ENV=staging

# Or force override (use with extreme caution)
export FORCE_CHAOS=true
```

### Prerequisites

- All chaos tests require explicit confirmation with `--yes` flag
- Most tests require elevated privileges (sudo)
- Staging environment should mirror production architecture
- Monitoring and alerting should be active during tests
- Team members should be notified before testing

## Test Scenarios

### 1. n8n Service Disruption Test

**Purpose**: Validate application behavior when workflow engine is unavailable

**Script**: `scripts/chaos-kill-n8n.sh`

#### Expected Observable Symptoms

**During n8n Outage (Normal Behavior):**
- [ ] Application health endpoint remains responsive
- [ ] Workflow deployment attempts fail gracefully with appropriate error messages
- [ ] Existing workflows stop executing
- [ ] Application displays clear status indicators about workflow engine unavailability
- [ ] API endpoints that don't depend on n8n continue working
- [ ] User sessions and authentication remain functional

**Concerning Symptoms (Investigate if observed):**
- [ ] Application becomes completely unresponsive
- [ ] Database connections are exhausted
- [ ] Memory leaks or CPU spikes
- [ ] Cascading failures to other services
- [ ] Silent failures without error reporting

#### Step-by-Step Execution

1. **Pre-Test Checklist**
   ```bash
   # Verify staging environment
   echo "Environment: $ENVIRONMENT"
   echo "n8n status: $(docker-compose ps n8n)"

   # Check application health
   curl -f http://localhost:3000/health

   # Verify monitoring is active
   curl -f http://monitoring.staging.internal/status
   ```

2. **Execute Test**
   ```bash
   # Standard 30-second outage
   ./scripts/chaos-kill-n8n.sh --yes

   # Extended 60-second test for thorough validation
   ./scripts/chaos-kill-n8n.sh --yes --duration=60
   ```

3. **Monitor During Test**
   ```bash
   # In separate terminal - monitor logs
   tail -f /var/log/arizu/app.log | grep -E "(error|warn|n8n)"

   # Monitor application metrics
   watch -n 5 "curl -s http://localhost:3000/health | jq ."

   # Check for error patterns
   docker-compose logs --follow app | grep -E "(timeout|connection|error)"
   ```

#### Success Criteria

- [ ] Application maintains >80% availability during outage
- [ ] n8n outage is properly detected (>70% of health checks show n8n down)
- [ ] Service recovery completes within 30 seconds after n8n restart
- [ ] No data corruption or inconsistent state
- [ ] Error messages are user-friendly and actionable

#### Rollback Commands

```bash
# Emergency n8n restart
docker-compose restart n8n

# Full service restart if needed
docker-compose restart

# Check service status
docker-compose ps
```

### 2. LLM Provider Blocking Test

**Purpose**: Validate fallback mechanisms when primary AI provider is unavailable

**Script**: `scripts/chaos-block-llm.sh`

#### Expected Observable Symptoms

**During LLM Blocking (Normal Behavior):**
- [ ] Plan generation continues using fallback provider
- [ ] Response times may increase but stay under 30 seconds
- [ ] Error messages indicate primary provider unavailability
- [ ] Fallback provider usage is logged and monitored
- [ ] Rate limiting adjusts appropriately for fallback provider
- [ ] Application gracefully handles provider switching

**Concerning Symptoms (Investigate if observed):**
- [ ] Plan generation completely fails
- [ ] Requests timeout without fallback
- [ ] Application becomes unresponsive
- [ ] Rate limits are exceeded on fallback provider
- [ ] Silent failures with no error logging

#### Step-by-Step Execution

1. **Pre-Test Checklist**
   ```bash
   # Verify LLM connectivity
   curl -s https://api.openai.com/v1/models | head -10
   curl -s https://api.anthropic.com/v1/messages | head -10

   # Test plan generation baseline
   curl -X POST http://localhost:3000/api/plan \
     -H "Content-Type: application/json" \
     -d '{"prompt": "Send email when form submitted"}'

   # Check API keys are configured
   echo "OpenAI key configured: $([ -n "$OPENAI_API_KEY" ] && echo "Yes" || echo "No")"
   echo "Anthropic key configured: $([ -n "$ANTHROPIC_API_KEY" ] && echo "Yes" || echo "No")"
   ```

2. **Execute Test**
   ```bash
   # Standard 60-second block using /etc/hosts
   sudo ./scripts/chaos-block-llm.sh --yes

   # Test with different block method
   sudo ./scripts/chaos-block-llm.sh --yes --method=iptables

   # Extended test for stress validation
   sudo ./scripts/chaos-block-llm.sh --yes --duration=120
   ```

3. **Monitor During Test**
   ```bash
   # Monitor plan generation attempts
   watch -n 10 "curl -s -X POST http://localhost:3000/api/plan \
     -H 'Content-Type: application/json' \
     -d '{\"prompt\": \"test workflow\"}' | jq ."

   # Check LLM provider logs
   tail -f /var/log/arizu/app.log | grep -E "(openai|anthropic|llm|provider)"

   # Monitor fallback usage
   grep -c "fallback\|anthropic" /var/log/arizu/app.log
   ```

#### Success Criteria

- [ ] Plan generation maintains >70% success rate during primary provider block
- [ ] Fallback provider is used for >50% of requests during block
- [ ] Service recovery completes within 15 seconds after unblocking
- [ ] No requests are completely lost (even if delayed)
- [ ] Appropriate error handling and user messaging

#### Rollback Commands

```bash
# Emergency DNS restoration (if using hosts method)
sudo cp /etc/hosts.backup /etc/hosts 2>/dev/null || echo "Backup not found"

# Emergency iptables cleanup (if using iptables method)
sudo iptables -F OUTPUT

# Verify connectivity restored
curl -s https://api.openai.com/ | head -5

# Test application recovery
curl -X POST http://localhost:3000/api/plan \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test recovery"}'
```

### 3. Redis Latency Simulation Test

**Purpose**: Validate caching resilience and backpressure handling under network stress

**Script**: `scripts/chaos-stall-redis.sh`

#### Expected Observable Symptoms

**During Redis Latency (Normal Behavior):**
- [ ] Application response times increase but remain functional
- [ ] Cache miss rates increase, but application doesn't crash
- [ ] Session management degrades gracefully
- [ ] Rate limiting may become less accurate but still functions
- [ ] Background jobs queue up but continue processing when latency improves
- [ ] Application shows appropriate timeout handling

**Concerning Symptoms (Investigate if observed):**
- [ ] Application becomes completely unresponsive
- [ ] Memory usage spikes due to connection pooling issues
- [ ] Database query volume increases dramatically
- [ ] Session state is lost completely
- [ ] Data corruption due to failed Redis operations

#### Step-by-Step Execution

1. **Pre-Test Checklist**
   ```bash
   # Verify Redis connectivity and performance
   redis-cli -h localhost ping
   redis-cli -h localhost --latency-history -i 1 | head -5

   # Check application caching
   curl -s http://localhost:3000/api/auth/status
   curl -s http://localhost:3000/health

   # Verify network interface
   ip route | grep default

   # Check baseline metrics
   redis-cli -h localhost info stats | grep -E "(keyspace_hits|keyspace_misses)"
   ```

2. **Execute Test** (Requires root privileges)
   ```bash
   # Standard test with 500ms latency and 5% packet loss
   sudo ./scripts/chaos-stall-redis.sh --yes

   # High latency stress test
   sudo ./scripts/chaos-stall-redis.sh --yes --latency=1000 --loss=10

   # Extended duration test
   sudo ./scripts/chaos-stall-redis.sh --yes --duration=120
   ```

3. **Monitor During Test**
   ```bash
   # Monitor Redis latency in real-time
   redis-cli -h localhost --latency-history -i 5

   # Watch application performance
   watch -n 5 "curl -w 'Time: %{time_total}s\n' -s http://localhost:3000/health"

   # Monitor cache hit rates
   watch -n 10 "redis-cli info stats | grep -E 'keyspace_(hits|misses)'"

   # Check connection pool status
   curl -s http://localhost:3000/api/debug/redis-status | jq .
   ```

#### Success Criteria

- [ ] Application maintains >60% success rate during Redis latency
- [ ] Redis connection issues affect <30% of operations
- [ ] Application degradation events are limited to <50% of test intervals
- [ ] Service recovery completes within 30 seconds after latency removal
- [ ] No data loss or corruption occurs

#### Rollback Commands

```bash
# Emergency traffic control cleanup
sudo tc qdisc del dev eth0 root 2>/dev/null || true
sudo tc qdisc del dev lo root 2>/dev/null || true

# Clear all tc rules
sudo tc qdisc show | grep -o 'dev [^ ]*' | while read -r line; do
    interface=$(echo $line | cut -d' ' -f2)
    sudo tc qdisc del dev "$interface" root 2>/dev/null || true
done

# Verify Redis connectivity restored
redis-cli -h localhost ping
redis-cli -h localhost --latency-history -i 1 | head -3

# Test application recovery
curl -w "Time: %{time_total}s\n" http://localhost:3000/health
```

## Mitigation Checklist

### During Active Chaos Test

1. **Immediate Response (0-2 minutes)**
   - [ ] Confirm test is running in staging environment
   - [ ] Verify rollback procedures are ready
   - [ ] Monitor key application metrics
   - [ ] Check that expected symptoms are occurring

2. **Monitoring Phase (Throughout test duration)**
   - [ ] Track success criteria metrics
   - [ ] Document unexpected behaviors
   - [ ] Monitor for cascading failures
   - [ ] Ensure recovery mechanisms are working

3. **If Test Goes Wrong**
   - [ ] Execute appropriate rollback commands immediately
   - [ ] Verify all services are restored
   - [ ] Document what went wrong
   - [ ] Notify team members
   - [ ] Schedule post-incident review

### Post-Test Analysis

1. **Immediate Validation (0-10 minutes after test)**
   ```bash
   # Verify all services are healthy
   docker-compose ps
   curl -f http://localhost:3000/health
   redis-cli ping

   # Check for any stuck processes or connections
   netstat -tulpn | grep -E "(3000|6379|5678)"

   # Verify data integrity
   curl -s http://localhost:3000/api/auth/status
   ```

2. **Metrics Collection (10-30 minutes after test)**
   ```bash
   # Collect test logs
   cp /tmp/chaos-*-*.log ./chaos-test-results/

   # Export application metrics for analysis
   curl -s http://localhost:3000/metrics > post-test-metrics.txt

   # Check error rates in logs
   grep -c "ERROR" /var/log/arizu/app.log

   # Generate test report
   echo "Test completed at $(date)" >> test-summary.md
   ```

3. **Team Communication**
   ```bash
   # Send Slack notification
   curl -X POST -H 'Content-type: application/json' \
     --data '{"text":"Chaos test completed: [PASS/FAIL] - see #engineering"}' \
     "$SLACK_WEBHOOK_URL"

   # Update test tracking spreadsheet
   echo "$(date +%Y-%m-%d),$TEST_NAME,PASS/FAIL,Notes" >> chaos-test-log.csv
   ```

## Common Issues and Solutions

### Issue: Tests Fail to Start

**Symptoms:**
- Scripts exit with permission errors
- Environment validation fails
- Required tools are missing

**Solutions:**
```bash
# Fix permissions
chmod +x scripts/chaos-*.sh

# Install missing tools
sudo apt-get update
sudo apt-get install iproute2 redis-tools curl docker-compose

# Set environment properly
export ENVIRONMENT=staging
export NODE_ENV=staging
```

### Issue: Network Changes Don't Take Effect

**Symptoms:**
- Traffic control rules applied but no latency observed
- Host blocking doesn't prevent connectivity

**Solutions:**
```bash
# Check if interface is correct
ip route show default

# Verify tc rules are applied
tc qdisc show

# Check iptables rules
iptables -L OUTPUT -n

# Clear and reapply rules
sudo tc qdisc del dev eth0 root
sudo ./scripts/chaos-stall-redis.sh --yes
```

### Issue: Services Don't Recover After Test

**Symptoms:**
- Application remains slow after test completion
- Services show as running but don't respond
- Error rates remain high

**Solutions:**
```bash
# Full service restart
docker-compose restart

# Clear all network rules
sudo tc qdisc del dev eth0 root 2>/dev/null || true

# Reset iptables if used
sudo iptables -F
sudo iptables -X

# Check for lingering connections
ss -tulpn | grep -E "(3000|6379|5678)"

# Force restart if needed
docker-compose down && docker-compose up -d
```

### Issue: False Positives in Success Criteria

**Symptoms:**
- Tests report failure despite expected behavior
- Metrics collection fails
- Thresholds seem too strict

**Solutions:**
```bash
# Review baseline metrics before test
curl -s http://localhost:3000/health | jq .
redis-cli --latency-history -i 1 | head -10

# Adjust test parameters
export CHECK_INTERVAL=20  # Slower monitoring
export OUTAGE_DURATION=45  # Longer test duration

# Review success criteria in test output
tail -20 /tmp/chaos-*-*.log
```

## Test Schedule and Frequency

### Regular Testing Schedule

- **Weekly**: Run one chaos test during low-traffic staging periods
- **Monthly**: Execute all three tests as part of system health validation
- **Pre-Release**: Run full chaos test suite before major deployments
- **Incident Response**: Run relevant tests after production incidents

### Recommended Test Rotation

```bash
# Week 1: n8n service disruption
./scripts/chaos-kill-n8n.sh --yes

# Week 2: LLM provider blocking
sudo ./scripts/chaos-block-llm.sh --yes

# Week 3: Redis latency simulation
sudo ./scripts/chaos-stall-redis.sh --yes

# Week 4: Combined testing or rest week
```

### Test Documentation Requirements

For each test execution, document:
- Date and time of test
- Environment configuration
- Test parameters used
- Results and success criteria met
- Issues discovered
- Action items for improvement

## Integration with CI/CD

### Automated Chaos Testing

```yaml
# .github/workflows/chaos-test.yml
name: Chaos Engineering Tests
on:
  schedule:
    - cron: '0 2 * * 1'  # Weekly on Monday at 2 AM
  workflow_dispatch:     # Manual trigger

jobs:
  chaos-test:
    runs-on: self-hosted
    environment: staging
    steps:
      - uses: actions/checkout@v3
      - name: Run n8n disruption test
        run: |
          export ENVIRONMENT=staging
          ./scripts/chaos-kill-n8n.sh --yes
      - name: Run LLM blocking test
        run: |
          export ENVIRONMENT=staging
          sudo ./scripts/chaos-block-llm.sh --yes
      - name: Run Redis latency test
        run: |
          export ENVIRONMENT=staging
          sudo ./scripts/chaos-stall-redis.sh --yes
      - name: Upload test results
        uses: actions/upload-artifact@v3
        with:
          name: chaos-test-results
          path: /tmp/chaos-*.log
```

### Monitoring Integration

```bash
# Prometheus metrics for chaos testing
echo "chaos_test_executions_total{test_type=\"n8n_disruption\",result=\"pass\"} 1" | \
  curl -X POST --data-binary @- http://pushgateway:9091/metrics/job/chaos_tests

# Alert manager notifications
curl -X POST http://alertmanager:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{
    "labels": {
      "alertname": "ChaosTestCompleted",
      "severity": "info",
      "test_type": "n8n_disruption"
    },
    "annotations": {
      "summary": "Chaos test completed successfully"
    }
  }]'
```

## Compliance and Audit Requirements

### Documentation Requirements

Each chaos test must maintain:
- Detailed execution logs
- Success/failure criteria evaluation
- Impact assessment on system behavior
- Remediation actions taken
- Lessons learned and improvements

### Approval Process

Before running chaos tests:
1. Get approval from engineering team lead
2. Schedule during agreed-upon maintenance windows
3. Notify relevant stakeholders
4. Ensure monitoring and alerting is active
5. Have rollback procedures ready

### Risk Assessment

For each test scenario, evaluate:
- **Impact**: What systems could be affected?
- **Probability**: How likely is this failure in production?
- **Recovery**: How quickly can we restore service?
- **Learning**: What insights will this provide?

## Continuous Improvement

### Metrics to Track

- **Test Success Rate**: Percentage of tests that meet all success criteria
- **Recovery Time**: Average time to restore service after test
- **Issue Discovery Rate**: Number of new issues found per test
- **False Positive Rate**: Tests that fail due to measurement issues

### Evolutionary Testing

As the system evolves, chaos tests should be updated to:
- Test new failure modes introduced by architecture changes
- Validate new resilience mechanisms
- Adjust success criteria based on SLA requirements
- Include new dependencies and services

### Team Learning

Regular chaos engineering sessions should include:
- Review of test results and trends
- Discussion of new failure scenarios to test
- Training on emergency response procedures
- Updates to runbooks and documentation

## Emergency Contacts

- **Primary On-Call Engineer**: [Phone number]
- **Secondary On-Call**: [Phone number]
- **Engineering Manager**: [Phone number]
- **Infrastructure Team Lead**: [Phone number]

## References and Resources

- [Chaos Engineering Principles](https://principlesofchaos.org/)
- [Netflix Chaos Monkey](https://github.com/Netflix/chaosmonkey)
- [Gremlin Chaos Engineering](https://www.gremlin.com/chaos-engineering/)
- [Internal Runbooks](./runbooks/)
- [Incident Response Procedures](./incident-response.md)

---

**Remember**: The goal of chaos engineering is not to break things, but to discover how things break before they break in production. Always prioritize safety and learning over thoroughness of destruction.