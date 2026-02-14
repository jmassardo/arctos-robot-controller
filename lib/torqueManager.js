const EventEmitter = require('events');
const { logger } = require('./logger');
const { models } = require('./database');

/**
 * TorqueManager - Core torque monitoring and management system
 * Handles real-time torque measurement, load analysis, and overload protection
 */
class TorqueManager extends EventEmitter {
  constructor() {
    super();

    // Current torque readings for each motor
    this.torqueReadings = new Map();

    // Load profiles for pattern analysis
    this.loadProfiles = new Map();

    // Overload protection thresholds
    this.overloadThresholds = new Map();

    // Historical data buffers (in-memory for real-time analysis)
    this.torqueHistory = new Map(); // motor_id -> circular buffer
    this.loadEventHistory = new Map();

    // Configuration
    this.config = {
      historyBufferSize: 1000, // Keep 1000 readings per motor in memory
      analysisWindowMs: 30000, // 30 seconds for load pattern analysis
      samplingIntervalMs: 100, // 100ms between readings
      enableAutoProtection: true,
      enableAdaptiveControl: true,
    };

    // State tracking
    this.isMonitoring = false;
    this.monitoringIntervals = new Map();

    logger.info('TorqueManager initialized');
  }

  /**
   * Initialize torque monitoring for specified motors
   * @param {Array<string>} motorIds - Array of motor IDs to monitor
   * @param {Object} torqueController - Controller interface for torque reading
   */
  async initialize(motorIds, torqueController) {
    try {
      this.torqueController = torqueController;

      // Initialize data structures for each motor
      for (const motorId of motorIds) {
        this.torqueReadings.set(motorId, {
          currentTorque: 0,
          loadPercentage: 0,
          peakTorque: 0,
          averageTorque: 0,
          motorCurrent: 0,
          motorSpeed: 0,
          position: 0,
          timestamp: new Date(),
        });

        this.torqueHistory.set(motorId, []);
        this.loadEventHistory.set(motorId, []);
        this.loadProfiles.set(motorId, {
          cyclePattern: [],
          averageLoad: 0,
          peakLoad: 0,
          loadFactor: 0,
          lastAnalysis: new Date(),
        });

        // Load motor specifications and thresholds
        await this.loadMotorSpecifications(motorId);
      }

      logger.info(`TorqueManager initialized for ${motorIds.length} motors`, { motorIds });
      return true;
    } catch (error) {
      logger.error('Failed to initialize TorqueManager', { error: error.message });
      throw error;
    }
  }

  /**
   * Start real-time torque monitoring
   * @param {Array<string>} motorIds - Motors to monitor
   */
  async startMonitoring(motorIds = []) {
    try {
      if (this.isMonitoring) {
        logger.warn('Torque monitoring already active');
        return;
      }

      const motorsToMonitor =
        motorIds.length > 0 ? motorIds : Array.from(this.torqueReadings.keys());

      for (const motorId of motorsToMonitor) {
        const interval = setInterval(async () => {
          try {
            await this.measureTorque(motorId);
          } catch (error) {
            logger.error(`Error measuring torque for motor ${motorId}`, { error: error.message });
          }
        }, this.config.samplingIntervalMs);

        this.monitoringIntervals.set(motorId, interval);
      }

      this.isMonitoring = true;
      this.emit('monitoring_started', { motorIds: motorsToMonitor });
      logger.info('Torque monitoring started', { motorIds: motorsToMonitor });

      return true;
    } catch (error) {
      logger.error('Failed to start torque monitoring', { error: error.message });
      throw error;
    }
  }

  /**
   * Stop torque monitoring
   * @param {Array<string>} motorIds - Motors to stop monitoring (empty = all)
   */
  async stopMonitoring(motorIds = []) {
    try {
      const motorsToStop =
        motorIds.length > 0 ? motorIds : Array.from(this.monitoringIntervals.keys());

      for (const motorId of motorsToStop) {
        const interval = this.monitoringIntervals.get(motorId);
        if (interval) {
          clearInterval(interval);
          this.monitoringIntervals.delete(motorId);
        }
      }

      if (this.monitoringIntervals.size === 0) {
        this.isMonitoring = false;
      }

      this.emit('monitoring_stopped', { motorIds: motorsToStop });
      logger.info('Torque monitoring stopped', { motorIds: motorsToStop });

      return true;
    } catch (error) {
      logger.error('Failed to stop torque monitoring', { error: error.message });
      throw error;
    }
  }

