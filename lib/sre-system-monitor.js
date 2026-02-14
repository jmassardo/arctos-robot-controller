/**
 * SRE Enhanced System Monitor
 * Extends the existing SystemMonitor with SLO/SLI tracking and advanced metrics
 */

const EventEmitter = require('events');
const { logger } = require('./logger');

class SRESystemMonitor extends EventEmitter {
  constructor(database = null, io = null, originalMonitor = null) {
    super();
    this.database = database;
    this.io = io;
    this.originalMonitor = originalMonitor;

    // SLO/SLI tracking
    this.sloMetrics = {
      robot_control: {
        command_success_rate: { target: 99.0, current: 100, error_budget: 1.0 },
        command_latency_p95: { target: 100, current: 0 }, // milliseconds
        command_latency_p99: { target: 200, current: 0 },
        position_accuracy: { target: 99.5, current: 100 }
      },
      hardware_communication: {
        uptime_percent: { target: 99.5, current: 100, error_budget: 0.5 },
        serial_latency_p95: { target: 10, current: 0 },
        can_latency_p95: { target: 5, current: 0 },
        rs485_latency_p95: { target: 15, current: 0 },
        modbus_latency_p95: { target: 20, current: 0 },
        tcp_latency_p95: { target: 50, current: 0 }
      },
      web_application: {
        api_availability: { target: 99.9, current: 100, error_budget: 0.1 },
        control_api_latency_p95: { target: 100, current: 0 },
        config_api_latency_p95: { target: 500, current: 0 },
        export_api_latency_p95: { target: 2000, current: 0 }
      },
      websocket_communication: {
        connection_stability: { target: 95.0, current: 100, error_budget: 5.0 },
        position_update_latency_p95: { target: 50, current: 0 },
        status_update_latency_p95: { target: 100, current: 0 },
        message_delivery_success: { target: 99.5, current: 100, error_budget: 0.5 }
      },
      security_safety: {
        auth_success_rate: { target: 99.5, current: 100, error_budget: 0.5 },
        security_response_time: { target: 30, current: 0 }, // seconds
        data_consistency: { target: 100, current: 100, error_budget: 0 },
        backup_success_rate: { target: 99.9, current: 100, error_budget: 0.1 }
      },
      user_experience: {
        page_load_time_p75: { target: 3000, current: 0 }, // milliseconds
        ui_response_time_p95: { target: 100, current: 0 },
        first_contentful_paint_p75: { target: 1500, current: 0 },
        largest_contentful_paint_p75: { target: 2500, current: 0 }
      }
    };

    // Advanced metrics tracking
    this.advancedMetrics = {
      robot_operations: {
        total_commands: 0,
        successful_commands: 0,
        failed_commands: 0,
        command_latencies: [],
        position_deviations: [],
        emergency_stops: 0,
        safety_violations: 0
      },
      hardware_protocols: {
        serial: { requests: 0, responses: 0, errors: 0, latencies: [] },
        can: { requests: 0, responses: 0, errors: 0, latencies: [] },
        rs485: { requests: 0, responses: 0, errors: 0, latencies: [] },
        modbus: { requests: 0, responses: 0, errors: 0, latencies: [] },
        tcp: { requests: 0, responses: 0, errors: 0, latencies: [] }
      },
      api_performance: {
        endpoints: new Map(),
        response_times: [],
        error_rates: new Map(),
        throughput: { requests_per_second: 0, peak_rps: 0 }
      },
      websocket_metrics: {
        total_connections: 0,
        active_connections: 0,
        stable_connections: 0,
        message_counts: { sent: 0, delivered: 0, failed: 0 },
        update_latencies: { position: [], status: [], config: [] }
      },
      business_metrics: {
        active_users: 0,
        gcode_executions: { total: 0, successful: 0, failed: 0 },
        positions_saved: 0,
        configurations_changed: 0,
        uptime_percentage: 100
      }
    };

    // Error budget tracking
    this.errorBudgets = {
      robot_control: { allocated: 1.0, consumed: 0, remaining: 1.0 },
      hardware_communication: { allocated: 0.5, consumed: 0, remaining: 0.5 },
      api_availability: { allocated: 0.1, consumed: 0, remaining: 0.1 },
      websocket_stability: { allocated: 5.0, consumed: 0, remaining: 5.0 }
    };

    // Alert thresholds and state
    this.alertThresholds = {
      error_budget_warning: 50, // 50% consumption
      error_budget_critical: 75, // 75% consumption
      error_budget_emergency: 90, // 90% consumption
      latency_spike_threshold: 2.0, // 2x normal latency
      error_rate_spike_threshold: 5.0 // 5x normal error rate
    };

    this.alertState = new Map();
    this.isMonitoring = false;
    this.monitoringInterval = null;
  }

