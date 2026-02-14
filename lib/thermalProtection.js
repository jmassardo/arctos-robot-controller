/**
 * Thermal Protection System
 * Handles thermal protection logic and emergency responses
 */

const { EventEmitter } = require('events');
const { logger } = require('./logger');

/**
 * Thermal Protection Class
 */
class ThermalProtection extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      emergencyStopEnabled: options.emergencyStopEnabled !== false,
      powerReductionEnabled: options.powerReductionEnabled !== false,
      cooldownTime: options.cooldownTime || 60000, // 1 minute
      maxConsecutiveAlerts: options.maxConsecutiveAlerts || 3,
      ...options,
    };

    this.protectionStates = new Map(); // motorId -> protection state
    this.emergencyStopCallback = null;
    this.powerReductionCallback = null;
    this.motorShutdownCallback = null;

    this.isEnabled = true;
    this.alertCounts = new Map(); // motorId -> consecutive alert count

    logger.info('Thermal Protection System initialized');
  }

  /**
   * Set emergency stop callback
   */
  setEmergencyStopCallback(callback) {
    this.emergencyStopCallback = callback;
  }

  /**
   * Set power reduction callback
   */
  setPowerReductionCallback(callback) {
    this.powerReductionCallback = callback;
  }

  /**
   * Set motor shutdown callback
   */
  setMotorShutdownCallback(callback) {
    this.motorShutdownCallback = callback;
  }

  /**
   * Enable thermal protection
   */
  enable() {
    this.isEnabled = true;
    logger.info('Thermal Protection System enabled');
    this.emit('protection:enabled');
  }

  /**
   * Disable thermal protection
   */
  disable() {
    this.isEnabled = false;
    logger.warn('Thermal Protection System disabled');
    this.emit('protection:disabled');
  }

  /**
   * Handle temperature alert
   */
  async handleTemperatureAlert(alertData) {
    if (!this.isEnabled) {
      return;
    }

    const { motorId, alertLevel, temperature, timestamp } = alertData;

    try {
      // Update alert count
      const currentCount = this.alertCounts.get(motorId) || 0;
      this.alertCounts.set(motorId, currentCount + 1);

      // Update protection state
      this.protectionStates.set(motorId, {
        alertLevel,
        temperature,
        timestamp,
        actionTaken: false,
        cooldownStart: null,
      });

      // Take action based on alert level
      await this._takeProtectionAction(motorId, alertLevel, temperature);

      // Log protection action
      logger.warn(
        `Thermal protection triggered for motor ${motorId}: ${alertLevel} (${temperature}°C)`
      );

      this.emit('protection:action', {
        motorId,
        alertLevel,
        temperature,
        timestamp,
      });
    } catch (error) {
      logger.error(`Error handling thermal protection for motor ${motorId}:`, error);
      this.emit('protection:error', { motorId, error: error.message });
    }
  }

  /**
   * Handle temperature normal (alert cleared)
   */
  handleTemperatureNormal(motorId, temperature) {
    const protectionState = this.protectionStates.get(motorId);

    if (protectionState && protectionState.actionTaken) {
      // Start cooldown period
      protectionState.cooldownStart = new Date();
      this.protectionStates.set(motorId, protectionState);

      logger.info(`Motor ${motorId} temperature normalized (${temperature}°C), starting cooldown`);

      // Schedule restoration after cooldown
      setTimeout(() => {
        this._restoreMotorOperation(motorId);
      }, this.options.cooldownTime);
    }

    // Reset alert count
    this.alertCounts.set(motorId, 0);
  }

  /**
   * Get protection status for a motor
   */
  getProtectionStatus(motorId) {
    return this.protectionStates.get(motorId) || null;
  }

  /**
   * Get protection status for all motors
   */
  getAllProtectionStatus() {
    const status = {};
    this.protectionStates.forEach((state, motorId) => {
      status[motorId] = state;
    });
    return status;
  }

  /**
   * Force reset protection for a motor
   */
  resetProtection(motorId) {
    this.protectionStates.delete(motorId);
    this.alertCounts.set(motorId, 0);

    logger.info(`Thermal protection reset for motor ${motorId}`);
    this.emit('protection:reset', { motorId });
  }

  /**
   * Force reset all protection states
   */
  resetAllProtection() {
    this.protectionStates.clear();
    this.alertCounts.clear();

    logger.info('All thermal protection states reset');
    this.emit('protection:reset:all');
  }

  // Private methods

  /**
   * Take protection action based on alert level
   */
  async _takeProtectionAction(motorId, alertLevel, temperature) {
    const protectionState = this.protectionStates.get(motorId);

    switch (alertLevel) {
      case 'warning':
        await this._handleWarningLevel(motorId, temperature);
        break;

      case 'critical':
        await this._handleCriticalLevel(motorId, temperature);
        break;

      case 'emergency':
        await this._handleEmergencyLevel(motorId, temperature);
        break;
    }

    // Mark action as taken
    if (protectionState) {
      protectionState.actionTaken = true;
      this.protectionStates.set(motorId, protectionState);
    }
  }

  /**
   * Handle warning level protection
   */
  async _handleWarningLevel(motorId, temperature) {
    // Log warning but take no immediate action
    logger.warn(`Temperature warning for motor ${motorId}: ${temperature}°C`);

    this.emit('protection:warning', {
      motorId,
      temperature,
      action: 'logged',
    });
  }

  /**
   * Handle critical level protection
   */
  async _handleCriticalLevel(motorId, temperature) {
    if (!this.options.powerReductionEnabled) {
      return;
    }

    try {
      // Reduce motor power to 70%
      if (this.powerReductionCallback) {
        await this.powerReductionCallback(motorId, 0.7);

        logger.warn(
          `Motor ${motorId} power reduced to 70% due to critical temperature: ${temperature}°C`
        );

        this.emit('protection:power_reduced', {
          motorId,
          temperature,
          powerLevel: 0.7,
        });
      }
    } catch (error) {
      logger.error(`Failed to reduce power for motor ${motorId}:`, error);
      throw error;
    }
  }

  /**
   * Handle emergency level protection
   */
  async _handleEmergencyLevel(motorId, temperature) {
    try {
      // Emergency stop if enabled
      if (this.options.emergencyStopEnabled && this.emergencyStopCallback) {
        await this.emergencyStopCallback();

        logger.error(
          `EMERGENCY STOP triggered due to motor ${motorId} overheating: ${temperature}°C`
        );

        this.emit('protection:emergency_stop', {
          motorId,
          temperature,
        });
      }

      // Shutdown specific motor
      if (this.motorShutdownCallback) {
        await this.motorShutdownCallback(motorId);

        logger.error(`Motor ${motorId} shutdown due to emergency temperature: ${temperature}°C`);

        this.emit('protection:motor_shutdown', {
          motorId,
          temperature,
        });
      }
    } catch (error) {
      logger.error(`Failed to execute emergency protection for motor ${motorId}:`, error);
      throw error;
    }
  }

  /**
   * Restore motor operation after cooldown
   */
  async _restoreMotorOperation(motorId) {
    const protectionState = this.protectionStates.get(motorId);

    if (!protectionState || !protectionState.cooldownStart) {
      return;
    }

    const cooldownElapsed = Date.now() - protectionState.cooldownStart.getTime();

    if (cooldownElapsed >= this.options.cooldownTime) {
      try {
        // Restore power if it was reduced
        if (protectionState.alertLevel === 'critical' && this.powerReductionCallback) {
          await this.powerReductionCallback(motorId, 1.0); // Full power

          logger.info(`Motor ${motorId} power restored to 100% after cooldown`);

          this.emit('protection:power_restored', {
            motorId,
            powerLevel: 1.0,
          });
        }

        // Clear protection state
        this.protectionStates.delete(motorId);

        logger.info(`Motor ${motorId} thermal protection cleared after cooldown`);

        this.emit('protection:restored', {
          motorId,
          cooldownTime: cooldownElapsed,
        });
      } catch (error) {
        logger.error(`Failed to restore motor ${motorId} operation:`, error);
        this.emit('protection:restore_failed', { motorId, error: error.message });
      }
    }
  }

  /**
   * Check if consecutive alert limit exceeded
   */
  _isConsecutiveAlertLimitExceeded(motorId) {
    const count = this.alertCounts.get(motorId) || 0;
    return count >= this.options.maxConsecutiveAlerts;
  }
}

// Utility functions for thermal protection actions
const ThermalProtectionActions = {
  /**
   * Emergency stop function
   */
  emergencyStop: async function () {
    console.log('EMERGENCY STOP: All motor operations halted due to overheating');
    // Implementation would interface with actual motion controller
    // For now, this is a placeholder
    return true;
  },

  /**
   * Reduce motor power
   */
  reduceMotorPower: async function (motorId, powerLevel) {
    console.log(`Reducing motor ${motorId} power to ${powerLevel * 100}%`);
    // Implementation would interface with MKS controller to reduce current
    // For now, this is a placeholder
    return true;
  },

  /**
   * Shutdown motor
   */
  shutdownMotor: async function (motorId) {
    console.log(`Shutting down motor ${motorId} due to overheating`);
    // Implementation would disable motor completely
    // For now, this is a placeholder
    return true;
  },
};

module.exports = {
  ThermalProtection,
  ThermalProtectionActions,
};
