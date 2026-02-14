/**
 * Temperature Manager
 * Central management for temperature monitoring across all motors
 */

const { EventEmitter } = require('events');
const { logger } = require('./logger');

/**
 * Temperature Manager Class
 */
class TemperatureManager extends EventEmitter {
  constructor(databaseManager = null, socketIO = null) {
    super();
    
    this.databaseManager = databaseManager;
    this.socketIO = socketIO;
    this.monitors = new Map(); // motorId -> monitor instance
    this.alertThresholds = new Map(); // motorId -> thresholds
    this.historicalData = new Map(); // motorId -> temperature history
    this.activeAlerts = new Map(); // motorId -> alert info
    
    // Default thresholds
    this.defaultThresholds = {
      warning: 60,
      critical: 75,
      emergency: 85
    };

    this.maxHistorySize = 1000; // Keep last 1000 readings per motor
    this.isInitialized = false;
  }

  /**
   * Initialize the temperature manager
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load thresholds from database
      await this._loadThresholds();
      
      // Load recent historical data
      await this._loadHistoricalData();

      this.isInitialized = true;
      logger.info('Temperature Manager initialized successfully');
      
      this.emit('manager:initialized');
      
    } catch (error) {
      logger.error('Failed to initialize Temperature Manager:', error);
      throw error;
    }
  }

  /**
   * Add a temperature monitor for a motor
   */
  addMonitor(motorId, monitor) {
    if (this.monitors.has(motorId)) {
      this.removeMonitor(motorId);
    }

    this.monitors.set(motorId, monitor);
    
    // Set up event listeners
    monitor.on('temperature:update', (data) => {
      this._handleTemperatureUpdate(data);
    });

    monitor.on('temperature:alert', (data) => {
      this._handleTemperatureAlert(data);
    });

    monitor.on('error', (data) => {
      this._handleMonitorError(data);
    });

    // Initialize historical data tracking
    if (!this.historicalData.has(motorId)) {
      this.historicalData.set(motorId, []);
    }

    // Load motor-specific thresholds
    const thresholds = this.alertThresholds.get(motorId) || this.defaultThresholds;
    monitor.updateThresholds(thresholds);

    logger.info(`Temperature monitor added for motor ${motorId}`);
    this.emit('monitor:added', { motorId });
  }

  /**
   * Remove a temperature monitor
   */
  removeMonitor(motorId) {
    const monitor = this.monitors.get(motorId);
    if (monitor) {
      monitor.stopMonitoring();
      monitor.removeAllListeners();
      this.monitors.delete(motorId);
      
      logger.info(`Temperature monitor removed for motor ${motorId}`);
      this.emit('monitor:removed', { motorId });
    }
  }

  /**
   * Start monitoring all registered motors
   */
  startMonitoring() {
    const motorIds = Array.from(this.monitors.keys());
    
    this.monitors.forEach((monitor, motorId) => {
      monitor.startMonitoring([motorId]);
    });

    logger.info('Temperature monitoring started for all motors');
    this.emit('monitoring:started', { motorIds });
  }

  /**
   * Stop monitoring all motors
   */
  stopMonitoring() {
    this.monitors.forEach((monitor) => {
      monitor.stopMonitoring();
    });

    logger.info('Temperature monitoring stopped for all motors');
    this.emit('monitoring:stopped');
  }

  /**
   * Process a temperature reading
   */
  async processReading(motorId, temperature, timestamp = new Date(), tempType = 'motor') {
    try {
      const reading = {
        motorId,
        temperature,
        timestamp,
        tempType,
        alertLevel: this._determineAlertLevel(motorId, temperature)
      };

      // Store in historical data
      this._addToHistory(motorId, reading);

      // Store in database
      if (this.databaseManager) {
        await this._storeReading(reading);
      }

      // Emit real-time update
      this._emitRealTimeUpdate(reading);

      // Check for alerts
      await this._checkAlerts(motorId, reading);

      return reading;

    } catch (error) {
      logger.error(`Error processing temperature reading for motor ${motorId}:`, error);
      throw error;
    }
  }

  /**
   * Get current temperatures for all motors
   */
  getCurrentTemperatures() {
    const temperatures = {};
    
    this.monitors.forEach((monitor, motorId) => {
      const readings = monitor.getCurrentReadings();
      temperatures[motorId] = readings;
    });

    return temperatures;
  }

