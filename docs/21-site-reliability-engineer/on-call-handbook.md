# On-Call Handbook for Arctos Robot Controller
**Site Reliability Engineering Team**

---

## 🚨 Emergency Contacts and Escalation

### Immediate Response Team
- **Primary On-Call Engineer**: {{ONCALL_PRIMARY}}
- **Secondary On-Call Engineer**: {{ONCALL_SECONDARY}}
- **Incident Commander**: {{INCIDENT_COMMANDER}}
- **Engineering Manager**: {{ENG_MANAGER}}

### Emergency Escalation (P0/P1 Incidents)
```
Primary On-Call (0-5 min)
    ↓
Secondary On-Call + IC (5-10 min)  
    ↓
Engineering Manager (10-15 min)
    ↓
VP Engineering + CEO (15-30 min)
```

### Critical Contact Information
- **Emergency Hotline**: +1-555-EMERGENCY
- **Slack War Room**: #incident-response
- **PagerDuty**: [PagerDuty Link]
- **Status Page**: [Status Page Admin]

---

## 🎯 On-Call Responsibilities

### Primary Responsibilities
1. **Incident Response**: Respond to all alerts within 5 minutes
2. **System Monitoring**: Continuous health monitoring during shift
3. **Documentation**: Update runbooks and incident logs
4. **Escalation**: Know when and how to escalate issues
5. **Communication**: Keep stakeholders informed of incidents

### Pre-Shift Checklist
- [ ] Review current system status and recent incidents
- [ ] Check alert configurations and thresholds
- [ ] Verify access to all monitoring and response tools
- [ ] Review recent deployments and changes
- [ ] Test emergency communication channels
- [ ] Check robot safety systems status

### Post-Shift Handoff
- [ ] Brief incoming engineer on system status
- [ ] Document any ongoing issues or concerns
- [ ] Update incident status and resolution progress  
- [ ] Share lessons learned from any incidents
- [ ] Verify all alerts are properly acknowledged

---

## 🔧 Essential Tools and Access

### Monitoring and Alerting
- **Grafana Dashboards**: [Grafana URL]
- **Prometheus Metrics**: [Prometheus URL]
- **AlertManager**: [AlertManager URL]
- **PagerDuty**: [PagerDuty URL]

### System Access
- **Production Environment**: `ssh oncall@prod-server`
- **Kubernetes Cluster**: `kubectl config use-context prod`
- **Database Access**: [Database Connection Details]
- **Log Aggregation**: [Logging System URL]

### Communication Tools
- **Slack**: #sre-oncall, #incident-response
- **StatusPage**: [Admin Portal]
- **Video Conferencing**: [Meeting Room URL]
- **Documentation**: [Wiki/Confluence URL]

### Authentication and Credentials
- **Production SSH Keys**: Located in secure password manager
- **Service Accounts**: [Service Account Details]
- **API Keys**: [Secure Vault Location]
- **Emergency Access**: [Break-glass Procedures]

---

## 🤖 Robot Safety Protocols

### Safety First Principles
1. **Human Safety**: Always prioritize human safety over equipment
2. **Equipment Protection**: Prevent robot damage through safe operations
3. **Data Integrity**: Maintain robot position and configuration integrity
4. **Emergency Procedures**: Know emergency stop procedures by heart

### Emergency Stop Procedures
```bash
# Immediate emergency stop
curl -X POST http://localhost:5000/api/emergency-stop

# Check emergency stop status
curl http://localhost:5000/api/emergency-stop/status

# Robot position verification
curl http://localhost:5000/api/robot/position

# Hardware safety check
curl http://localhost:5000/api/safety/full-check
```

### Robot State Assessment
```bash
# Quick robot health check
curl http://localhost:5000/api/robot/health | jq '.'

# Hardware communication status
curl http://localhost:5000/api/hardware/status | jq '.protocols'

# Recent robot movements
curl http://localhost:5000/api/robot/movement-history?limit=10

# Error log analysis
tail -50 /var/log/arctos/robot-errors.log
```

### Safety Violation Response
1. **Immediate**: Trigger emergency stop
2. **Assess**: Determine safety risk level
3. **Isolate**: Prevent further unsafe operations
4. **Escalate**: Notify safety officer and management
5. **Document**: Record all actions taken

---

## 📊 Alert Response Procedures

### Alert Severity Classification
- **P0 (Emergency)**: Safety risks, complete system failure
- **P1 (Critical)**: Major functionality loss, SLO violations
- **P2 (High)**: Degraded performance, partial failures
- **P3 (Medium)**: Minor issues, non-critical alerts

### Standard Response Flow
1. **Acknowledge**: Acknowledge alert within 5 minutes
2. **Assess**: Determine severity and impact
3. **Communicate**: Notify team if P0/P1
4. **Investigate**: Use runbooks and diagnostic tools
5. **Mitigate**: Implement temporary fixes if needed
6. **Resolve**: Address root cause
7. **Document**: Update incident log and runbooks

### Alert Triage Questions
- Is this a safety-critical issue?
- Are users currently affected?
- Is this a known issue with existing runbook?
- Does this require immediate escalation?
- What is the potential business impact?

---

## 🔍 Common Alert Scenarios

### Robot Command Latency High
**Alert**: `RobotCommandLatencyHigh`
**Runbook**: [Hardware Latency Troubleshooting](../runbooks/high-latency-troubleshooting.md)
**Quick Actions**:
```bash
# Check current latency
curl http://localhost:5000/metrics | grep robot_command_latency

# Check system resources  
top -n1 | head -10
iostat -x 1 3

# Review recent commands
curl http://localhost:5000/api/monitoring/recent-commands
```

