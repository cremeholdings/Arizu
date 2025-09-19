# Backup and Restore Drill Documentation

This document outlines the procedures, schedules, and success criteria for backup and restore drills to ensure data protection and disaster recovery capabilities.

## Overview

Regular backup and restore drills are essential for:
- Validating backup integrity
- Testing restore procedures
- Training team members
- Identifying potential issues
- Ensuring RTO/RPO compliance

## Backup Schedule

### Nightly Backups

#### PostgreSQL Database
```bash
# Run at 2:00 AM daily
0 2 * * * cd /path/to/arizu && source .env.backup && ./scripts/pg-backup.sh >/dev/null 2>&1
```

#### n8n Workflows and Data
```bash
# Run at 2:30 AM daily (after database backup)
30 2 * * * cd /path/to/arizu && source .env.backup && ./scripts/n8n-export.sh >/dev/null 2>&1
```

#### Combined Backup Script
```bash
#!/bin/bash
# nightly-backup.sh - Complete backup routine

set -euo pipefail

BACKUP_LOG="/var/log/arizu/backup.log"
EMAIL_ALERTS="admin@company.com"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$BACKUP_LOG"
}

# Database backup
log "Starting PostgreSQL backup..."
if ./scripts/pg-backup.sh; then
    log "✅ PostgreSQL backup completed"
else
    log "❌ PostgreSQL backup failed"
    echo "PostgreSQL backup failed at $(date)" | mail -s "Backup Alert" "$EMAIL_ALERTS"
    exit 1
fi

# n8n export
log "Starting n8n export..."
if ./scripts/n8n-export.sh; then
    log "✅ n8n export completed"
else
    log "❌ n8n export failed"
    echo "n8n export failed at $(date)" | mail -s "Backup Alert" "$EMAIL_ALERTS"
    exit 1
fi

log "🎉 Nightly backup completed successfully"
```

#### Cron Setup
```bash
# Add to root crontab
sudo crontab -e

# Nightly backups at 2:00 AM
0 2 * * * cd /opt/arizu && source .env.backup && ./scripts/nightly-backup.sh

# Weekly backup verification at 3:00 AM on Sundays
0 3 * * 0 cd /opt/arizu && source .env.backup && ./scripts/pg-restore.sh --no-cleanup

# Monthly cleanup of old backups at 1:00 AM on 1st of month
0 1 1 * * find /opt/arizu/backups -name "pg-*.dump.gz" -mtime +30 -delete
```

## Monthly Restore Drill

### Schedule
- **Frequency**: Monthly, first Saturday of each month
- **Time**: 10:00 AM - 12:00 PM (2-hour window)
- **Responsible**: DevOps/SRE team
- **Stakeholders**: Engineering leads, Product team

### Roles and Responsibilities

#### Primary Operator (DevOps Engineer)
- Execute restore procedures
- Document results
- Troubleshoot issues
- Communicate status updates

#### Observer (Senior Engineer)
- Review procedures
- Validate results
- Provide guidance
- Serve as backup operator

#### Stakeholder (Product/Engineering Lead)
- Define acceptance criteria
- Approve drill completion
- Escalate issues if needed

### Pre-Drill Checklist

#### Environment Preparation
- [ ] Test environment available and isolated
- [ ] Latest backup files identified and accessible
- [ ] Required credentials and access permissions verified
- [ ] Monitoring and alerting temporarily disabled for test systems
- [ ] Team members notified of drill schedule

#### Tool Verification
- [ ] All backup scripts executable and accessible
- [ ] PostgreSQL client tools installed and functional
- [ ] n8n instance available for testing
- [ ] Network connectivity to backup storage verified
- [ ] Disk space sufficient for restore operations

#### Documentation Review
- [ ] Restore procedures reviewed and updated
- [ ] Emergency contact list current
- [ ] Escalation procedures documented
- [ ] Success criteria clearly defined

### Drill Execution Procedure

#### Phase 1: Environment Setup (15 minutes)

