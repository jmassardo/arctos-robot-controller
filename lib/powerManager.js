const { EventEmitter } = require('events');
const { logger } = require('./logger');

/**
 * Core Power Management System
 * Handles power measurement, energy calculation, and cost tracking
 */
class PowerManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.powerReadings = new Map(); // deviceId -> current reading
    this.energyCounters = new Map(); // deviceId -> accumulated energy
    this.lastReadingTime = new Map(); // deviceId -> timestamp
    this.powerHistory = new Map(); // deviceId -> array of historical readings

    // Configuration
    this.config = {
      electricityRate: config.electricityRate || 0.12, // $/kWh
      currency: config.currency || 'USD',
      maxHistoryPoints: config.maxHistoryPoints || 1000,
      measurementInterval: config.measurementInterval || 1000, // ms
      powerThresholds: {
        warning: config.warningThreshold || 1000, // watts
        critical: config.criticalThreshold || 1500, // watts
      },
      ...config,
    };

    // Current session tracking
    this.currentSession = null;
    this.sessionStartTime = null;

    // Power meters registry
    this.powerMeters = new Map();

    // Measurement timer
    this.measurementTimer = null;
    this.isMonitoring = false;

    logger.info('PowerManager initialized', { config: this.config });
  }

  /**
   * Register a power meter for a device
   */
  registerPowerMeter(deviceId, powerMeter) {
    this.powerMeters.set(deviceId, powerMeter);
    this.powerReadings.set(deviceId, { power: 0, voltage: 0, current: 0, timestamp: Date.now() });
    this.energyCounters.set(deviceId, 0);
    this.powerHistory.set(deviceId, []);

    logger.info('Power meter registered', { deviceId, meterType: powerMeter.constructor.name });
  }

  /**
   * Start power monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.measurementTimer = setInterval(async () => {
      await this.measureAllDevices();
    }, this.config.measurementInterval);

    logger.info('Power monitoring started');
    this.emit('monitoringStarted');
  }

  /**
   * Stop power monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    if (this.measurementTimer) {
      clearInterval(this.measurementTimer);
      this.measurementTimer = null;
    }

    logger.info('Power monitoring stopped');
    this.emit('monitoringStopped');
  }

  /**
   * Measure power consumption for all registered devices
   */
  async measureAllDevices() {
    const timestamp = Date.now();

    for (const [deviceId, powerMeter] of this.powerMeters) {
      try {
        const reading = await this.measureDevice(deviceId, powerMeter, timestamp);
        if (reading) {
          this.processPowerReading(deviceId, reading);
        }
      } catch (error) {
        logger.error('Failed to measure device power', { deviceId, error: error.message });
      }
    }
  }

  /**
   * Measure power for a specific device
   */
  async measureDevice(deviceId, powerMeter, timestamp) {
    try {
      const powerData = await powerMeter.readPower();

      return {
        deviceId,
        deviceType: powerMeter.deviceType || 'motor',
        power: powerData.power || 0,
        voltage: powerData.voltage || 0,
        current: powerData.current || 0,
        powerFactor: powerData.powerFactor || 1.0,
        efficiency: powerData.efficiency || 100,
        timestamp,
      };
    } catch (error) {
      logger.error('Power measurement failed', { deviceId, error: error.message });
      return null;
    }
  }

  /**
   * Process a power reading and update energy calculations
   */
  processPowerReading(deviceId, reading) {
    const previousReading = this.powerReadings.get(deviceId);
    const lastTime = this.lastReadingTime.get(deviceId) || reading.timestamp;

    // Calculate time difference in hours
    const timeDiffHours = (reading.timestamp - lastTime) / (1000 * 60 * 60);

    // Calculate energy consumed since last reading (Wh)
    if (previousReading && timeDiffHours > 0) {
      const avgPower = (reading.power + previousReading.power) / 2;
      const energyWh = avgPower * timeDiffHours;

      // Update energy counter
      const currentEnergy = this.energyCounters.get(deviceId) || 0;
      this.energyCounters.set(deviceId, currentEnergy + energyWh);
    }

    // Update current reading
    this.powerReadings.set(deviceId, reading);
    this.lastReadingTime.set(deviceId, reading.timestamp);

    // Add to history (with size limit)
    const history = this.powerHistory.get(deviceId);
    history.push(reading);
    if (history.length > this.config.maxHistoryPoints) {
      history.shift();
    }

    // Check thresholds and emit warnings
    this.checkPowerThresholds(deviceId, reading);

    // Emit real-time update
    this.emit('powerUpdate', {
      deviceId,
      reading,
      totalEnergy: this.energyCounters.get(deviceId),
    });
  }

  /**
   * Check power thresholds and emit warnings
   */
  checkPowerThresholds(deviceId, reading) {
    const { power } = reading;
    const { warning, critical } = this.config.powerThresholds;

    if (power >= critical) {
      this.emit('powerAlert', {
        level: 'critical',
        deviceId,
        power,
        threshold: critical,
        message: `Critical power consumption: ${power}W exceeds ${critical}W threshold`,
      });
    } else if (power >= warning) {
      this.emit('powerAlert', {
        level: 'warning',
        deviceId,
        power,
        threshold: warning,
        message: `High power consumption: ${power}W exceeds ${warning}W threshold`,
      });
    }
  }

  /**
   * Get current power consumption for a device
   */
  getCurrentPower(deviceId) {
    return this.powerReadings.get(deviceId);
  }

  /**
   * Get total energy consumed by a device
   */
  getTotalEnergy(deviceId) {
    return this.energyCounters.get(deviceId) || 0;
  }

  /**
   * Get power history for a device
   */
  getPowerHistory(deviceId, limit = null) {
    const history = this.powerHistory.get(deviceId) || [];
    if (limit && limit > 0) {
      return history.slice(-limit);
    }
    return [...history];
  }

  /**
   * Get system-wide power metrics
   */
  getSystemMetrics() {
    const allReadings = Array.from(this.powerReadings.values());
    const allEnergies = Array.from(this.energyCounters.values());

    const totalPower = allReadings.reduce((sum, reading) => sum + reading.power, 0);
    const totalEnergy = allEnergies.reduce((sum, energy) => sum + energy, 0);
    const peakPower = Math.max(...allReadings.map(r => r.power), 0);
    const averagePower = allReadings.length > 0 ? totalPower / allReadings.length : 0;

    const costToDate = this.calculateEnergyCost(totalEnergy);

    return {
      instantPower: totalPower,
      totalEnergy,
      peakPower,
      averagePower,
      costToDate,
      deviceCount: this.powerReadings.size,
      timestamp: Date.now(),
    };
  }

  /**
   * Calculate energy cost
   */
  calculateEnergyCost(energyWh, timeHours = null) {
    const energyKWh = energyWh / 1000;
    return energyKWh * this.config.electricityRate;
  }

  /**
   * Start an energy tracking session
   */
  startEnergySession(sessionName) {
    this.currentSession = {
      name: sessionName,
      startTime: Date.now(),
      startEnergy: new Map(this.energyCounters),
      peakPower: 0,
      powerSamples: [],
    };

    logger.info('Energy session started', { sessionName });
    this.emit('sessionStarted', this.currentSession);

    return this.currentSession;
  }

  /**
   * End current energy tracking session
   */
  endEnergySession() {
    if (!this.currentSession) {
      return null;
    }

    const endTime = Date.now();
    const sessionDuration = (endTime - this.currentSession.startTime) / 1000; // seconds

    // Calculate session energy usage
    const sessionEnergy = new Map();
    let totalSessionEnergy = 0;

    for (const [deviceId, currentEnergy] of this.energyCounters) {
      const startEnergy = this.currentSession.startEnergy.get(deviceId) || 0;
      const deviceSessionEnergy = currentEnergy - startEnergy;
      sessionEnergy.set(deviceId, deviceSessionEnergy);
      totalSessionEnergy += deviceSessionEnergy;
    }

    // Calculate average power during session
    const averagePower = sessionDuration > 0 ? totalSessionEnergy / (sessionDuration / 3600) : 0;

    const sessionSummary = {
      ...this.currentSession,
      endTime,
      duration: sessionDuration,
      totalEnergy: totalSessionEnergy,
      averagePower,
      cost: this.calculateEnergyCost(totalSessionEnergy),
      deviceEnergies: Object.fromEntries(sessionEnergy),
    };

    this.currentSession = null;

    logger.info('Energy session ended', {
      sessionName: sessionSummary.name,
      totalEnergy: totalSessionEnergy,
      cost: sessionSummary.cost,
    });

    this.emit('sessionEnded', sessionSummary);

    return sessionSummary;
  }

  /**
   * Update power monitoring configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    logger.info('Power monitoring config updated', { config: this.config });
    this.emit('configUpdated', this.config);
  }

  /**
   * Reset energy counters
   */
  resetEnergyCounters() {
    this.energyCounters.clear();
    for (const deviceId of this.powerReadings.keys()) {
      this.energyCounters.set(deviceId, 0);
    }

    logger.info('Energy counters reset');
    this.emit('countersReset');
  }

  /**
   * Get all registered devices
   */
  getRegisteredDevices() {
    return Array.from(this.powerMeters.keys()).map(deviceId => ({
      deviceId,
      meterType: this.powerMeters.get(deviceId).constructor.name,
      currentPower: this.powerReadings.get(deviceId)?.power || 0,
      totalEnergy: this.energyCounters.get(deviceId) || 0,
    }));
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.stopMonitoring();
    this.powerMeters.clear();
    this.powerReadings.clear();
    this.energyCounters.clear();
    this.powerHistory.clear();
    this.lastReadingTime.clear();

    logger.info('PowerManager cleanup completed');
  }
}

module.exports = PowerManager;
