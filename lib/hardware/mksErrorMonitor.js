const EventEmitter = require('events');
const { logger } = require('../logger');

/**
 * MKS Error Monitor
 * Monitors MKS controllers for hardware errors and status changes
 */
class MKSErrorMonitor extends EventEmitter {
  constructor(controllerId, controllerType, config = {}) {
    super();

    this.controllerId = controllerId;
    this.controllerType = controllerType;
    this.config = {
      pollingInterval: 1000, // 1 second
      retryCount: 3,
      retryDelay: 500, // 0.5 seconds
      communicationTimeout: 5000, // 5 seconds
      ...config,
    };

    this.lastErrorState = new Map();
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.consecutiveFailures = 0;

    // Define error bit mappings for different controller types
    this.errorBitMappings = this.getErrorBitMappings(controllerType);

    // Mock controller interface for simulation
    this.mockErrors = new Map();
    this.simulationMode = config.simulationMode || false;
  }

  /**
   * Get error bit mappings for controller type
   */
  getErrorBitMappings(controllerType) {
    const mappings = {
      MKS57D: {
        0x01: { code: 'E001', type: 'OVERVOLTAGE', severity: 'critical' },
        0x02: { code: 'E002', type: 'UNDERVOLTAGE', severity: 'critical' },
        0x04: { code: 'E003', type: 'OVERCURRENT', severity: 'warning' },
        0x08: { code: 'E004', type: 'OVERTEMPERATURE_MOTOR', severity: 'critical' },
        0x10: { code: 'E005', type: 'OVERTEMPERATURE_DRIVER', severity: 'critical' },
        0x20: { code: 'E006', type: 'ENCODER_ERROR', severity: 'critical' },
        0x40: { code: 'E007', type: 'POSITION_ERROR', severity: 'warning' },
        0x80: { code: 'E008', type: 'COMMUNICATION_TIMEOUT', severity: 'warning' },
        0x100: { code: 'E009', type: 'MOTOR_STALL', severity: 'warning' },
        0x200: { code: 'E010', type: 'EMERGENCY_STOP', severity: 'fatal' },
        0x400: { code: 'E011', type: 'LIMIT_SWITCH', severity: 'warning' },
        0x800: { code: 'E012', type: 'VELOCITY_LIMIT', severity: 'warning' },
        0x1000: { code: 'E013', type: 'ACCELERATION_LIMIT', severity: 'info' },
        0x2000: { code: 'E014', type: 'MEMORY_ERROR', severity: 'fatal' },
        0x4000: { code: 'E015', type: 'CONFIG_ERROR', severity: 'critical' },
      },
      MKS42D: {
        0x01: { code: 'E001', type: 'OVERVOLTAGE', severity: 'critical' },
        0x02: { code: 'E002', type: 'UNDERVOLTAGE', severity: 'critical' },
        0x04: { code: 'E003', type: 'STEPPER_OVERCURRENT', severity: 'warning' },
        0x08: { code: 'E004', type: 'DRIVER_OVERTEMPERATURE', severity: 'critical' },
        0x10: { code: 'E005', type: 'STEP_LOSS', severity: 'warning' },
      },
    };

    return mappings[controllerType] || {};
  }

