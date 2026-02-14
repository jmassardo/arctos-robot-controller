# Post-Mortem Template: Robotic Control System Incident
**Incident ID**: {{INCIDENT_ID}}  
**Date**: {{INCIDENT_DATE}}  
**Incident Commander**: {{INCIDENT_COMMANDER}}  
**Severity**: {{SEVERITY_LEVEL}}  
**Duration**: {{TOTAL_DURATION}}

---

## 📋 Executive Summary
*Brief, non-technical summary suitable for leadership and external stakeholders*

**What Happened**: {{BRIEF_DESCRIPTION}}  
**Impact**: {{USER_IMPACT_SUMMARY}}  
**Root Cause**: {{ROOT_CAUSE_SUMMARY}}  
**Resolution**: {{RESOLUTION_SUMMARY}}  
**Prevention**: {{PREVENTION_SUMMARY}}

---

## 🔍 Incident Details

### Timeline
*All times in {{TIMEZONE}}*

| Time | Event | Action Taken | Actor |
|------|-------|-------------|--------|
| {{TIME1}} | {{EVENT1}} | {{ACTION1}} | {{ACTOR1}} |
| {{TIME2}} | {{EVENT2}} | {{ACTION2}} | {{ACTOR2}} |
| {{TIME3}} | {{EVENT3}} | {{ACTION3}} | {{ACTOR3}} |

### Detection
- **Detection Method**: {{DETECTION_METHOD}}
- **Detection Time**: {{DETECTION_TIME}}
- **Time to Acknowledgment**: {{TIME_TO_ACK}}
- **Alerting Effectiveness**: {{ALERTING_ASSESSMENT}}

### Impact Assessment
- **Users Affected**: {{USERS_AFFECTED}}
- **Services Affected**: {{SERVICES_AFFECTED}}
- **Revenue Impact**: {{REVENUE_IMPACT}}
- **Safety Impact**: {{SAFETY_IMPACT}}
- **SLO Impact**: {{SLO_IMPACT}}

---

## 🔧 Technical Analysis

### Root Cause Analysis
*Use the "Five Whys" methodology*

1. **Why did the incident occur?**
   {{WHY_1}}

2. **Why did {{WHY_1}} happen?**
   {{WHY_2}}

3. **Why did {{WHY_2}} happen?**
   {{WHY_3}}

4. **Why did {{WHY_3}} happen?**
   {{WHY_4}}

5. **Why did {{WHY_4}} happen?**
   {{WHY_5}}

**Primary Root Cause**: {{PRIMARY_ROOT_CAUSE}}

### Contributing Factors
- {{CONTRIBUTING_FACTOR_1}}
- {{CONTRIBUTING_FACTOR_2}}
- {{CONTRIBUTING_FACTOR_3}}

### What Went Well
- {{POSITIVE_ASPECT_1}}
- {{POSITIVE_ASPECT_2}}
- {{POSITIVE_ASPECT_3}}

### What Went Poorly
- {{NEGATIVE_ASPECT_1}}
- {{NEGATIVE_ASPECT_2}}
- {{NEGATIVE_ASPECT_3}}

---

## 🤖 Robotic System Specific Analysis

### Hardware Safety Assessment
- **Robot Position During Incident**: {{ROBOT_POSITION}}
- **Emergency Stop Status**: {{EMERGENCY_STOP_STATUS}}
- **Hardware Damage Risk**: {{DAMAGE_RISK_ASSESSMENT}}
- **Safety Systems Performance**: {{SAFETY_SYSTEMS_PERFORMANCE}}

### Communication Protocol Analysis
- **Affected Protocols**: {{AFFECTED_PROTOCOLS}}
- **Protocol Error Rates**: 
  - Serial: {{SERIAL_ERROR_RATE}}
  - CAN Bus: {{CAN_ERROR_RATE}}
  - RS485: {{RS485_ERROR_RATE}}
  - Modbus: {{MODBUS_ERROR_RATE}}
- **Recovery Time by Protocol**: {{PROTOCOL_RECOVERY_TIMES}}

### Control System Impact
- **G-Code Execution Affected**: {{GCODE_IMPACT}}
- **Manual Control Affected**: {{MANUAL_CONTROL_IMPACT}}
- **Position Accuracy Impact**: {{POSITION_ACCURACY_IMPACT}}
- **Real-time Performance Impact**: {{REALTIME_IMPACT}}

---

## 📊 Metrics and Monitoring

### SLO/SLI Impact
- **Robot Command Success Rate**: {{COMMAND_SUCCESS_IMPACT}}
- **Hardware Communication Uptime**: {{COMMUNICATION_UPTIME_IMPACT}}
- **API Availability**: {{API_AVAILABILITY_IMPACT}}
- **WebSocket Stability**: {{WEBSOCKET_STABILITY_IMPACT}}

### Error Budget Consumption
- **Robot Control**: {{ROBOT_ERROR_BUDGET_CONSUMED}}
- **API Services**: {{API_ERROR_BUDGET_CONSUMED}}
- **Overall Budget Status**: {{OVERALL_BUDGET_STATUS}}

### Alert Effectiveness
- **Alerts Fired**: {{ALERTS_FIRED}}
- **False Positives**: {{FALSE_POSITIVES}}
- **Alert Fatigue Factor**: {{ALERT_FATIGUE}}
- **Detection Gap**: {{DETECTION_GAP}}

---

## 💡 Action Items