  /**
   * Measure torque for a specific motor
   * @param {string} motorId - Motor identifier
   * @returns {Object} Torque measurement data
   */
  async measureTorque(motorId) {
    try {
      if (!this.torqueController) {
        throw new Error('Torque controller not initialized');
      }

      // Get current motor data from controller
      const motorData = await this.torqueController.readMotorData(motorId);
      const motorSpec = this.overloadThresholds.get(motorId);

      if (!motorSpec) {
        throw new Error(`Motor specifications not found for ${motorId}`);
      }

      // Calculate torque from current
      const currentTorque = this.calculateTorqueFromCurrent(
        motorData.current,
        motorSpec.torqueConstant,
        motorSpec.efficiency
      );

      // Calculate load percentage
      const loadPercentage = (currentTorque / motorSpec.ratedTorque) * 100;

      // Update peak and average calculations
      const history = this.torqueHistory.get(motorId) || [];
      const peakTorque = Math.max(
        currentTorque,
        history.reduce((max, reading) => Math.max(max, reading.torque), 0)
      );

      const averageTorque =
        history.length > 0
          ? history.reduce((sum, reading) => sum + reading.torque, currentTorque) /
            (history.length + 1)
          : currentTorque;

      // Create torque reading
      const torqueReading = {
        motorId,
        currentTorque,
        loadPercentage,
        peakTorque,
        averageTorque,
        motorCurrent: motorData.current,
        motorSpeed: motorData.speed || 0,
        position: motorData.position || 0,
        timestamp: new Date(),
      };

      // Update current readings
      this.torqueReadings.set(motorId, torqueReading);

      // Add to history buffer (circular buffer)
      this.addToHistory(motorId, torqueReading);

      // Store in database (every 10th reading to reduce DB load)
      if (history.length % 10 === 0) {
        await this.storeTorqueReading(torqueReading);
      }

      // Check for overload conditions
      await this.checkOverload(motorId, torqueReading);

      // Emit real-time update
      this.emit('torque_update', torqueReading);

      return torqueReading;
    } catch (error) {
      logger.error(`Failed to measure torque for motor ${motorId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate torque from motor current
   * @param {number} current - Motor current in amperes
   * @param {number} torqueConstant - Torque constant (Nm/A)
   * @param {number} efficiency - Motor efficiency (0-1)
   * @returns {number} Calculated torque in Newton-meters
   */
  calculateTorqueFromCurrent(current, torqueConstant, efficiency = 0.85) {
    // For stepper motors: Torque ≈ Kt * I * efficiency
    const torque = Math.abs(current) * torqueConstant * efficiency;
    return parseFloat(torque.toFixed(4));
  }

  /**
   * Add torque reading to history buffer
   * @param {string} motorId - Motor identifier
   * @param {Object} reading - Torque reading data
   */
  addToHistory(motorId, reading) {
    const history = this.torqueHistory.get(motorId) || [];

    // Add new reading
    history.push({
      torque: reading.currentTorque,
      load: reading.loadPercentage,
      current: reading.motorCurrent,
      speed: reading.motorSpeed,
      timestamp: reading.timestamp,
    });

    // Maintain circular buffer
    if (history.length > this.config.historyBufferSize) {
      history.shift();
    }

    this.torqueHistory.set(motorId, history);
  }

  /**
   * Analyze load patterns over time
   * @param {string} motorId - Motor identifier
   * @param {number} timeWindow - Analysis window in milliseconds
   * @returns {Object} Load pattern analysis
   */
  analyzeLoadPattern(motorId, timeWindow = this.config.analysisWindowMs) {
    try {
      const history = this.torqueHistory.get(motorId) || [];
      if (history.length < 10) {
        return null; // Need minimum data for analysis
      }

      const now = new Date();
      const cutoffTime = new Date(now.getTime() - timeWindow);

      // Filter data within time window
      const recentData = history.filter(reading => reading.timestamp >= cutoffTime);

      if (recentData.length === 0) {
        return null;
      }

      // Calculate statistics
      const loads = recentData.map(r => r.load);
      const averageLoad = loads.reduce((sum, load) => sum + load, 0) / loads.length;
      const peakLoad = Math.max(...loads);
      const minLoad = Math.min(...loads);

      // Calculate load factor (RMS)
      const loadFactor = Math.sqrt(
        loads.reduce((sum, load) => sum + load * load, 0) / loads.length
      );

      // Detect cyclical patterns (simplified)
      const cyclePattern = this.detectCyclePattern(loads);

      // Check for anomalies
      const anomalies = this.detectAnomalies(recentData, averageLoad);

      const analysis = {
        cyclePattern,
        averageLoad: parseFloat(averageLoad.toFixed(2)),
        peakLoad: parseFloat(peakLoad.toFixed(2)),
        minLoad: parseFloat(minLoad.toFixed(2)),
        loadFactor: parseFloat(loadFactor.toFixed(2)),
        loadVariation: parseFloat((peakLoad - minLoad).toFixed(2)),
        dataPoints: recentData.length,
        timeWindow,
        anomalies,
        lastAnalysis: now,
      };

      // Update load profile
      this.loadProfiles.set(motorId, analysis);

      this.emit('load_analysis_complete', { motorId, analysis });

      return analysis;
    } catch (error) {
      logger.error(`Failed to analyze load pattern for motor ${motorId}`, { error: error.message });
      return null;
    }
  }

  /**
   * Detect cyclical load patterns (simplified implementation)
   * @param {Array<number>} loads - Array of load percentages
   * @returns {Object} Cycle pattern information
   */
  detectCyclePattern(loads) {
    // Simple peak detection for cycle identification
    const peaks = [];
    const valleys = [];

    for (let i = 1; i < loads.length - 1; i++) {
      if (loads[i] > loads[i - 1] && loads[i] > loads[i + 1]) {
        peaks.push({ index: i, value: loads[i] });
      }
      if (loads[i] < loads[i - 1] && loads[i] < loads[i + 1]) {
        valleys.push({ index: i, value: loads[i] });
      }
    }

    // Estimate cycle time based on peak intervals
    let cycleTime = 0;
    if (peaks.length > 1) {
      const intervals = [];
      for (let i = 1; i < peaks.length; i++) {
        intervals.push(peaks[i].index - peaks[i - 1].index);
      }
      cycleTime = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    }

    return {
      hasCycle: peaks.length > 2,
      peakCount: peaks.length,
      valleyCount: valleys.length,
      estimatedCycleTime: cycleTime,
      peaks: peaks.slice(-5), // Keep last 5 peaks
      valleys: valleys.slice(-5),
    };
  }

  /**
   * Detect load anomalies
   * @param {Array} recentData - Recent torque readings
   * @param {number} averageLoad - Average load percentage
   * @returns {Array} Array of detected anomalies
   */
  detectAnomalies(recentData, averageLoad) {
    const anomalies = [];
    const threshold = averageLoad * 0.3; // 30% deviation threshold

    for (const reading of recentData) {
      const deviation = Math.abs(reading.load - averageLoad);
      if (deviation > threshold) {
        anomalies.push({
          timestamp: reading.timestamp,
          load: reading.load,
          deviation,
          type: reading.load > averageLoad ? 'spike' : 'drop',
        });
      }
    }

    return anomalies.slice(-10); // Keep last 10 anomalies
  }

  /**
   * Check for overload conditions and trigger protection
   * @param {string} motorId - Motor identifier
   * @param {Object} torqueReading - Current torque reading
   */
  async checkOverload(motorId, torqueReading) {
    const thresholds = this.overloadThresholds.get(motorId);
    if (!thresholds || !this.config.enableAutoProtection) {
      return;
    }

    const { loadPercentage, currentTorque } = torqueReading;

    try {
      // Warning level
      if (loadPercentage >= thresholds.warningLevel && loadPercentage < thresholds.criticalLevel) {
        await this.handleOverloadWarning(motorId, torqueReading);
      }

      // Critical level
      else if (
        loadPercentage >= thresholds.criticalLevel &&
        loadPercentage < thresholds.emergencyLevel
      ) {
        await this.handleOverloadCritical(motorId, torqueReading);
      }

      // Emergency level
      else if (loadPercentage >= thresholds.emergencyLevel) {
        await this.handleOverloadEmergency(motorId, torqueReading);
      }
    } catch (error) {
      logger.error(`Error in overload protection for motor ${motorId}`, { error: error.message });
    }
  }

  /**
   * Handle overload warning condition
   */
  async handleOverloadWarning(motorId, torqueReading) {
    const event = await this.createLoadEvent(motorId, 'overload', 'low', torqueReading);
    this.emit('overload_warning', { motorId, torqueReading, event });
    logger.warn(`Overload warning for motor ${motorId}`, {
      loadPercentage: torqueReading.loadPercentage,
    });
  }

  /**
   * Handle critical overload condition
   */
  async handleOverloadCritical(motorId, torqueReading) {
    const event = await this.createLoadEvent(motorId, 'overload', 'high', torqueReading);
    this.emit('overload_critical', { motorId, torqueReading, event });
    logger.error(`Critical overload for motor ${motorId}`, {
      loadPercentage: torqueReading.loadPercentage,
    });

    // Request motion speed reduction
    if (this.config.enableAdaptiveControl) {
      this.emit('request_speed_reduction', {
        motorId,
        speedFactor: 0.7,
        reason: 'critical_overload',
      });
    }
  }

  /**
   * Handle emergency overload condition
   */
  async handleOverloadEmergency(motorId, torqueReading) {
    const event = await this.createLoadEvent(motorId, 'overload', 'critical', torqueReading);
    this.emit('overload_emergency', { motorId, torqueReading, event });
    this.emit('emergency_stop_requested', {
      motorId,
      reason: 'emergency_overload',
      loadPercentage: torqueReading.loadPercentage,
    });

    logger.error(`EMERGENCY OVERLOAD for motor ${motorId}`, {
      loadPercentage: torqueReading.loadPercentage,
    });
  }

  /**
   * Create and store load event
   */
  async createLoadEvent(motorId, eventType, severity, torqueReading) {
    try {
      const event = {
        motorId,
        eventType,
        peakTorque: torqueReading.currentTorque,
        severity,
        metadata: {
          loadPercentage: torqueReading.loadPercentage,
          motorCurrent: torqueReading.motorCurrent,
          motorSpeed: torqueReading.motorSpeed,
          position: torqueReading.position,
        },
        timestamp: torqueReading.timestamp,
      };

      // Store in database
      await models.LoadEvent.create({
        motor_id: motorId,
        event_type: eventType,
        peak_torque: torqueReading.currentTorque,
        severity,
        metadata: event.metadata,
      });

      // Add to in-memory history
      const eventHistory = this.loadEventHistory.get(motorId) || [];
      eventHistory.push(event);
      if (eventHistory.length > 100) {
        eventHistory.shift(); // Keep last 100 events
      }
      this.loadEventHistory.set(motorId, eventHistory);

      return event;
    } catch (error) {
      logger.error('Failed to create load event', { error: error.message });
      throw error;
    }
  }

  /**
   * Store torque reading in database
   */
  async storeTorqueReading(torqueReading) {
    try {
      await models.TorqueReading.create({
        motor_id: torqueReading.motorId,
        torque_nm: torqueReading.currentTorque,
        load_percentage: torqueReading.loadPercentage,
        motor_current: torqueReading.motorCurrent,
        motor_speed: torqueReading.motorSpeed,
        position: torqueReading.position,
        timestamp: torqueReading.timestamp,
      });
    } catch (error) {
      logger.error('Failed to store torque reading', { error: error.message });
    }
  }

  /**
   * Load motor specifications from database
   */
  async loadMotorSpecifications(motorId) {
    try {
      let motorSpec = await models.MotorSpecification.findByPk(motorId);

      if (!motorSpec) {
        // Create default motor specification
        motorSpec = await models.MotorSpecification.create({
          motor_id: motorId,
          motor_model: `Motor_${motorId}`,
          rated_torque_nm: 0.5, // Default 0.5 Nm
          torque_constant: 0.1, // Default 0.1 Nm/A
          efficiency: 0.85,
        });

        logger.info(`Created default motor specification for ${motorId}`);
      }

      // Store thresholds for quick access
      this.overloadThresholds.set(motorId, {
        ratedTorque: parseFloat(motorSpec.rated_torque_nm),
        maxContinuousTorque: parseFloat(
          motorSpec.max_continuous_torque || motorSpec.rated_torque_nm
        ),
        peakTorque: parseFloat(motorSpec.peak_torque_nm || motorSpec.rated_torque_nm * 1.5),
        torqueConstant: parseFloat(motorSpec.torque_constant),
        efficiency: parseFloat(motorSpec.efficiency),
        warningLevel: parseFloat(motorSpec.warning_level),
        criticalLevel: parseFloat(motorSpec.critical_level),
        emergencyLevel: parseFloat(motorSpec.emergency_level),
      });

      return motorSpec;
    } catch (error) {
      logger.error(`Failed to load motor specifications for ${motorId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Update motor specifications
   */
  async updateMotorSpecifications(motorId, specifications) {
    try {
      await models.MotorSpecification.upsert({
        motor_id: motorId,
        ...specifications,
      });

      // Reload thresholds
      await this.loadMotorSpecifications(motorId);

      logger.info(`Updated motor specifications for ${motorId}`);
      this.emit('motor_specs_updated', { motorId, specifications });

      return true;
    } catch (error) {
      logger.error(`Failed to update motor specifications for ${motorId}`, {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get current torque readings
   * @param {string} motorId - Specific motor (optional)
   * @returns {Object|Map} Current torque readings
   */
  getCurrentReadings(motorId = null) {
    if (motorId) {
      return this.torqueReadings.get(motorId) || null;
    }
    return new Map(this.torqueReadings);
  }

  /**
   * Get historical torque data
   * @param {string} motorId - Motor identifier
   * @param {number} timeWindow - Time window in milliseconds
   * @returns {Array} Historical torque readings
   */
  getHistoricalData(motorId, timeWindow = 3600000) {
    // Default 1 hour
    const history = this.torqueHistory.get(motorId) || [];
    const cutoffTime = new Date(Date.now() - timeWindow);

    return history.filter(reading => reading.timestamp >= cutoffTime);
  }

  /**
   * Get load events for a motor
   * @param {string} motorId - Motor identifier
   * @param {number} limit - Maximum number of events to return
   * @returns {Array} Load events
   */
  getLoadEvents(motorId, limit = 50) {
    const events = this.loadEventHistory.get(motorId) || [];
    return events.slice(-limit);
  }

  /**
   * Calibrate torque measurement
   * @param {string} motorId - Motor identifier
   * @param {number} knownTorque - Known reference torque (Nm)
   * @param {number} measuredCurrent - Measured current at known torque (A)
   * @returns {Object} Calibration result
   */
  async calibrateTorque(motorId, knownTorque, measuredCurrent) {
    try {
      // Calculate new torque constant
      const newTorqueConstant = knownTorque / measuredCurrent;

      // Store calibration data
      const calibration = await models.TorqueCalibration.create({
        motor_id: motorId,
        calibration_type: 'known_load',
        reference_torque: knownTorque,
        measured_current: measuredCurrent,
        calculated_constant: newTorqueConstant,
        environmental_conditions: {
          temperature: await this.getCurrentTemperature(motorId),
          timestamp: new Date(),
        },
      });

      // Update motor specifications with new constant
      await this.updateMotorSpecifications(motorId, {
        torque_constant: newTorqueConstant,
      });

      logger.info(`Torque calibration completed for motor ${motorId}`, {
        knownTorque,
        measuredCurrent,
        newTorqueConstant,
      });

      this.emit('calibration_complete', {
        motorId,
        calibration: {
          torqueConstant: newTorqueConstant,
          knownTorque,
          measuredCurrent,
        },
      });

      return {
        success: true,
        torqueConstant: newTorqueConstant,
        calibrationId: calibration.id,
      };
    } catch (error) {
      logger.error(`Failed to calibrate torque for motor ${motorId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get current motor temperature (if available)
   */
  async getCurrentTemperature(motorId) {
    try {
      const tempReading = await models.TemperatureReading.findOne({
        where: { motor_id: motorId },
        order: [['timestamp', 'DESC']],
        limit: 1,
      });

      return tempReading ? tempReading.temperature : null;
    } catch (error) {
      return null; // Temperature not available
    }
  }

  /**
   * Shutdown torque manager
   */
  async shutdown() {
    try {
      await this.stopMonitoring();
      this.removeAllListeners();
      logger.info('TorqueManager shutdown complete');
    } catch (error) {
      logger.error('Error during TorqueManager shutdown', { error: error.message });
    }
  }
}

module.exports = TorqueManager;