  /**
   * Initialize SRE monitoring with enhanced capabilities
   */
  async initialize() {
    try {
      // Initialize base monitoring if original monitor exists
      if (this.originalMonitor) {
        await this.originalMonitor.initialize();
      }

      // Set up SRE-specific monitoring
      await this.setupSLOTracking();
      await this.setupErrorBudgetTracking();
      await this.setupAdvancedAlerting();

      logger.info('SRE Enhanced System Monitor initialized');
      return true;
    } catch (error) {
      logger.error('Failed to initialize SRE monitoring:', error);
      throw error;
    }
  }

  /**
   * Start enhanced monitoring with SLO tracking
   */
  startMonitoring(interval = 5000) {
    if (this.isMonitoring) {
      logger.warn('SRE monitoring already active');
      return;
    }

    this.isMonitoring = true;

    // Start base monitoring
    if (this.originalMonitor && !this.originalMonitor.isMonitoring) {
      this.originalMonitor.startMonitoring(interval);
    }

    // Start SRE-specific monitoring
    this.monitoringInterval = setInterval(() => {
      this.collectSREMetrics();
    }, interval);

    // Start error budget calculation (every minute)
    this.errorBudgetInterval = setInterval(() => {
      this.calculateErrorBudgets();
    }, 60000);

    // Start SLO compliance checking (every 30 seconds)
    this.sloCheckInterval = setInterval(() => {
      this.checkSLOCompliance();
    }, 30000);

    logger.info('SRE Enhanced monitoring started', { interval });
  }

  /**
   * Collect SRE-specific metrics and update SLIs
   */
  async collectSREMetrics() {
    try {
      // Collect robot control metrics
      await this.collectRobotControlMetrics();

      // Collect hardware communication metrics
      await this.collectHardwareMetrics();

      // Collect API performance metrics
      await this.collectAPIMetrics();

      // Collect WebSocket metrics
      await this.collectWebSocketMetrics();

      // Collect user experience metrics
      await this.collectUserExperienceMetrics();

      // Update SLO calculations
      this.updateSLOMetrics();

      // Emit metrics update event
      this.emit('sre-metrics-updated', {
        timestamp: new Date(),
        slo_metrics: this.sloMetrics,
        advanced_metrics: this.advancedMetrics,
        error_budgets: this.errorBudgets
      });

    } catch (error) {
      logger.error('Error collecting SRE metrics:', error);
    }
  }

  /**
   * Record robot command execution for SLO tracking
   */
  recordRobotCommand(commandData) {
    const { success, latency, positionDeviation, commandType } = commandData;
    
    // Update counters
    this.advancedMetrics.robot_operations.total_commands++;
    
    if (success) {
      this.advancedMetrics.robot_operations.successful_commands++;
    } else {
      this.advancedMetrics.robot_operations.failed_commands++;
      logger.warn('Robot command failed', { commandType, latency });
    }

    // Track latency (keep last 1000 measurements for percentile calculations)
    this.advancedMetrics.robot_operations.command_latencies.push(latency);
    if (this.advancedMetrics.robot_operations.command_latencies.length > 1000) {
      this.advancedMetrics.robot_operations.command_latencies.shift();
    }

    // Track position deviation if provided
    if (positionDeviation !== undefined) {
      this.advancedMetrics.robot_operations.position_deviations.push(positionDeviation);
      if (this.advancedMetrics.robot_operations.position_deviations.length > 1000) {
        this.advancedMetrics.robot_operations.position_deviations.shift();
      }
    }

    // Check for immediate SLO violations
    this.checkImmediateSLOViolation('robot_control', { success, latency });
  }