1. **Initialize Test Environment**
   ```bash
   # Set up test database connection
   export PGHOST=test-postgres.internal
   export PGUSER=restore_test_user
   export PGPASSWORD=secure_test_password
   export PGDATABASE=arizu_restore_test

   # Verify environment
   echo "Test environment: $PGHOST"
   echo "Test database: $PGDATABASE"
   echo "Timestamp: $(date)"
   ```

2. **Identify Latest Backups**
   ```bash
   # Find most recent backups
   LATEST_PG_BACKUP=$(ls -t ./backups/pg-*.dump.gz | head -1)
   LATEST_N8N_EXPORT=$(ls -t ./backups/n8n-export-*.tgz | head -1)

   echo "PostgreSQL backup: $LATEST_PG_BACKUP"
   echo "n8n export: $LATEST_N8N_EXPORT"
   echo "PG backup age: $((($(date +%s) - $(stat -c %Y "$LATEST_PG_BACKUP")) / 3600)) hours"
   echo "n8n export age: $((($(date +%s) - $(stat -c %Y "$LATEST_N8N_EXPORT")) / 3600)) hours"
   ```

#### Phase 2: PostgreSQL Restore Test (30 minutes)

3. **Execute Database Restore**
   ```bash
   # Run restore test
   echo "=== PostgreSQL Restore Test ===" | tee -a drill-log.txt
   echo "Start time: $(date)" | tee -a drill-log.txt

   if ./scripts/pg-restore.sh "$LATEST_PG_BACKUP" --no-cleanup; then
       echo "✅ PASS: PostgreSQL restore successful" | tee -a drill-log.txt
       PG_RESTORE_SUCCESS=true
   else
       echo "❌ FAIL: PostgreSQL restore failed" | tee -a drill-log.txt
       PG_RESTORE_SUCCESS=false
   fi

   echo "End time: $(date)" | tee -a drill-log.txt
   ```

4. **Validate Database Integrity**
   ```bash
   # Connect to restored database and run validation queries
   TEST_DB=$(echo "$PGDATABASE" | sed 's/arizu/arizu_test_'$(date +%s)'/')

   # Test basic connectivity
   psql -h "$PGHOST" -U "$PGUSER" -d "$TEST_DB" -c "SELECT version();"

   # Verify table counts
   TABLE_COUNT=$(psql -h "$PGHOST" -U "$PGUSER" -d "$TEST_DB" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
   echo "Tables restored: $TABLE_COUNT" | tee -a drill-log.txt

   # Check for critical tables
   CRITICAL_TABLES=("users" "organizations" "automations" "automation_runs")
   for table in "${CRITICAL_TABLES[@]}"; do
       if psql -h "$PGHOST" -U "$PGUSER" -d "$TEST_DB" -c "\\dt $table" | grep -q "$table"; then
           ROW_COUNT=$(psql -h "$PGHOST" -U "$PGUSER" -d "$TEST_DB" -t -c "SELECT count(*) FROM $table;")
           echo "✅ Table $table: $ROW_COUNT rows" | tee -a drill-log.txt
       else
           echo "❌ Table $table: MISSING" | tee -a drill-log.txt
       fi
   done
   ```

#### Phase 3: n8n Export Verification (30 minutes)

5. **Extract and Validate n8n Export**
   ```bash
   echo "=== n8n Export Verification ===" | tee -a drill-log.txt
   echo "Start time: $(date)" | tee -a drill-log.txt

   # Extract export archive
   EXTRACT_DIR="/tmp/n8n-restore-test-$(date +%s)"
   mkdir -p "$EXTRACT_DIR"

   if tar -xzf "$LATEST_N8N_EXPORT" -C "$EXTRACT_DIR"; then
       echo "✅ PASS: n8n export extraction successful" | tee -a drill-log.txt
       N8N_EXTRACT_SUCCESS=true
   else
       echo "❌ FAIL: n8n export extraction failed" | tee -a drill-log.txt
       N8N_EXTRACT_SUCCESS=false
   fi
   ```

