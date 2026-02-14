/**
 * Real-time System Monitoring Service
 * Collects hardware health, performance metrics, and execution statistics
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class SystemMonitor {
  constructor(database = null, io = null) {
    this.database = database;
    this.io = io;
    this.metrics = {
      system: {
        uptime: 0,
        cpu: { usage: 0, cores: 0 },
        memory: { total: 0, used: 0, available: 0, usage_percent: 0 },
        disk: { total: 0, used: 0, available: 0, usage_percent: 0 },
        network: { bytes_sent: 0, bytes_received: 0 },
        load: { 1: 0, 5: 0, 15: 0 },
      },
      robot: {
        connection_status: 'disconnected',
        last_command: null,
        current_position: { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 },
        target_position: { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 },
        execution_state: 'idle', // idle, executing, paused, stopped, error
        temperature: { motors: [], controllers: [] },
        errors: [],
        warnings: [],
      },
      execution: {
        total_executions: 0,
        successful_executions: 0,
        failed_executions: 0,
        average_execution_time: 0,
        current_execution: null,
        recent_executions: [],
      },
      realtime: {
        connected_clients: 0,
        active_sessions: 0,
        message_rate: 0,
        last_updated: new Date(),
      },
    };

    this.history = {
      cpu: [],
      memory: [],
      disk: [],
      executions: [],
      errors: [],
    };

    this.maxHistoryLength = 100;
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.database = database;

    // CPU usage tracking
    this.cpuUsage = null;
    this.lastCpuInfo = null;
  }

  /**
   * Initialize monitoring service
   */
  async initialize() {
    try {
      // Database connection is passed in constructor, so just log initialization
      logger.info('System monitoring service initialized');
      return true;
    } catch (error) {
      logger.error('Failed to initialize monitoring service:', error);
      throw error;
    }
  }

  /**
   * Start monitoring system metrics
   */
  startMonitoring(interval = 5000) {
    if (this.isMonitoring) {
      logger.warn('Monitoring already active');
      return;
    }

    this.isMonitoring = true;

    // Initial metrics collection
    this.collectMetrics();

    // Start periodic collection
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, interval);

    logger.info(`System monitoring started with ${interval}ms interval`);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.info('System monitoring stopped');
  }

  /**
   * Collect all system metrics
   */
  async collectMetrics() {
    try {
      await Promise.all([
        this.collectSystemMetrics(),
        this.collectRobotMetrics(),
        this.collectExecutionMetrics(),
        this.collectRealtimeMetrics(),
      ]);

      this.updateHistory();
      this.metrics.realtime.last_updated = new Date();

      // Emit metrics to connected clients
      if (global.io) {
        global.io.emit('metrics-update', this.getMetrics());
      }
    } catch (error) {
      logger.error('Error collecting metrics:', error);
    }
  }

  /**
   * Collect system-level metrics
   */
  async collectSystemMetrics() {
    // System uptime
    this.metrics.system.uptime = os.uptime();

    // CPU information
    const cpus = os.cpus();
    this.metrics.system.cpu.cores = cpus.length;

    // Calculate CPU usage
    const currentCpuInfo = this.getCpuInfo();
    if (this.lastCpuInfo) {
      this.metrics.system.cpu.usage = this.calculateCpuUsage(this.lastCpuInfo, currentCpuInfo);
    }
    this.lastCpuInfo = currentCpuInfo;

    // Memory information
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    this.metrics.system.memory = {
      total: Math.round(totalMem / 1024 / 1024), // MB
      used: Math.round(usedMem / 1024 / 1024), // MB
      available: Math.round(freeMem / 1024 / 1024), // MB
      usage_percent: Math.round((usedMem / totalMem) * 100),
    };

    // Load averages (Unix-like systems)
    if (os.platform() !== 'win32') {
      const loadavg = os.loadavg();
      this.metrics.system.load = {
        1: Math.round(loadavg[0] * 100) / 100,
        5: Math.round(loadavg[1] * 100) / 100,
        15: Math.round(loadavg[2] * 100) / 100,
      };
    }

    // Disk usage (simplified - would need platform-specific implementation for accuracy)
    try {
      const stats = await fs.promises.statSync(process.cwd());
      // This is a placeholder - real disk usage would require platform-specific tools
      this.metrics.system.disk = {
        total: 1000000, // 1TB placeholder
        used: 500000, // 500GB placeholder
        available: 500000,
        usage_percent: 50,
      };
    } catch (error) {
      // Ignore disk stats errors
    }
  }

  /**
   * Get current CPU info for usage calculation
   */
  getCpuInfo() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    return { totalIdle, totalTick };
  }

  /**
   * Calculate CPU usage percentage
   */
  calculateCpuUsage(startInfo, endInfo) {
    const idleDifference = endInfo.totalIdle - startInfo.totalIdle;
    const totalDifference = endInfo.totalTick - startInfo.totalTick;

    const usage = 100 - Math.round((100 * idleDifference) / totalDifference);
    return Math.max(0, Math.min(100, usage));
  }

  /**
   * Collect robot-specific metrics
   */
  async collectRobotMetrics() {
    // This would integrate with actual robot hardware
    // For now, we'll use placeholder data that could be updated by robot controllers

    // Connection status would come from hardware communication
    // this.metrics.robot.connection_status = await this.checkRobotConnection();

    // Temperature data would come from sensors
    // this.metrics.robot.temperature = await this.getRobotTemperatures();

    // Position data would come from encoders/controllers
    // this.metrics.robot.current_position = await this.getCurrentPosition();

    // For demo purposes, simulate some data
    if (this.metrics.robot.connection_status === 'disconnected') {
      // Simulate connected robot with some basic data
      this.metrics.robot.connection_status = 'connected';
      this.metrics.robot.temperature.motors = [
        { id: 'motor1', temp: 35 + Math.random() * 10 },
        { id: 'motor2', temp: 32 + Math.random() * 10 },
        { id: 'motor3', temp: 38 + Math.random() * 10 },
      ];
      this.metrics.robot.temperature.controllers = [
        { id: 'controller1', temp: 40 + Math.random() * 5 },
      ];
    }
  }

  /**
   * Get execution statistics from database
   */
  async getExecutionStats() {
    try {
      // If no database connection, return default stats
      if (!this.database) {
        return {
          total_executions: 0,
          successful_executions: 0,
          failed_executions: 0,
          average_execution_time: 0,
          current_execution: null,
          recent_executions: [],
        };
      }

      // Get total execution statistics
      const [totalResult] = await this.database.sequelize.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          AVG(CASE WHEN duration IS NOT NULL THEN duration ELSE NULL END) as avg_duration
        FROM execution_history
      `);

      if (totalResult.length > 0) {
        const stats = totalResult[0];
        this.metrics.execution.total_executions = parseInt(stats.total) || 0;
        this.metrics.execution.successful_executions = parseInt(stats.successful) || 0;
        this.metrics.execution.failed_executions = parseInt(stats.failed) || 0;
        this.metrics.execution.average_execution_time = Math.round(
          parseFloat(stats.avg_duration) || 0
        );
      }

      // Get recent executions
      const recentExecutions = await this.database.ExecutionHistory.findAll({
        limit: 10,
        order: [['started_at', 'DESC']],
        attributes: [
          'id',
          'execution_type',
          'status',
          'started_at',
          'completed_at',
          'duration',
          'progress',
        ],
      });

      this.metrics.execution.recent_executions = recentExecutions.map(exec => ({
        id: exec.id,
        type: exec.execution_type,
        status: exec.status,
        started_at: exec.started_at,
        completed_at: exec.completed_at,
        duration: exec.duration,
        progress: exec.progress,
      }));

      // Check for current execution
      const currentExecution = await this.database.ExecutionHistory.findOne({
        where: {
          status: ['started', 'paused'],
        },
        order: [['started_at', 'DESC']],
        attributes: [
          'id',
          'execution_type',
          'status',
          'started_at',
          'progress',
          'lines_executed',
          'total_lines',
        ],
      });

      this.metrics.execution.current_execution = currentExecution
        ? {
            id: currentExecution.id,
            type: currentExecution.execution_type,
            status: currentExecution.status,
            started_at: currentExecution.started_at,
            progress: currentExecution.progress,
            lines_executed: currentExecution.lines_executed,
            total_lines: currentExecution.total_lines,
          }
        : null;
    } catch (error) {
      logger.error('Error collecting execution metrics:', error);
    }
  }

  /**
   * Collect real-time connection metrics
   */
  collectRealtimeMetrics() {
    if (global.io) {
      // Count connected clients
      this.metrics.realtime.connected_clients = global.io.engine.clientsCount || 0;

      // This would be updated by session middleware
      this.metrics.realtime.active_sessions = global.activeSessions || 0;

      // Message rate would be tracked by Socket.IO middleware
      this.metrics.realtime.message_rate = global.messageRate || 0;
    }
  }

  /**
   * Update historical data arrays
   */
  updateHistory() {
    const timestamp = new Date();

    // CPU history
    this.addToHistory('cpu', {
      timestamp,
      usage: this.metrics.system.cpu.usage,
      cores: this.metrics.system.cpu.cores,
    });

    // Memory history
    this.addToHistory('memory', {
      timestamp,
      usage_percent: this.metrics.system.memory.usage_percent,
      used: this.metrics.system.memory.used,
      total: this.metrics.system.memory.total,
    });

    // Disk history
    this.addToHistory('disk', {
      timestamp,
      usage_percent: this.metrics.system.disk.usage_percent,
      used: this.metrics.system.disk.used,
      total: this.metrics.system.disk.total,
    });
  }

  /**
   * Add data point to history array
   */
  addToHistory(type, data) {
    if (!this.history[type]) {
      this.history[type] = [];
    }

    this.history[type].push(data);

    // Keep only recent data
    if (this.history[type].length > this.maxHistoryLength) {
      this.history[type].shift();
    }
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      history: this.history,
    };
  }

  /**
   * Get system health status
   */
  getHealthStatus() {
    const health = {
      status: 'healthy',
      issues: [],
      warnings: [],
      score: 100,
    };

    // Check CPU usage
    if (this.metrics.system.cpu.usage > 90) {
      health.issues.push('High CPU usage detected');
      health.score -= 20;
    } else if (this.metrics.system.cpu.usage > 75) {
      health.warnings.push('Elevated CPU usage');
      health.score -= 10;
    }

    // Check memory usage
    if (this.metrics.system.memory.usage_percent > 90) {
      health.issues.push('High memory usage detected');
      health.score -= 20;
    } else if (this.metrics.system.memory.usage_percent > 75) {
      health.warnings.push('Elevated memory usage');
      health.score -= 10;
    }

    // Check disk usage
    if (this.metrics.system.disk.usage_percent > 95) {
      health.issues.push('Disk space critically low');
      health.score -= 30;
    } else if (this.metrics.system.disk.usage_percent > 85) {
      health.warnings.push('Disk space running low');
      health.score -= 15;
    }

    // Check robot connection
    if (this.metrics.robot.connection_status === 'disconnected') {
      health.issues.push('Robot disconnected');
      health.score -= 25;
    }

    // Check for robot errors
    if (this.metrics.robot.errors.length > 0) {
      health.issues.push(`${this.metrics.robot.errors.length} robot errors detected`);
      health.score -= Math.min(30, this.metrics.robot.errors.length * 5);
    }

    // Determine overall status
    if (health.score < 50) {
      health.status = 'critical';
    } else if (health.score < 75) {
      health.status = 'warning';
    } else if (health.score < 95) {
      health.status = 'good';
    }

    return health;
  }

  /**
   * Update robot status (called by robot controllers)
   */
  updateRobotStatus(status) {
    this.metrics.robot = {
      ...this.metrics.robot,
      ...status,
    };
  }

  /**
   * Add robot error
   */
  addRobotError(error) {
    this.metrics.robot.errors.push({
      timestamp: new Date(),
      message: error.message,
      code: error.code,
      severity: error.severity || 'error',
    });

    // Keep only recent errors
    if (this.metrics.robot.errors.length > 50) {
      this.metrics.robot.errors.shift();
    }
  }

  /**
   * Clear robot errors
   */
  clearRobotErrors() {
    this.metrics.robot.errors = [];
  }

  /**
   * Get alerts based on current metrics
   */
  getAlerts() {
    const alerts = [];
    const now = new Date();

    // System alerts
    if (this.metrics.system.cpu.usage > 90) {
      alerts.push({
        id: 'high-cpu',
        type: 'error',
        title: 'High CPU Usage',
        message: `CPU usage is at ${this.metrics.system.cpu.usage}%`,
        timestamp: now,
      });
    }

    if (this.metrics.system.memory.usage_percent > 90) {
      alerts.push({
        id: 'high-memory',
        type: 'error',
        title: 'High Memory Usage',
        message: `Memory usage is at ${this.metrics.system.memory.usage_percent}%`,
        timestamp: now,
      });
    }

    // Robot alerts
    if (this.metrics.robot.connection_status === 'disconnected') {
      alerts.push({
        id: 'robot-disconnected',
        type: 'error',
        title: 'Robot Disconnected',
        message: 'Lost connection to robot controller',
        timestamp: now,
      });
    }

    // Temperature alerts
    this.metrics.robot.temperature.motors.forEach((motor, index) => {
      if (motor.temp > 80) {
        alerts.push({
          id: `motor-temp-${index}`,
          type: 'warning',
          title: 'High Motor Temperature',
          message: `Motor ${motor.id} temperature: ${motor.temp}°C`,
          timestamp: now,
        });
      }
    });

    return alerts;
  }
}

// Create singleton instance
let monitorInstance = null;

function getMonitorInstance(database = null, io = null) {
  if (!monitorInstance) {
    monitorInstance = new SystemMonitor(database, io);
  }
  return monitorInstance;
}

module.exports = {
  SystemMonitor,
  getMonitorInstance,
};