  /**
   * Record hardware protocol communication
   */
  recordHardwareProtocolMetrics(protocol, requestData) {
    const { success, latency, error } = requestData;
    
    if (!this.advancedMetrics.hardware_protocols[protocol]) {
      this.advancedMetrics.hardware_protocols[protocol] = {
        requests: 0, responses: 0, errors: 0, latencies: []
      };
    }

    const protocolMetrics = this.advancedMetrics.hardware_protocols[protocol];
    
    protocolMetrics.requests++;
    
    if (success) {
      protocolMetrics.responses++;
    } else {
      protocolMetrics.errors++;
      logger.warn(`Hardware ${protocol} protocol error`, { error, latency });
    }

    // Track latency
    protocolMetrics.latencies.push(latency);
    if (protocolMetrics.latencies.length > 500) {
      protocolMetrics.latencies.shift();
    }
  }

  /**
   * Record API endpoint performance
   */
  recordAPIMetrics(endpoint, requestData) {
    const { method, statusCode, responseTime, path } = requestData;
    const endpointKey = `${method} ${path}`;
    
    // Initialize endpoint metrics if not exists
    if (!this.advancedMetrics.api_performance.endpoints.has(endpointKey)) {
      this.advancedMetrics.api_performance.endpoints.set(endpointKey, {
        requests: 0,
        successful_requests: 0,
        failed_requests: 0,
        response_times: [],
        error_rate: 0
      });
    }

    const endpointMetrics = this.advancedMetrics.api_performance.endpoints.get(endpointKey);
    
    endpointMetrics.requests++;
    
    if (statusCode >= 200 && statusCode < 400) {
      endpointMetrics.successful_requests++;
    } else {
      endpointMetrics.failed_requests++;
    }

    // Track response time
    endpointMetrics.response_times.push(responseTime);
    if (endpointMetrics.response_times.length > 1000) {
      endpointMetrics.response_times.shift();
    }

    // Update error rate
    endpointMetrics.error_rate = (endpointMetrics.failed_requests / endpointMetrics.requests) * 100;

    // Track overall API response times
    this.advancedMetrics.api_performance.response_times.push(responseTime);
    if (this.advancedMetrics.api_performance.response_times.length > 1000) {
      this.advancedMetrics.api_performance.response_times.shift();
    }
  }

  /**
   * Record WebSocket communication metrics
   */
  recordWebSocketMetrics(eventData) {
    const { event, latency, success, connectionId, messageType } = eventData;
    
    switch (event) {
      case 'connection_established':
        this.advancedMetrics.websocket_metrics.total_connections++;
        this.advancedMetrics.websocket_metrics.active_connections++;
        break;
        
      case 'connection_closed':
        this.advancedMetrics.websocket_metrics.active_connections--;
        break;
        
      case 'message_sent':
        this.advancedMetrics.websocket_metrics.message_counts.sent++;
        break;
        
      case 'message_delivered':
        this.advancedMetrics.websocket_metrics.message_counts.delivered++;
        
        // Track update latencies by type
        if (messageType && latency) {
          const updateLatencies = this.advancedMetrics.websocket_metrics.update_latencies;
          if (updateLatencies[messageType]) {
            updateLatencies[messageType].push(latency);
            if (updateLatencies[messageType].length > 500) {
              updateLatencies[messageType].shift();
            }
          }
        }
        break;
        
      case 'message_failed':
        this.advancedMetrics.websocket_metrics.message_counts.failed++;
        break;
    }
  }