  /**
   * Get historical temperature data
   */
  getHistoricalData(motorId, limit = 100, timeRange = null) {
    const history = this.historicalData.get(motorId) || [];
    
    let filteredHistory = history;

    // Apply time range filter if provided
    if (timeRange) {
      const { start, end } = timeRange;
      filteredHistory = history.filter(reading => {
        const readingTime = new Date(reading.timestamp);
        return readingTime >= start && readingTime <= end;
      });
    }

    // Apply limit
    return filteredHistory.slice(-limit);
  }

  /**
   * Update temperature thresholds for a motor
   */
  async updateThresholds(motorId, thresholds) {
    try {
      // Validate thresholds
      this._validateThresholds(thresholds);

      // Update in memory
      this.alertThresholds.set(motorId, { ...this.defaultThresholds, ...thresholds });

      // Update monitor if it exists
      const monitor = this.monitors.get(motorId);
      if (monitor) {
        monitor.updateThresholds(thresholds);
      }

      // Store in database
      if (this.databaseManager) {
        await this._storeThresholds(motorId, thresholds);
      }

      logger.info(`Temperature thresholds updated for motor ${motorId}:`, thresholds);
      this.emit('thresholds:updated', { motorId, thresholds });

    } catch (error) {
      logger.error(`Error updating thresholds for motor ${motorId}:`, error);
      throw error;
    }
  }

  /**
   * Get active temperature alerts
   */
  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Clear alert for a motor
   */
  clearAlert(motorId) {
    if (this.activeAlerts.has(motorId)) {
      const alert = this.activeAlerts.get(motorId);
      this.activeAlerts.delete(motorId);
      
      this.emit('alert:cleared', { motorId, alert });
      this._emitRealTimeUpdate({ type: 'alert:cleared', motorId, alert });
    }
  }

  /**
   * Get temperature statistics
   */
  getTemperatureStats(motorId, timeRange = null) {
    const history = this.getHistoricalData(motorId, 1000, timeRange);
    
    if (history.length === 0) {
      return null;
    }

    const temperatures = history.map(r => r.temperature);
    
    return {
      count: temperatures.length,
      min: Math.min(...temperatures),
      max: Math.max(...temperatures),
      average: temperatures.reduce((a, b) => a + b) / temperatures.length,
      current: temperatures[temperatures.length - 1],
      trend: this._calculateTrend(temperatures)
    };
  }

  // Private methods

  /**
   * Handle temperature update from monitor
   */
  _handleTemperatureUpdate(data) {
    const { motorId, motorTemp, driverTemp, ambientTemp, lastUpdate } = data;
    
    // Process each temperature type
    if (motorTemp !== null) {
      this.processReading(motorId, motorTemp, lastUpdate, 'motor');
    }
    if (driverTemp !== null) {
      this.processReading(motorId, driverTemp, lastUpdate, 'driver');
    }
    if (ambientTemp !== null) {
      this.processReading(motorId, ambientTemp, lastUpdate, 'ambient');
    }
  }

  /**
   * Handle temperature alert from monitor
   */
  async _handleTemperatureAlert(data) {
    const { motorId, alertLevel, temperature, timestamp } = data;
    
    // Update active alerts
    this.activeAlerts.set(motorId, {
      motorId,
      alertLevel,
      temperature,
      timestamp,
      id: `${motorId}_${timestamp.getTime()}`
    });

    // Log alert
    logger.warn(`Temperature alert for motor ${motorId}: ${alertLevel} (${temperature}°C)`);

    // Emit alert event
    this.emit('temperature:alert', data);
    
    // Send real-time alert
    this._emitRealTimeUpdate({ type: 'temperature:alert', ...data });

    // Store alert in database
    if (this.databaseManager) {
      await this._storeAlert(data);
    }
  }

  /**
   * Handle monitor error
   */
  _handleMonitorError(data) {
    logger.error('Temperature monitor error:', data);
    this.emit('monitor:error', data);
  }

  /**
   * Add reading to historical data
   */
  _addToHistory(motorId, reading) {
    let history = this.historicalData.get(motorId) || [];
    
    history.push(reading);
    
    // Limit history size
    if (history.length > this.maxHistorySize) {
      history = history.slice(-this.maxHistorySize);
    }
    
    this.historicalData.set(motorId, history);
  }

  /**
   * Store temperature reading in database
   */
  async _storeReading(reading) {
    try {
      const { TemperatureReading } = this.databaseManager.models;
      await TemperatureReading.create(reading);
    } catch (error) {
      logger.error('Failed to store temperature reading:', error);
    }
  }