6. **Validate n8n Data Integrity**
   ```bash
   # Check for expected files
   EXPECTED_FILES=("export-metadata.txt")
   for file in "${EXPECTED_FILES[@]}"; do
       if [[ -f "$EXTRACT_DIR"/*/"$file" ]]; then
           echo "✅ File $file: present" | tee -a drill-log.txt
       else
           echo "❌ File $file: missing" | tee -a drill-log.txt
       fi
   done

   # Validate workflow exports (if API was available)
   if [[ -f "$EXTRACT_DIR"/*/workflows.json ]]; then
       WORKFLOW_COUNT=$(jq '. | length' "$EXTRACT_DIR"/*/workflows.json 2>/dev/null || echo "0")
       echo "✅ Workflows exported: $WORKFLOW_COUNT" | tee -a drill-log.txt
   else
       echo "⚠️  No workflow export found (API may not have been available)" | tee -a drill-log.txt
   fi

   # Check volume backup
   if [[ -d "$EXTRACT_DIR"/*/volume_data ]]; then
       VOLUME_SIZE=$(du -h "$EXTRACT_DIR"/*/volume_data | tail -1 | cut -f1)
       echo "✅ Volume backup: $VOLUME_SIZE" | tee -a drill-log.txt
   else
       echo "❌ Volume backup: missing" | tee -a drill-log.txt
   fi
   ```

#### Phase 4: Application-Level Testing (30 minutes)

7. **Functional Verification**
   ```bash
   echo "=== Application-Level Testing ===" | tee -a drill-log.txt

   # Test API endpoints (if available)
   if command -v curl >/dev/null 2>&1; then
       # Test health endpoint
       if curl -s "http://test-app.internal/health" | grep -q "ok"; then
           echo "✅ Health endpoint: responding" | tee -a drill-log.txt
       else
           echo "❌ Health endpoint: not responding" | tee -a drill-log.txt
       fi

       # Test authentication
       if curl -s "http://test-app.internal/api/auth/status" | grep -q "user\|auth"; then
           echo "✅ Auth API: responding" | tee -a drill-log.txt
       else
           echo "❌ Auth API: not responding" | tee -a drill-log.txt
       fi
   fi
   ```

8. **Data Consistency Checks**
   ```bash
   # Verify referential integrity
   echo "Checking referential integrity..." | tee -a drill-log.txt

   # Check user-organization relationships
   ORPHANED_MEMBERSHIPS=$(psql -h "$PGHOST" -U "$PGUSER" -d "$TEST_DB" -t -c "
       SELECT count(*)
       FROM organization_members om
       LEFT JOIN users u ON om.userId = u.clerkId
       LEFT JOIN organizations o ON om.orgId = o.clerkId
       WHERE u.clerkId IS NULL OR o.clerkId IS NULL;
   ")

   if [[ "$ORPHANED_MEMBERSHIPS" -eq 0 ]]; then
       echo "✅ Referential integrity: passed" | tee -a drill-log.txt
   else
       echo "❌ Referential integrity: $ORPHANED_MEMBERSHIPS orphaned memberships" | tee -a drill-log.txt
   fi
   ```

#### Phase 5: Cleanup and Reporting (15 minutes)

9. **Environment Cleanup**
   ```bash
   echo "=== Cleanup ===" | tee -a drill-log.txt

   # Drop test database
   dropdb -h "$PGHOST" -U "$PGUSER" --if-exists "$TEST_DB"
   echo "✅ Test database cleaned up" | tee -a drill-log.txt

   # Remove temporary files
   rm -rf "$EXTRACT_DIR"
   echo "✅ Temporary files cleaned up" | tee -a drill-log.txt
   ```