  /**
   * Calculate percentiles from array of values
   */
  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Update SLO metric calculations
   */
  updateSLOMetrics() {
    // Robot Control SLOs
    const robotOps = this.advancedMetrics.robot_operations;
    if (robotOps.total_commands > 0) {
      this.sloMetrics.robot_control.command_success_rate.current = 
        (robotOps.successful_commands / robotOps.total_commands) * 100;
    }
    
    if (robotOps.command_latencies.length > 0) {
      this.sloMetrics.robot_control.command_latency_p95.current = 
        this.calculatePercentile(robotOps.command_latencies, 95);
      this.sloMetrics.robot_control.command_latency_p99.current = 
        this.calculatePercentile(robotOps.command_latencies, 99);
    }

    // Hardware Communication SLOs
    Object.keys(this.advancedMetrics.hardware_protocols).forEach(protocol => {
      const protocolData = this.advancedMetrics.hardware_protocols[protocol];
      if (protocolData.latencies.length > 0) {
        const sloKey = `${protocol}_latency_p95`;
        if (this.sloMetrics.hardware_communication[sloKey]) {
          this.sloMetrics.hardware_communication[sloKey].current = 
            this.calculatePercentile(protocolData.latencies, 95);
        }
      }
    });

    // API Performance SLOs
    if (this.advancedMetrics.api_performance.response_times.length > 0) {
      // Calculate overall API success rate
      let totalRequests = 0;
      let successfulRequests = 0;
      
      this.advancedMetrics.api_performance.endpoints.forEach(endpoint => {
        totalRequests += endpoint.requests;
        successfulRequests += endpoint.successful_requests;
      });
      
      if (totalRequests > 0) {
        this.sloMetrics.web_application.api_availability.current = 
          (successfulRequests / totalRequests) * 100;
      }
    }

    // WebSocket Communication SLOs
    const wsMetrics = this.advancedMetrics.websocket_metrics;
    if (wsMetrics.message_counts.sent > 0) {
      this.sloMetrics.websocket_communication.message_delivery_success.current = 
        (wsMetrics.message_counts.delivered / wsMetrics.message_counts.sent) * 100;
    }
  }

  /**
   * Calculate error budgets based on SLO performance
   */
  calculateErrorBudgets() {
    // Robot Control Error Budget
    const robotSLO = this.sloMetrics.robot_control.command_success_rate;
    const robotErrorRate = 100 - robotSLO.current;
    const robotBudget = this.errorBudgets.robot_control;
    robotBudget.consumed = (robotErrorRate / robotBudget.allocated) * 100;
    robotBudget.remaining = Math.max(0, robotBudget.allocated - robotErrorRate);

    // API Availability Error Budget
    const apiSLO = this.sloMetrics.web_application.api_availability;
    const apiErrorRate = 100 - apiSLO.current;
    const apiBudget = this.errorBudgets.api_availability;
    apiBudget.consumed = (apiErrorRate / apiBudget.allocated) * 100;
    apiBudget.remaining = Math.max(0, apiBudget.allocated - apiErrorRate);

    // Check for error budget alerts
    this.checkErrorBudgetAlerts();
  }

  /**
   * Check for error budget consumption alerts
   */
  checkErrorBudgetAlerts() {
    Object.keys(this.errorBudgets).forEach(service => {
      const budget = this.errorBudgets[service];
      const consumption = budget.consumed;
      
      if (consumption > this.alertThresholds.error_budget_emergency) {
        this.emitAlert('error_budget_emergency', {
          service,
          consumption,
          message: `Error budget for ${service} is ${consumption.toFixed(1)}% consumed`
        });
      } else if (consumption > this.alertThresholds.error_budget_critical) {
        this.emitAlert('error_budget_critical', {
          service,
          consumption,
          message: `Error budget for ${service} is ${consumption.toFixed(1)}% consumed`
        });
      } else if (consumption > this.alertThresholds.error_budget_warning) {
        this.emitAlert('error_budget_warning', {
          service,
          consumption,
          message: `Error budget for ${service} is ${consumption.toFixed(1)}% consumed`
        });
      }
    });
  }