  /**
   * Store temperature alert in database
   */
  async _storeAlert(alert) {
    try {
      // Could extend AuditLog or create separate alert table
      logger.info('Temperature alert logged:', alert);
    } catch (error) {
      logger.error('Failed to store temperature alert:', error);
    }
  }

  /**
   * Store temperature thresholds in database
   */
  async _storeThresholds(motorId, thresholds) {
    try {
      const { TemperatureThreshold } = this.databaseManager.models;
      
      await TemperatureThreshold.upsert({
        motor_id: motorId,
        warning_temp: thresholds.warning,
        critical_temp: thresholds.critical,
        emergency_temp: thresholds.emergency || thresholds.max_temp
      });
    } catch (error) {
      logger.error('Failed to store temperature thresholds:', error);
    }
  }

  /**
   * Load thresholds from database
   */
  async _loadThresholds() {
    try {
      if (!this.databaseManager || !this.databaseManager.models) {
        return;
      }

      const { TemperatureThreshold } = this.databaseManager.models;
      const thresholds = await TemperatureThreshold.findAll();
      
      thresholds.forEach(threshold => {
        this.alertThresholds.set(threshold.motor_id, {
          warning: threshold.warning_temp,
          critical: threshold.critical_temp,
          emergency: threshold.emergency_temp
        });
      });
    } catch (error) {
      logger.error('Failed to load temperature thresholds:', error);
    }
  }

  /**
   * Load recent historical data from database
   */
  async _loadHistoricalData() {
    try {
      if (!this.databaseManager || !this.databaseManager.models) {
        return;
      }

      const { TemperatureReading } = this.databaseManager.models;
      
      // Load recent readings for each motor
      const recentReadings = await TemperatureReading.findAll({
        limit: 100,
        order: [['timestamp', 'DESC']],
        where: {
          timestamp: {
            [this.databaseManager.Sequelize.Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      });

      // Group by motor
      recentReadings.forEach(reading => {
        this._addToHistory(reading.motor_id, {
          motorId: reading.motor_id,
          temperature: reading.temperature,
          timestamp: reading.timestamp,
          tempType: reading.temp_type,
          alertLevel: reading.alert_level
        });
      });
      
    } catch (error) {
      logger.error('Failed to load historical temperature data:', error);
    }
  }

  /**
   * Determine alert level based on temperature and thresholds
   */
  _determineAlertLevel(motorId, temperature) {
    const thresholds = this.alertThresholds.get(motorId) || this.defaultThresholds;
    
    if (temperature >= thresholds.emergency) {
      return 'emergency';
    } else if (temperature >= thresholds.critical) {
      return 'critical';
    } else if (temperature >= thresholds.warning) {
      return 'warning';
    }
    
    return 'normal';
  }

  /**
   * Check for alerts based on temperature reading
   */
  async _checkAlerts(motorId, reading) {
    const alertLevel = reading.alertLevel;
    
    if (alertLevel !== 'normal') {
      await this._handleTemperatureAlert({
        motorId,
        alertLevel,
        temperature: reading.temperature,
        timestamp: reading.timestamp,
        reading
      });
    }
  }

  /**
   * Emit real-time update via Socket.IO
   */
  _emitRealTimeUpdate(data) {
    if (this.socketIO) {
      this.socketIO.emit('temperature:update', data);
    }
  }

  /**
   * Validate temperature thresholds
   */
  _validateThresholds(thresholds) {
    const { warning, critical, emergency } = thresholds;
    
    if (warning && critical && warning >= critical) {
      throw new Error('Warning threshold must be less than critical threshold');
    }
    
    if (critical && emergency && critical >= emergency) {
      throw new Error('Critical threshold must be less than emergency threshold');
    }
    
    if (warning && (warning < 0 || warning > 200)) {
      throw new Error('Warning threshold must be between 0 and 200°C');
    }
  }

  /**
   * Calculate temperature trend
   */
  _calculateTrend(temperatures) {
    if (temperatures.length < 3) {
      return 'stable';
    }

    const recent = temperatures.slice(-5); // Last 5 readings
    const first = recent[0];
    const last = recent[recent.length - 1];
    
    const change = last - first;
    
    if (return 'rising') {
      ;
    }
    if (return 'falling') {
      ;
    }
    return 'stable';
  }
}

module.exports = TemperatureManager;