  /**
   * Start error monitoring
   */
  async startMonitoring() {
    if (this.isMonitoring) {
      return;
    }

    try {
      this.isMonitoring = true;
      this.consecutiveFailures = 0;

      // Start periodic error checking
      this.monitoringInterval = setInterval(async () => {
        try {
          await this.checkForErrors();
        } catch (error) {
          this.handleMonitoringError(error);
        }
      }, this.config.pollingInterval);

      logger.info('Started error monitoring for controller', {
        controllerId: this.controllerId,
        controllerType: this.controllerType,
      });

      // Initial error check
      await this.checkForErrors();
    } catch (error) {
      logger.error('Failed to start error monitoring', {
        controllerId: this.controllerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Stop error monitoring
   */
  async stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.info('Stopped error monitoring for controller', {
      controllerId: this.controllerId,
    });
  }

  /**
   * Check for errors on the controller
   */
  async checkForErrors() {
    try {
      // Read error status from controller
      const errorStatus = await this.readErrorStatus();

      // Parse errors from status
      const currentErrors = this.parseErrorStatus(errorStatus);

      // Compare with last known state
      await this.compareErrorStates(currentErrors);

      // Update last error state
      this.lastErrorState.clear();
      for (const error of currentErrors) {
        this.lastErrorState.set(error.code, error);
      }

      // Reset consecutive failures on successful check
      this.consecutiveFailures = 0;
    } catch (error) {
      this.consecutiveFailures++;

      if (this.consecutiveFailures >= this.config.retryCount) {
        this.emit(
          'communicationError',
          new Error(
            `Failed to check errors after ${this.consecutiveFailures} attempts: ${error.message}`
          )
        );
      }

      throw error;
    }
  }

  /**
   * Read error status from controller
   */
  async readErrorStatus() {
    try {
      if (this.simulationMode) {
        return this.simulateErrorStatus();
      }

      // For MKS controllers, query error status register
      // This would be implemented with actual hardware communication
      const errorStatus = await this.queryController('READ_ERROR_STATUS');

      return errorStatus;
    } catch (error) {
      logger.debug('Error reading status from controller', {
        controllerId: this.controllerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Query controller with timeout and retry logic
   */
  async queryController(command, params = {}) {
    let lastError;

    for (let attempt = 0; attempt < this.config.retryCount; attempt++) {
      try {
        // Simulate controller communication delay
        await new Promise(resolve => setTimeout(resolve, 50));

        // TODO: Replace with actual MKS controller communication
        if (Math.random() < 0.1) {
          // 10% chance of communication error
          throw new Error('Communication timeout');
        }

        // Return simulated error status
        return this.generateMockErrorStatus();
      } catch (error) {
        lastError = error;

        if (attempt < this.config.retryCount - 1) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Parse error status register
   */
  parseErrorStatus(rawStatus) {
    const errors = [];

    if (typeof rawStatus !== 'number') {
      return errors;
    }

    // Check each error bit
    for (const [bitMask, errorInfo] of Object.entries(this.errorBitMappings)) {
      const mask = parseInt(bitMask);

      if (rawStatus & mask) {
        errors.push({
          code: errorInfo.code,
          type: errorInfo.type,
          severity: errorInfo.severity,
          bitMask: mask,
          rawStatus,
          timestamp: new Date(),
          controllerId: this.controllerId,
          controllerType: this.controllerType,
        });
      }
    }

    return errors;
  }

  /**
   * Compare current errors with last known state
   */
  async compareErrorStates(currentErrors) {
    const currentErrorCodes = new Set(currentErrors.map(e => e.code));
    const lastErrorCodes = new Set(this.lastErrorState.keys());

    // Find new errors
    const newErrors = currentErrors.filter(error => !lastErrorCodes.has(error.code));

    // Find cleared errors
    const clearedErrors = Array.from(lastErrorCodes).filter(code => !currentErrorCodes.has(code));

    // Emit events for new errors
    for (const error of newErrors) {
      logger.debug('New error detected', {
        controllerId: this.controllerId,
        errorCode: error.code,
        errorType: error.type,
        severity: error.severity,
      });

      this.emit('error', error);
    }

    // Emit events for cleared errors
    for (const errorCode of clearedErrors) {
      logger.debug('Error cleared', {
        controllerId: this.controllerId,
        errorCode,
      });

      this.emit('errorCleared', errorCode);
    }
  }

  /**
   * Handle monitoring errors
   */
  handleMonitoringError(error) {
    logger.error('Error during monitoring check', {
      controllerId: this.controllerId,
      error: error.message,
      consecutiveFailures: this.consecutiveFailures,
    });

    if (this.consecutiveFailures >= this.config.retryCount) {
      this.emit('communicationError', error);
    }
  }

  /**
   * Simulate error status for testing
   */
  simulateErrorStatus() {
    // Generate random error status for simulation
    let status = 0;

    // Check if we have any mock errors set
    for (const [errorCode, isActive] of this.mockErrors.entries()) {
      if (isActive) {
        const bitMask = this.findBitMaskForError(errorCode);
        if (bitMask) {
          status |= bitMask;
        }
      }
    }

    // Randomly generate some errors for testing (5% chance)
    if (Math.random() < 0.05) {
      const errorBits = Object.keys(this.errorBitMappings).map(mask => parseInt(mask));
      if (errorBits.length > 0) {
        const randomBit = errorBits[Math.floor(Math.random() * errorBits.length)];
        status |= randomBit;
      }
    }

    return status;
  }

  /**
   * Generate mock error status for development
   */
  generateMockErrorStatus() {
    // Return 0 for no errors most of the time
    if (Math.random() < 0.95) {
      return 0;
    }

    // Generate some test errors
    const possibleErrors = Object.keys(this.errorBitMappings).map(mask => parseInt(mask));

    if (possibleErrors.length === 0) {
      return 0;
    }

    // Pick a random error
    const randomError = possibleErrors[Math.floor(Math.random() * possibleErrors.length)];
    return randomError;
  }

  /**
   * Find bit mask for error code
   */
  findBitMaskForError(errorCode) {
    for (const [bitMask, errorInfo] of Object.entries(this.errorBitMappings)) {
      if (errorInfo.code === errorCode) {
        return parseInt(bitMask);
      }
    }
    return null;
  }

  /**
   * Set mock error for testing
   */
  setMockError(errorCode, isActive = true) {
    this.mockErrors.set(errorCode, isActive);

    logger.debug('Mock error set', {
      controllerId: this.controllerId,
      errorCode,
      isActive,
    });
  }

  /**
   * Clear mock error
   */
  clearMockError(errorCode) {
    this.mockErrors.delete(errorCode);

    logger.debug('Mock error cleared', {
      controllerId: this.controllerId,
      errorCode,
    });
  }

  /**
   * Get controller status
   */
  getStatus() {
    return {
      controllerId: this.controllerId,
      controllerType: this.controllerType,
      isMonitoring: this.isMonitoring,
      consecutiveFailures: this.consecutiveFailures,
      lastErrorCount: this.lastErrorState.size,
      pollingInterval: this.config.pollingInterval,
    };
  }

  /**
   * Force error check
   */
  async forceErrorCheck() {
    try {
      await this.checkForErrors();
      return true;
    } catch (error) {
      logger.error('Failed to force error check', {
        controllerId: this.controllerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get current active errors
   */
  getCurrentErrors() {
    return Array.from(this.lastErrorState.values());
  }

  /**
   * Test communication with controller
   */
  async testCommunication() {
    try {
      const startTime = Date.now();

      // Try to read controller status
      await this.queryController('PING');

      const responseTime = Date.now() - startTime;

      return {
        success: true,
        responseTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get error bit mapping for controller type
   */
  getErrorBitMapping() {
    return this.errorBitMappings;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };

    // Restart monitoring if interval changed and currently monitoring
    if (this.isMonitoring && newConfig.pollingInterval) {
      this.stopMonitoring();
      this.startMonitoring();
    }

    logger.info('Controller error monitor configuration updated', {
      controllerId: this.controllerId,
      newConfig,
    });
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    await this.stopMonitoring();

    this.lastErrorState.clear();
    this.mockErrors.clear();
    this.removeAllListeners();

    logger.debug('MKS Error Monitor cleaned up', {
      controllerId: this.controllerId,
    });
  }
}

module.exports = MKSErrorMonitor;