  /**
   * Emit alert with deduplication
   */
  emitAlert(alertType, alertData) {
    const alertKey = `${alertType}_${alertData.service}`;
    const now = Date.now();
    const lastAlert = this.alertState.get(alertKey);
    
    // Deduplicate alerts (minimum 5 minutes between same alerts)
    if (!lastAlert || (now - lastAlert) > 300000) {
      this.alertState.set(alertKey, now);
      
      logger.error(`SRE Alert: ${alertType}`, alertData);
      
      // Emit to monitoring system
      this.emit('sre-alert', {
        type: alertType,
        timestamp: new Date(),
        ...alertData
      });
      
      // Send to external alerting if configured
      if (this.io) {
        this.io.emit('sre_alert', {
          type: alertType,
          timestamp: new Date(),
          ...alertData
        });
      }
    }
  }

  /**
   * Get current SRE metrics summary
   */
  getSREMetrics() {
    return {
      slo_metrics: this.sloMetrics,
      advanced_metrics: this.advancedMetrics,
      error_budgets: this.errorBudgets,
      alert_state: Object.fromEntries(this.alertState),
      last_updated: new Date()
    };
  }

  /**
   * Get SLO compliance report
   */
  getSLOComplianceReport() {
    const report = {
      overall_compliance: true,
      services: {},
      recommendations: [],
      timestamp: new Date()
    };

    Object.keys(this.sloMetrics).forEach(service => {
      const serviceMetrics = this.sloMetrics[service];
      const serviceReport = { compliant: true, violations: [] };

      Object.keys(serviceMetrics).forEach(metric => {
        const metricData = serviceMetrics[metric];
        if (metricData.target && metricData.current !== undefined) {
          // Determine if metric is compliant (depends on metric type)
          let compliant = true;
          if (metric.includes('success_rate') || metric.includes('availability') || metric.includes('accuracy')) {
            compliant = metricData.current >= metricData.target;
          } else if (metric.includes('latency') || metric.includes('time')) {
            compliant = metricData.current <= metricData.target;
          }

          if (!compliant) {
            serviceReport.compliant = false;
            serviceReport.violations.push({
              metric,
              target: metricData.target,
              current: metricData.current,
              deviation: metricData.current - metricData.target
            });
          }
        }
      });

      report.services[service] = serviceReport;
      if (!serviceReport.compliant) {
        report.overall_compliance = false;
      }
    });

    return report;
  }

  /**
   * Stop SRE monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.errorBudgetInterval) {
      clearInterval(this.errorBudgetInterval);
      this.errorBudgetInterval = null;
    }
    
    if (this.sloCheckInterval) {
      clearInterval(this.sloCheckInterval);
      this.sloCheckInterval = null;
    }

    // Stop base monitoring
    if (this.originalMonitor && this.originalMonitor.isMonitoring) {
      this.originalMonitor.stopMonitoring();
    }

    logger.info('SRE Enhanced monitoring stopped');
  }

  // Additional helper methods for setup
  async setupSLOTracking() {
    logger.info('Setting up SLO tracking');
    // Implementation for SLO tracking setup
  }

  async setupErrorBudgetTracking() {
    logger.info('Setting up error budget tracking');
    // Implementation for error budget tracking
  }

  async setupAdvancedAlerting() {
    logger.info('Setting up advanced alerting');
    // Implementation for advanced alerting
  }

  checkSLOCompliance() {
    const report = this.getSLOComplianceReport();
    if (!report.overall_compliance) {
      logger.warn('SLO compliance violations detected', { violations: report.services });
    }
  }

  checkImmediateSLOViolation(service, data) {
    // Implementation for immediate SLO violation checking
    // This would trigger immediate alerts for safety-critical violations
  }
}

module.exports = { SRESystemMonitor };