### Hardware Communication Down
**Alert**: `HardwareCommunicationDown`
**Runbook**: [Hardware Communication Failure](../runbooks/hardware-communication-failure.md)
**Quick Actions**:
```bash
# Check protocol status
curl http://localhost:5000/api/hardware/status

# Test connections
curl -X POST http://localhost:5000/api/hardware/test-all-protocols

# Check physical connections
dmesg | grep -i usb | tail -10
```

### API Error Rate High
**Alert**: `APIErrorRateHigh`
**Runbook**: [API Performance Issues](../runbooks/api-performance-issues.md)
**Quick Actions**:
```bash
# Check error rates by endpoint
curl http://localhost:5000/metrics | grep http_requests_total

# Review error logs
tail -100 /var/log/arctos/error.log | grep -i error

# Check database connectivity
curl http://localhost:5000/api/database/health
```

### Memory Usage Critical
**Alert**: `MemoryUsageCritical`
**Runbook**: [Resource Management](../runbooks/resource-management.md)
**Quick Actions**:
```bash
# Check memory usage
free -h
ps aux --sort=-%mem | head -10

# Application memory usage
curl http://localhost:5000/api/monitoring/memory

# Clear system caches if safe
echo 3 > /proc/sys/vm/drop_caches
```

---

## 📞 Escalation Guidelines

### When to Escalate
- **Immediately**: P0 incidents (safety, security, data loss)
- **Within 15 minutes**: P1 incidents (system down, major SLO violations)
- **Within 1 hour**: P2 incidents that cannot be resolved
- **End of shift**: P3 incidents requiring continued investigation

### Escalation Information to Provide
- Incident severity and impact assessment
- Timeline of events and actions taken
- Current system status and user impact
- Root cause analysis (if known)
- Recommended next steps

### Communication Templates
```
🚨 P0 INCIDENT ESCALATION
Summary: [Brief description]
Impact: [User/business impact]
Safety: [Any safety implications]
Actions Taken: [What you've tried]
Next Steps: [Immediate actions needed]
IC: [Incident Commander assigned]
```

---

## 🛠️ Troubleshooting Quick Reference

### System Health Checks
```bash
# Overall system status
curl http://localhost:5000/api/health

# Service status
systemctl status arctos-robot-controller

# Resource usage
htop
df -h
free -h

# Network connectivity
ss -tuln | grep :5000
ping -c3 localhost
```

### Log Analysis
```bash
# Application logs
tail -f /var/log/arctos/combined.log

# Error logs only
tail -f /var/log/arctos/error.log

# Performance logs
tail -f /var/log/arctos/performance.log

# System logs
journalctl -u arctos-robot-controller -f
```

### Database Operations
```bash
# Database health
curl http://localhost:5000/api/database/health

# Connection pool status
curl http://localhost:5000/api/database/pool-status

# Recent queries (if enabled)
curl http://localhost:5000/api/database/slow-queries

# Database file check (SQLite)
ls -la /app/data/robot.db
```

### Performance Analysis
```bash
# CPU and memory trends
curl http://localhost:5000/api/monitoring/system

# API response times
curl http://localhost:5000/metrics | grep http_request_duration

# WebSocket metrics
curl http://localhost:5000/api/monitoring/websocket

# Hardware performance
curl http://localhost:5000/api/monitoring/hardware
```

---

## 📝 Documentation Requirements

### Incident Documentation
- **Incident Log**: Record all P1/P2 incidents in tracking system
- **Action Log**: Document all commands and actions taken
- **Communication Log**: Record all stakeholder communications
- **Resolution Summary**: Document final resolution and lessons learned

### Knowledge Base Updates
- Update runbooks based on new scenarios encountered
- Document new troubleshooting procedures discovered
- Add FAQ entries for common issues
- Update contact information and escalation procedures

### Metrics and Reporting
- Weekly on-call summary report
- Monthly incident trend analysis
- SLO compliance reporting
- Alert effectiveness assessment

---

## 🎓 On-Call Training and Resources

### Required Reading
- [SRE Service Level Objectives](../slo-definitions/service-level-objectives.md)
- [Incident Management Framework](../incident-procedures/incident-management-framework.md)
- [System Architecture Overview](../documentation/system-architecture.md)
- [Robot Safety Procedures](../documentation/robot-safety.md)

### Training Modules
1. **Incident Response Simulation**: Practice incident response scenarios
2. **Robot Safety Training**: Safety procedures and emergency responses
3. **Monitoring Tools**: Grafana, Prometheus, alerting systems
4. **Communication Skills**: Effective incident communication

### Useful Commands Cheatsheet
```bash
# Quick system overview
curl -s http://localhost:5000/api/monitoring/dashboard | jq '.'

# Emergency diagnostics bundle
./scripts/collect-diagnostics.sh

# Robot safety verification
./scripts/safety-check.sh

# Performance baseline test
./scripts/performance-baseline.sh
```

---

## 🔄 Continuous Improvement

### Post-Incident Actions
- Update runbooks based on incident learnings
- Review alert thresholds and effectiveness
- Identify automation opportunities
- Share knowledge with team

### Weekly Reviews
- Review incident patterns and trends
- Assess SLO compliance and error budget status
- Identify recurring issues for permanent fixes
- Update documentation and procedures

### Monthly Team Retrospectives
- On-call experience feedback
- Tool and process improvement suggestions
- Training needs assessment
- Runbook and documentation updates

---

**Document Version**: 1.0  
**Last Updated**: {{LAST_UPDATED}}  
**Next Review**: {{NEXT_REVIEW_DATE}}  
**Contact for Updates**: sre-team@company.com

*This handbook is a living document. Please contribute improvements based on your on-call experience.*