10. **Generate Drill Report**
    ```bash
    echo "=== DRILL SUMMARY ===" | tee -a drill-log.txt
    echo "Date: $(date)" | tee -a drill-log.txt
    echo "PostgreSQL Restore: $(if [[ "$PG_RESTORE_SUCCESS" == true ]]; then echo "PASS"; else echo "FAIL"; fi)" | tee -a drill-log.txt
    echo "n8n Export Extraction: $(if [[ "$N8N_EXTRACT_SUCCESS" == true ]]; then echo "PASS"; else echo "FAIL"; fi)" | tee -a drill-log.txt
    echo "Overall Status: $(if [[ "$PG_RESTORE_SUCCESS" == true && "$N8N_EXTRACT_SUCCESS" == true ]]; then echo "PASS"; else echo "FAIL"; fi)" | tee -a drill-log.txt

    # Archive drill log
    cp drill-log.txt "drill-$(date +%Y%m%d).log"
    ```

### Success Criteria

#### Primary Success Criteria (Must Pass)
- [ ] PostgreSQL backup can be restored without errors
- [ ] Restored database contains all expected tables
- [ ] Critical tables (users, organizations, automations) have data
- [ ] n8n export archive can be extracted successfully
- [ ] No data corruption detected in restored database
- [ ] Referential integrity constraints are satisfied

#### Secondary Success Criteria (Should Pass)
- [ ] Application APIs respond correctly using restored data
- [ ] n8n workflows can be imported successfully
- [ ] Performance metrics within acceptable ranges
- [ ] No security vulnerabilities introduced during restore
- [ ] All team members can execute procedures correctly

#### Failure Criteria (Immediate Escalation)
- [ ] Cannot connect to restored database
- [ ] Critical tables are missing or empty
- [ ] Data corruption detected
- [ ] Backup files are corrupted or unreadable
- [ ] Restore process takes longer than RTO (4 hours)

### Post-Drill Actions

#### Successful Drill
1. **Document Results**
   ```bash
   # Update drill tracking spreadsheet
   echo "$(date +%Y-%m-%d),PASS,PostgreSQL: PASS n8n: PASS,No issues" >> drill-history.csv

   # Send success notification
   echo "Monthly restore drill completed successfully on $(date)" | \
       mail -s "✅ Restore Drill PASSED" stakeholders@company.com
   ```

2. **Update Documentation**
   - Review and update procedures if any improvements identified
   - Update team contact information
   - Refresh credential information if needed

3. **Schedule Next Drill**
   - Add next month's drill to team calendar
   - Assign roles for next drill
   - Review any planned system changes that might affect procedures

#### Failed Drill
1. **Immediate Actions**
   ```bash
   # Alert stakeholders immediately
   echo "URGENT: Monthly restore drill FAILED on $(date). Review required." | \
       mail -s "❌ RESTORE DRILL FAILED" emergency@company.com

   # Document failure details
   echo "$(date +%Y-%m-%d),FAIL,Details in drill-$(date +%Y%m%d).log,Investigation required" >> drill-history.csv
   ```

2. **Investigation Process**
   - Identify root cause of failure
   - Assess impact on disaster recovery capabilities
   - Develop remediation plan
   - Test remediation in isolated environment

3. **Remediation and Re-test**
   - Implement fixes for identified issues
   - Re-run drill within 1 week
   - Document lessons learned
   - Update procedures to prevent recurrence

### Drill Variations

#### Quarterly Full-Scale Drill
- Include full application stack restore
- Test complete disaster recovery scenario
- Involve all stakeholders
- Measure full RTO/RPO compliance

#### Disaster Simulation Drill
- Simulate complete data center failure
- Test backup retrieval from cloud storage
- Practice communication procedures
- Validate emergency contact systems

#### New Team Member Training Drill
- Have new team members lead the drill
- Focus on procedure documentation clarity
- Identify knowledge gaps
- Update training materials

### Monitoring and Metrics

#### Key Metrics to Track
- **RTO (Recovery Time Objective)**: Target ≤ 4 hours
- **RPO (Recovery Point Objective)**: Target ≤ 1 hour
- **Drill Success Rate**: Target ≥ 95%
- **Time to Complete Drill**: Target ≤ 2 hours
- **Data Integrity Score**: Target = 100%

