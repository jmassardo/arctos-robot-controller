const { logger } = require('../logger');

/**
 * MKSTorqueMonitor - MKS controller specific torque monitoring integration
 * Handles torque measurement via current feedback from MKS stepper controllers
 */
class MKSTorqueMonitor {
  constructor(mksController) {
    this.controller = mksController;
    this.torqueCalibration = new Map(); // motor_id -> calibration data
    this.ratedTorque = new Map(); // motor_id -> rated torque values
    this.lastReadings = new Map(); // motor_id -> last reading timestamp

    // MKS-specific configuration
    this.config = {
      currentReadingTimeout: 1000, // 1 second timeout for current readings
      minReadingInterval: 50, // Minimum 50ms between readings
      currentFilterAlpha: 0.1, // Low-pass filter coefficient for current smoothing
      torqueFilterAlpha: 0.2, // Low-pass filter for torque calculations
      simulationMode: false, // Set by controller if hardware not available
    };

    // Filtered values for noise reduction
    this.filteredCurrent = new Map();
    this.filteredTorque = new Map();

    logger.info('MKSTorqueMonitor initialized');
  }

  /**
   * Initialize torque monitoring for specific MKS motors
   * @param {Array<string>} motorIds - Array of motor identifiers
   */
  async initialize(motorIds) {
    try {
      // Check if MKS controller is available
      if (!this.controller) {
        throw new Error('MKS controller not available');
      }

      // Initialize data structures for each motor
      for (const motorId of motorIds) {
        this.filteredCurrent.set(motorId, 0);
        this.filteredTorque.set(motorId, 0);
        this.lastReadings.set(motorId, 0);

        // Set default torque calibration if not already set
        if (!this.torqueCalibration.has(motorId)) {
          await this.setDefaultCalibration(motorId);
        }

        // Set default rated torque if not set
        if (!this.ratedTorque.has(motorId)) {
          this.ratedTorque.set(motorId, 0.5); // Default 0.5 Nm
        }
      }

      // Check if controller is in simulation mode
      this.config.simulationMode = this.controller.simulationMode || false;

      if (this.config.simulationMode) {
        logger.warn('MKSTorqueMonitor running in simulation mode');
      }

      logger.info(`MKSTorqueMonitor initialized for ${motorIds.length} motors`, {
        motorIds,
        simulationMode: this.config.simulationMode,
      });

      return true;
    } catch (error) {
      logger.error('Failed to initialize MKSTorqueMonitor', { error: error.message });
      throw error;
    }
  }