### Immediate Actions (0-24 hours)
| Action | Owner | Due Date | Status |
|--------|--------|----------|---------|
| {{ACTION_1}} | {{OWNER_1}} | {{DUE_1}} | {{STATUS_1}} |
| {{ACTION_2}} | {{OWNER_2}} | {{DUE_2}} | {{STATUS_2}} |

### Short-term Actions (1-4 weeks)
| Action | Owner | Due Date | Status |
|--------|--------|----------|---------|
| {{ACTION_3}} | {{OWNER_3}} | {{DUE_3}} | {{STATUS_3}} |
| {{ACTION_4}} | {{OWNER_4}} | {{DUE_4}} | {{STATUS_4}} |

### Long-term Actions (1-6 months)
| Action | Owner | Due Date | Status |
|--------|--------|----------|---------|
| {{ACTION_5}} | {{OWNER_5}} | {{DUE_5}} | {{STATUS_5}} |
| {{ACTION_6}} | {{OWNER_6}} | {{DUE_6}} | {{STATUS_6}} |

### Prevention Measures
- **Monitoring Improvements**: {{MONITORING_IMPROVEMENTS}}
- **Process Changes**: {{PROCESS_CHANGES}}
- **Technology Changes**: {{TECHNOLOGY_CHANGES}}
- **Training Requirements**: {{TRAINING_REQUIREMENTS}}

---

## 📚 Lessons Learned

### Technical Lessons
1. {{TECHNICAL_LESSON_1}}
2. {{TECHNICAL_LESSON_2}}
3. {{TECHNICAL_LESSON_3}}

### Process Lessons
1. {{PROCESS_LESSON_1}}
2. {{PROCESS_LESSON_2}}
3. {{PROCESS_LESSON_3}}

### Communication Lessons
1. {{COMMUNICATION_LESSON_1}}
2. {{COMMUNICATION_LESSON_2}}
3. {{COMMUNICATION_LESSON_3}}

### Safety and Robotic System Lessons
1. {{SAFETY_LESSON_1}}
2. {{ROBOTICS_LESSON_2}}
3. {{HARDWARE_LESSON_3}}

---

## 🔗 Supporting Evidence

### Log Excerpts
```
{{LOG_EXCERPT_1}}
```

### Monitoring Screenshots
- {{SCREENSHOT_1_DESCRIPTION}}: [Link to Screenshot]
- {{SCREENSHOT_2_DESCRIPTION}}: [Link to Screenshot]
- {{SCREENSHOT_3_DESCRIPTION}}: [Link to Screenshot]

### Configuration Changes
```diff
{{CONFIG_DIFF}}
```

### Related Incidents
- **Incident #{{RELATED_INCIDENT_1}}**: {{RELATED_DESCRIPTION_1}}
- **Incident #{{RELATED_INCIDENT_2}}**: {{RELATED_DESCRIPTION_2}}

---

## 👥 Stakeholder Communication

### Internal Communications
- **Engineering Team**: {{ENGINEERING_COMMUNICATION}}
- **Product Team**: {{PRODUCT_COMMUNICATION}}
- **Management**: {{MANAGEMENT_COMMUNICATION}}
- **Support Team**: {{SUPPORT_COMMUNICATION}}

### External Communications
- **Customer Communication**: {{CUSTOMER_COMMUNICATION}}
- **Status Page Updates**: {{STATUS_PAGE_UPDATES}}
- **Public Communication**: {{PUBLIC_COMMUNICATION}}

---

## 📈 Follow-up Actions

### Review Schedule
- **30-day Review**: {{30_DAY_REVIEW_DATE}}
- **90-day Review**: {{90_DAY_REVIEW_DATE}}
- **Action Item Tracking**: {{TRACKING_METHOD}}

### Knowledge Sharing
- **Team Presentation**: {{PRESENTATION_DATE}}
- **Runbook Updates**: {{RUNBOOK_UPDATES}}
- **Training Updates**: {{TRAINING_UPDATES}}
- **Documentation Updates**: {{DOCUMENTATION_UPDATES}}

---

## ✅ Sign-off

**Post-Mortem Facilitator**: {{FACILITATOR_NAME}} - {{FACILITATOR_DATE}}  
**Engineering Manager**: {{ENG_MANAGER_NAME}} - {{ENG_MANAGER_DATE}}  
**Incident Commander**: {{IC_NAME}} - {{IC_DATE}}  
**Product Manager**: {{PM_NAME}} - {{PM_DATE}}

---

## 📊 Metrics Summary

### Incident Response Metrics
- **Detection Time**: {{DETECTION_DURATION}}
- **Response Time**: {{RESPONSE_DURATION}}
- **Resolution Time**: {{RESOLUTION_DURATION}}
- **Communication Time**: {{COMMUNICATION_DURATION}}

### Business Impact Metrics
- **Customer Impact**: {{CUSTOMER_IMPACT_METRIC}}
- **Revenue Impact**: {{REVENUE_IMPACT_METRIC}}
- **Reputation Impact**: {{REPUTATION_IMPACT_METRIC}}

### Technical Impact Metrics
- **Systems Affected**: {{SYSTEMS_AFFECTED_COUNT}}
- **Data Loss**: {{DATA_LOSS_AMOUNT}}
- **Recovery Complexity**: {{RECOVERY_COMPLEXITY_SCORE}}

---

**Document Version**: {{VERSION}}  
**Last Updated**: {{LAST_UPDATED}}  
**Next Review Date**: {{NEXT_REVIEW_DATE}}

*This post-mortem follows the blameless post-mortem culture focused on learning and improving system reliability.*