#### Monthly Drill Tracking
```bash
# Create monthly metrics report
cat > monthly-drill-metrics.md <<EOF
# Monthly Drill Metrics - $(date +%B %Y)

## Summary
- Drill Date: $(date +%Y-%m-%d)
- Duration: X hours Y minutes
- Result: PASS/FAIL
- Participants: [List team members]

## Metrics
- PostgreSQL Restore Time: X minutes
- n8n Export Verification Time: Y minutes
- Data Integrity Score: 100%
- Issues Identified: N/A or [List issues]

## Action Items
- [ ] Update procedure X
- [ ] Train team member Y
- [ ] Investigate issue Z

## Next Drill
- Scheduled: [First Saturday of next month]
- Assigned Operator: [Name]
- Assigned Observer: [Name]
EOF
```

### Automation Helpers

#### Slack Integration
```bash
# Send Slack notifications
send_slack_notification() {
    local message="$1"
    local webhook_url="$SLACK_WEBHOOK_URL"

    curl -X POST -H 'Content-type: application/json' \
        --data "{\"text\":\"$message\"}" \
        "$webhook_url"
}

# Usage examples
send_slack_notification "🚨 Monthly restore drill starting"
send_slack_notification "✅ Restore drill completed successfully"
send_slack_notification "❌ Restore drill failed - investigation required"
```

#### PagerDuty Integration
```bash
# Trigger PagerDuty alert for failed drill
trigger_pagerduty_alert() {
    local routing_key="$PAGERDUTY_ROUTING_KEY"
    local summary="$1"

    curl -X POST \
        -H "Content-Type: application/json" \
        -d "{
            \"routing_key\": \"$routing_key\",
            \"event_action\": \"trigger\",
            \"payload\": {
                \"summary\": \"$summary\",
                \"severity\": \"critical\",
                \"source\": \"backup-restore-drill\"
            }
        }" \
        "https://events.pagerduty.com/v2/enqueue"
}
```

### Compliance and Auditing

#### Audit Trail
- All drill activities logged with timestamps
- Results stored in version-controlled repository
- Access to backup systems logged and monitored
- Changes to procedures require approval and documentation

#### Compliance Reporting
```bash
# Generate quarterly compliance report
generate_compliance_report() {
    local quarter="$1"
    local year="$2"

    cat > "compliance-report-${year}Q${quarter}.md" <<EOF
# Backup and Restore Compliance Report - ${year}Q${quarter}

## Drill Execution Summary
$(grep "^${year}" drill-history.csv | head -3)

## Compliance Status
- Quarterly drills completed: X/3
- Success rate: Y%
- Average RTO: Z hours
- Documentation updated: ✅/❌

## Issues and Remediation
[List any issues and how they were resolved]

## Recommendations
[List recommendations for next quarter]
EOF
}
```

### Contact Information

#### Emergency Contacts
- **Primary On-Call**: DevOps Engineer (phone: xxx-xxx-xxxx)
- **Secondary On-Call**: Senior Engineer (phone: xxx-xxx-xxxx)
- **Escalation**: Engineering Manager (phone: xxx-xxx-xxxx)
- **Executive Escalation**: CTO (phone: xxx-xxx-xxxx)

#### Vendor Contacts
- **Database Support**: PostgreSQL Support Team
- **Cloud Provider**: AWS/GCP Support
- **n8n Support**: n8n Enterprise Support (if applicable)

### Recovery Time Objectives

#### Target Recovery Times
- **Database Restore**: ≤ 30 minutes
- **Application Recovery**: ≤ 2 hours
- **Full Service Restoration**: ≤ 4 hours
- **Data Validation**: ≤ 1 hour

#### Escalation Triggers
- Drill duration exceeds 3 hours
- Any primary success criteria fails
- Data corruption detected
- Unable to contact key personnel

## Conclusion

Regular execution of backup and restore drills ensures our disaster recovery capabilities remain effective. This process protects our data, validates our procedures, and provides confidence in our ability to recover from various failure scenarios.

For questions or updates to this documentation, contact the DevOps team.