  /**
   * Read motor torque via current feedback
   * @param {string} motorId - Motor identifier
   * @returns {Object} Torque and load data
   */
  async readMotorTorque(motorId) {
    try {
      // Rate limiting - prevent too frequent readings
      const now = Date.now();
      const lastReading = this.lastReadings.get(motorId) || 0;
      if (now - lastReading < this.config.minReadingInterval) {
        // Return cached values if reading too frequently
        return this.getCachedReading(motorId);
      }
      this.lastReadings.set(motorId, now);

      // Read motor data from MKS controller
      const motorData = await this.readMKSMotorData(motorId);

      // Get calibration data for this motor
      const calibration = this.torqueCalibration.get(motorId);
      if (!calibration) {
        throw new Error(`No calibration data found for motor ${motorId}`);
      }

      // Apply low-pass filter to current reading
      const filteredCurrent = this.applyCurrentFilter(motorId, motorData.current);

      // Convert current to torque using motor constants
      const currentTorque = this.calculateTorqueFromCurrent(filteredCurrent, calibration);

      // Apply torque filtering
      const smoothedTorque = this.applyTorqueFilter(motorId, currentTorque);

      // Calculate load percentage
      const ratedTorque = this.ratedTorque.get(motorId);
      const loadPercentage = (smoothedTorque / ratedTorque) * 100;

      // Prepare result
      const result = {
        motorId,
        currentTorque: parseFloat(smoothedTorque.toFixed(4)),
        loadPercentage: parseFloat(loadPercentage.toFixed(2)),
        motorCurrent: parseFloat(filteredCurrent.toFixed(3)),
        motorSpeed: motorData.speed || 0,
        position: motorData.position || 0,
        rawCurrent: motorData.current,
        timestamp: new Date(),
      };

      return result;
    } catch (error) {
      logger.error(`Failed to read motor torque for ${motorId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Read motor data from MKS controller
   * @param {string} motorId - Motor identifier
   * @returns {Object} Raw motor data from controller
   */
  async readMKSMotorData(motorId) {
    try {
      if (this.config.simulationMode) {
        return this.generateSimulatedData(motorId);
      }

      // MKS controllers typically use CAN bus communication
      // Read current motor status including current feedback
      const motorStatus = await this.controller.readMotorStatus(motorId);

      if (!motorStatus) {
        throw new Error(`No response from motor ${motorId}`);
      }

      // Extract relevant data from MKS response
      // MKS controllers provide various feedback parameters
      const motorData = {
        current: this.extractCurrentFromStatus(motorStatus),
        speed: this.extractSpeedFromStatus(motorStatus),
        position: this.extractPositionFromStatus(motorStatus),
        voltage: this.extractVoltageFromStatus(motorStatus),
        temperature: this.extractTemperatureFromStatus(motorStatus),
        errorCode: this.extractErrorCodeFromStatus(motorStatus),
      };

      return motorData;
    } catch (error) {
      logger.error(`Failed to read MKS motor data for ${motorId}`, { error: error.message });

      // Return last known values or defaults on error
      return {
        current: 0,
        speed: 0,
        position: 0,
        voltage: 0,
        temperature: 25,
        errorCode: 0,
      };
    }
  }

  /**
   * Generate simulated motor data for testing
   * @param {string} motorId - Motor identifier
   * @returns {Object} Simulated motor data
   */
  generateSimulatedData(motorId) {
    const now = Date.now();
    const timeOffset = now / 1000; // Convert to seconds

    // Create realistic simulated current with some variation
    const baseCurrent = 0.5 + Math.sin(timeOffset * 0.5) * 0.2; // 0.3-0.7A base
    const noise = (Math.random() - 0.5) * 0.1; // ±0.05A noise
    const current = Math.max(0, baseCurrent + noise);

    // Simulate some load variation
    const loadVariation = Math.sin(timeOffset * 0.1) * 0.3 + Math.random() * 0.1;
    const simulatedCurrent = current + Math.max(0, loadVariation);

    return {
      current: parseFloat(simulatedCurrent.toFixed(3)),
      speed: Math.abs(Math.sin(timeOffset * 0.3)) * 1000, // 0-1000 RPM
      position: (timeOffset * 10) % 360, // Rotating position
      voltage: 24.0 + (Math.random() - 0.5) * 2, // 23-25V
      temperature: 30 + Math.sin(timeOffset * 0.01) * 5, // 25-35°C
      errorCode: 0,
    };
  }

  /**
   * Extract current from MKS motor status response
   * @param {Object} motorStatus - Raw motor status from MKS controller
   * @returns {number} Motor current in amperes
   */
  extractCurrentFromStatus(motorStatus) {
    try {
      // MKS controllers typically provide current in their status response
      // The exact format depends on the controller model (57D, 42D, etc.)

      if (motorStatus.current !== undefined) {
        return parseFloat(motorStatus.current);
      }

      // Alternative extraction methods for different MKS formats
      if (motorStatus.data && motorStatus.data.current) {
        return parseFloat(motorStatus.data.current);
      }

      // If current is provided as raw ADC value, convert to amperes
      if (motorStatus.currentRaw !== undefined) {
        // Typical conversion: ADC_value / 4096 * reference_voltage / current_sense_resistor
        // This varies by MKS controller model
        const adcValue = motorStatus.currentRaw;
        const voltage = 3.3; // Reference voltage
        const senseResistor = 0.1; // Current sense resistor (ohms)
        const current = ((adcValue / 4096) * voltage) / senseResistor;
        return parseFloat(current.toFixed(3));
      }

      // Default to 0 if current cannot be extracted
      logger.warn('Could not extract current from MKS motor status');
      return 0;
    } catch (error) {
      logger.error('Error extracting current from motor status', { error: error.message });
      return 0;
    }
  }

  /**
   * Extract speed from MKS motor status response
   */
  extractSpeedFromStatus(motorStatus) {
    try {
      return parseFloat(motorStatus.speed || motorStatus.rpm || 0);
    } catch {
      return 0;
    }
  }

  /**
   * Extract position from MKS motor status response
   */
  extractPositionFromStatus(motorStatus) {
    try {
      return parseFloat(motorStatus.position || motorStatus.angle || 0);
    } catch {
      return 0;
    }
  }

  /**
   * Extract voltage from MKS motor status response
   */
  extractVoltageFromStatus(motorStatus) {
    try {
      return parseFloat(motorStatus.voltage || motorStatus.vbus || 24.0);
    } catch {
      return 24.0;
    }
  }

  /**
   * Extract temperature from MKS motor status response
   */
  extractTemperatureFromStatus(motorStatus) {
    try {
      return parseFloat(motorStatus.temperature || motorStatus.temp || 25.0);
    } catch {
      return 25.0;
    }
  }

  /**
   * Extract error code from MKS motor status response
   */
  extractErrorCodeFromStatus(motorStatus) {
    try {
      return parseInt(motorStatus.errorCode || motorStatus.error || 0);
    } catch {
      return 0;
    }
  }

  /**
   * Calculate torque from motor current using calibration data
   * @param {number} current - Motor current in amperes
   * @param {Object} calibration - Calibration parameters
   * @returns {number} Calculated torque in Newton-meters
   */
  calculateTorqueFromCurrent(current, calibration) {
    try {
      // Basic torque calculation: Torque = Kt * I * efficiency
      const { torqueConstant, efficiency, offset } = calibration;

      // Apply offset compensation (for zero-current offset)
      const compensatedCurrent = Math.max(0, current - (offset || 0));

      // Calculate raw torque
      const torque = compensatedCurrent * torqueConstant * efficiency;

      return Math.max(0, torque); // Ensure non-negative torque
    } catch (error) {
      logger.error('Error calculating torque from current', { error: error.message });
      return 0;
    }
  }

  /**
   * Apply low-pass filter to current reading for noise reduction
   * @param {string} motorId - Motor identifier
   * @param {number} newCurrent - New current reading
   * @returns {number} Filtered current value
   */
  applyCurrentFilter(motorId, newCurrent) {
    const alpha = this.config.currentFilterAlpha;
    const previousFiltered = this.filteredCurrent.get(motorId) || newCurrent;

    // Low-pass filter: y(n) = α * x(n) + (1-α) * y(n-1)
    const filtered = alpha * newCurrent + (1 - alpha) * previousFiltered;

    this.filteredCurrent.set(motorId, filtered);
    return filtered;
  }

  /**
   * Apply low-pass filter to torque calculation
   * @param {string} motorId - Motor identifier
   * @param {number} newTorque - New torque calculation
   * @returns {number} Filtered torque value
   */
  applyTorqueFilter(motorId, newTorque) {
    const alpha = this.config.torqueFilterAlpha;
    const previousFiltered = this.filteredTorque.get(motorId) || newTorque;

    // Low-pass filter for torque
    const filtered = alpha * newTorque + (1 - alpha) * previousFiltered;

    this.filteredTorque.set(motorId, filtered);
    return filtered;
  }

  /**
   * Get cached reading for rate-limited requests
   */
  getCachedReading(motorId) {
    return {
      motorId,
      currentTorque: this.filteredTorque.get(motorId) || 0,
      loadPercentage: 0,
      motorCurrent: this.filteredCurrent.get(motorId) || 0,
      motorSpeed: 0,
      position: 0,
      timestamp: new Date(),
      cached: true,
    };
  }

  /**
   * Set default calibration for a motor
   * @param {string} motorId - Motor identifier
   */
  async setDefaultCalibration(motorId) {
    const defaultCalibration = {
      torqueConstant: 0.1, // Default 0.1 Nm/A (typical for small stepper motors)
      efficiency: 0.85, // 85% efficiency
      offset: 0.0, // No current offset by default
      calibrationDate: new Date(),
      calibrationMethod: 'default',
      isValid: false, // Mark as needing proper calibration
    };

    this.torqueCalibration.set(motorId, defaultCalibration);

    logger.info(`Set default calibration for motor ${motorId}`, { defaultCalibration });
  }

  /**
   * Calibrate torque sensor for a specific motor
   * @param {string} motorId - Motor identifier
   * @param {number} knownLoad - Known reference torque (Nm)
   * @param {number} options - Calibration options
   */
  async calibrateTorqueSensor(motorId, knownLoad, options = {}) {
    try {
      const { numSamples = 10, sampleInterval = 100, environmentalConditions = {} } = options;

      logger.info(`Starting torque calibration for motor ${motorId}`, {
        knownLoad,
        numSamples,
      });

      // Take multiple current readings for accuracy
      const currentReadings = [];
      for (let i = 0; i < numSamples; i++) {
        const motorData = await this.readMKSMotorData(motorId);
        currentReadings.push(motorData.current);

        if (i < numSamples - 1) {
          await new Promise(resolve => setTimeout(resolve, sampleInterval));
        }
      }

      // Calculate average current
      const averageCurrent =
        currentReadings.reduce((sum, current) => sum + current, 0) / numSamples;

      // Calculate current standard deviation for quality assessment
      const currentVariance =
        currentReadings.reduce((sum, current) => sum + Math.pow(current - averageCurrent, 2), 0) /
        numSamples;
      const currentStdDev = Math.sqrt(currentVariance);

      // Calculate new torque constant
      // Torque = Kt * I * efficiency, so Kt = Torque / (I * efficiency)
      const efficiency = 0.85; // Assume 85% efficiency
      const torqueConstant = knownLoad / (averageCurrent * efficiency);

      // Calculate calibration error estimate
      const calibrationError = (currentStdDev / averageCurrent) * 100; // Percentage

      // Create calibration data
      const calibration = {
        torqueConstant,
        efficiency,
        offset: 0, // Could be calculated if zero-load current is known
        knownLoad,
        averageCurrent,
        currentStdDev,
        calibrationError,
        numSamples,
        environmentalConditions,
        calibrationDate: new Date(),
        calibrationMethod: 'known_load',
        isValid: calibrationError < 5.0, // Valid if error < 5%
      };

      // Store calibration
      this.torqueCalibration.set(motorId, calibration);

      logger.info(`Torque calibration completed for motor ${motorId}`, {
        torqueConstant: torqueConstant.toFixed(5),
        calibrationError: calibrationError.toFixed(2),
        isValid: calibration.isValid,
      });

      return {
        success: true,
        calibration,
        quality: calibrationError < 2.0 ? 'excellent' : calibrationError < 5.0 ? 'good' : 'poor',
      };
    } catch (error) {
      logger.error(`Failed to calibrate torque sensor for motor ${motorId}`, {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update motor specifications
   * @param {string} motorId - Motor identifier
   * @param {Object} specifications - Motor specifications
   */
  updateMotorSpecifications(motorId, specifications) {
    const { ratedTorque, maxContinuousTorque, peakTorque, torqueConstant, efficiency } =
      specifications;

    if (ratedTorque !== undefined) {
      this.ratedTorque.set(motorId, ratedTorque);
    }

    // Update calibration if torque constant or efficiency provided
    if (torqueConstant !== undefined || efficiency !== undefined) {
      const currentCalibration = this.torqueCalibration.get(motorId) || {};
      const updatedCalibration = {
        ...currentCalibration,
        torqueConstant: torqueConstant || currentCalibration.torqueConstant,
        efficiency: efficiency || currentCalibration.efficiency,
        calibrationDate: new Date(),
        calibrationMethod: 'manual_update',
      };

      this.torqueCalibration.set(motorId, updatedCalibration);
    }

    logger.info(`Updated motor specifications for ${motorId}`, specifications);
  }

  /**
   * Get calibration data for a motor
   * @param {string} motorId - Motor identifier
   * @returns {Object} Calibration data
   */
  getCalibrationData(motorId) {
    return this.torqueCalibration.get(motorId) || null;
  }

  /**
   * Get all motor specifications
   * @returns {Object} Map of motor specifications
   */
  getAllMotorSpecs() {
    const specs = {};

    for (const [motorId, ratedTorque] of this.ratedTorque.entries()) {
      const calibration = this.torqueCalibration.get(motorId);
      specs[motorId] = {
        ratedTorque,
        calibration,
      };
    }

    return specs;
  }

  /**
   * Validate torque readings for accuracy
   * @param {string} motorId - Motor identifier
   * @param {number} expectedTorque - Expected torque value (Nm)
   * @returns {Object} Validation results
   */
  async validateTorqueReading(motorId, expectedTorque) {
    try {
      // Take several readings
      const readings = [];
      for (let i = 0; i < 5; i++) {
        const reading = await this.readMotorTorque(motorId);
        readings.push(reading.currentTorque);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Calculate statistics
      const averageTorque = readings.reduce((sum, torque) => sum + torque, 0) / readings.length;
      const error = (Math.abs(averageTorque - expectedTorque) / expectedTorque) * 100;

      const validation = {
        expectedTorque,
        measuredTorque: averageTorque,
        error: parseFloat(error.toFixed(2)),
        accuracy: error < 5.0 ? 'good' : error < 10.0 ? 'acceptable' : 'poor',
        readings,
      };

      logger.info(`Torque validation for motor ${motorId}`, validation);

      return validation;
    } catch (error) {
      logger.error(`Failed to validate torque reading for motor ${motorId}`, {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Reset calibration for a motor
   * @param {string} motorId - Motor identifier
   */
  resetCalibration(motorId) {
    this.setDefaultCalibration(motorId);
    this.filteredCurrent.set(motorId, 0);
    this.filteredTorque.set(motorId, 0);

    logger.info(`Reset calibration for motor ${motorId}`);
  }

  /**
   * Get diagnostic information
   * @returns {Object} Diagnostic data
   */
  getDiagnostics() {
    return {
      motorsMonitored: Array.from(this.torqueCalibration.keys()),
      simulationMode: this.config.simulationMode,
      calibrationStatus: Array.from(this.torqueCalibration.entries()).map(([motorId, cal]) => ({
        motorId,
        isCalibrated: cal.isValid,
        calibrationDate: cal.calibrationDate,
        torqueConstant: cal.torqueConstant,
      })),
      lastReadings: Object.fromEntries(this.lastReadings),
      filterConfiguration: {
        currentFilterAlpha: this.config.currentFilterAlpha,
        torqueFilterAlpha: this.config.torqueFilterAlpha,
      },
    };
  }
}

module.exports = MKSTorqueMonitor;
