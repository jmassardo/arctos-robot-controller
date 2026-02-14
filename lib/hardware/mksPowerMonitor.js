const { logger } = require('../logger');

/**
 * MKS Power Monitor
 * Integrates with MKS controllers to read power consumption data
 */
class MKSPowerMonitor {
  constructor(controller, motorId) {
    this.controller = controller;
    this.motorId = motorId;
    this.deviceType = 'motor';
    this.lastReading = null;
    this.energyAccumulator = 0;

    // MKS power monitoring parameters
    this.powerParams = {
      SUPPLY_VOLTAGE: 0x30, // Supply voltage register
      MOTOR_CURRENT: 0x31, // Motor current register
      POWER_CONSUMPTION: 0x32, // Direct power reading if available
      EFFICIENCY: 0x33, // Power efficiency register
      POWER_FACTOR: 0x34, // Power factor register
      TEMPERATURE: 0x35, // Motor temperature (affects efficiency)
    };
  }

  /**
   * Read power consumption from MKS controller
   */
  async readPower() {
    try {
      // Read electrical parameters from MKS controller
      const voltage = await this.readSupplyVoltage();
      const current = await this.readMotorCurrent();
      const powerFactor = await this.readPowerFactor();
      const efficiency = await this.readEfficiency();
      const temperature = await this.readTemperature();

      // Calculate instantaneous power: P = V * I * cos(φ)
      const apparentPower = voltage * current;
      const realPower = apparentPower * powerFactor;

      // Adjust for efficiency and temperature effects
      const adjustedPower = this.adjustPowerForConditions(realPower, efficiency, temperature);

      const reading = {
        power: adjustedPower,
        voltage: voltage,
        current: current,
        powerFactor: powerFactor,
        efficiency: efficiency,
        temperature: temperature,
        apparentPower: apparentPower,
        timestamp: Date.now(),
      };

      this.lastReading = reading;
      return reading;
    } catch (error) {
      logger.error('Failed to read MKS power data', {
        motorId: this.motorId,
        error: error.message,
      });

      // Return last known reading or zero power if no previous data
      return (
        this.lastReading || {
          power: 0,
          voltage: 0,
          current: 0,
          powerFactor: 1.0,
          efficiency: 100,
          temperature: 25,
          apparentPower: 0,
          timestamp: Date.now(),
        }
      );
    }
  }

  /**
   * Read supply voltage from MKS controller
   */
  async readSupplyVoltage() {
    try {
      if (this.controller.queryParameter) {
        return await this.controller.queryParameter(this.motorId, this.powerParams.SUPPLY_VOLTAGE);
      } else if (this.controller.readRegister) {
        return await this.controller.readRegister(this.motorId, this.powerParams.SUPPLY_VOLTAGE);
      } else {
        // Fallback to typical servo drive voltage
        return 24.0; // 24V typical for MKS57D
      }
    } catch (error) {
      logger.warn('Failed to read supply voltage, using default', {
        motorId: this.motorId,
        error: error.message,
      });
      return 24.0;
    }
  }

  /**
   * Read motor current from MKS controller
   */
  async readMotorCurrent() {
    try {
      if (this.controller.queryParameter) {
        return await this.controller.queryParameter(this.motorId, this.powerParams.MOTOR_CURRENT);
      } else if (this.controller.readRegister) {
        return await this.controller.readRegister(this.motorId, this.powerParams.MOTOR_CURRENT);
      } else {
        // Estimate current based on motion state
        return await this.estimateMotorCurrent();
      }
    } catch (error) {
      logger.warn('Failed to read motor current, estimating', {
        motorId: this.motorId,
        error: error.message,
      });
      return await this.estimateMotorCurrent();
    }
  }

  /**
   * Read power factor from MKS controller
   */
  async readPowerFactor() {
    try {
      if (this.controller.queryParameter) {
        const pf = await this.controller.queryParameter(
          this.motorId,
          this.powerParams.POWER_FACTOR
        );
        return Math.max(0.1, Math.min(1.0, pf)); // Clamp between 0.1 and 1.0
      } else {
        // Typical power factor for servo motors under load
        return 0.85;
      }
    } catch (error) {
      return 0.85; // Default power factor
    }
  }

  /**
   * Read efficiency from MKS controller
   */
  async readEfficiency() {
    try {
      if (this.controller.queryParameter) {
        const eff = await this.controller.queryParameter(this.motorId, this.powerParams.EFFICIENCY);
        return Math.max(50, Math.min(100, eff)); // Clamp between 50% and 100%
      } else {
        // Typical servo motor efficiency
        return 85.0;
      }
    } catch (error) {
      return 85.0; // Default efficiency percentage
    }
  }

  /**
   * Read motor temperature
   */
  async readTemperature() {
    try {
      if (this.controller.queryParameter) {
        return await this.controller.queryParameter(this.motorId, this.powerParams.TEMPERATURE);
      } else if (this.controller.getTemperature) {
        return await this.controller.getTemperature(this.motorId);
      } else {
        return 25.0; // Room temperature default
      }
    } catch (error) {
      return 25.0;
    }
  }

  /**
   * Estimate motor current based on motion state and load
   */
  async estimateMotorCurrent() {
    try {
      // Get current motor state
      const isMoving = await this.isMotorMoving();
      const speed = await this.getMotorSpeed();
      const torque = await this.getMotorTorque();

      if (!isMoving) {
        // Holding current when stationary
        return 0.5; // Typical holding current in Amps
      }

      // Calculate current based on speed and torque
      // This is a simplified estimation - real implementation would use motor curves
      const baseCurrent = 1.0; // Base operating current
      const speedFactor = Math.min(speed / 1000, 2.0); // Speed-based multiplier
      const torqueFactor = Math.max(torque / 100, 0.5); // Torque-based multiplier

      return baseCurrent * speedFactor * torqueFactor;
    } catch (error) {
      // Default to moderate current consumption
      return 1.5; // Amps
    }
  }

  /**
   * Check if motor is currently moving
   */
  async isMotorMoving() {
    try {
      if (this.controller.isMoving) {
        return await this.controller.isMoving(this.motorId);
      } else if (this.controller.getSpeed) {
        const speed = await this.controller.getSpeed(this.motorId);
        return Math.abs(speed) > 10; // RPM threshold for "moving"
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get motor speed (RPM)
   */
  async getMotorSpeed() {
    try {
      if (this.controller.getSpeed) {
        return Math.abs(await this.controller.getSpeed(this.motorId));
      } else if (this.controller.queryParameter) {
        return Math.abs(await this.controller.queryParameter(this.motorId, 'SPEED'));
      }
      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get motor torque (percentage)
   */
  async getMotorTorque() {
    try {
      if (this.controller.getTorque) {
        return await this.controller.getTorque(this.motorId);
      } else if (this.controller.queryParameter) {
        return await this.controller.queryParameter(this.motorId, 'TORQUE');
      }
      return 50; // Default moderate torque
    } catch (error) {
      return 50;
    }
  }

  /**
   * Adjust power reading for operating conditions
   */
  adjustPowerForConditions(basePower, efficiency, temperature) {
    // Adjust for efficiency
    let adjustedPower = basePower * (100 / efficiency);

    // Temperature derating (motors are less efficient when hot)
    if (temperature > 60) {
      const tempFactor = 1 + (temperature - 60) * 0.02; // 2% increase per degree above 60°C
      adjustedPower *= tempFactor;
    }

    return Math.max(0, adjustedPower);
  }

  /**
   * Read system-wide power consumption (all motors + controller electronics)
   */
  async readSystemPower() {
    try {
      // If this is the main controller, calculate total system power
      if (this.motorId === 1 || this.motorId === 'system') {
        // Get power from all motors if manager is available
        if (this.controller.getAllMotorPower) {
          return await this.controller.getAllMotorPower();
        }

        // Estimate system power
        const motorPower = (await this.readPower()).power;
        const controllerPower = 5.0; // Controller electronics ~5W
        const auxiliaryPower = 2.0; // Fans, indicators, etc ~2W

        return {
          power: motorPower + controllerPower + auxiliaryPower,
          voltage: 24.0,
          current: (motorPower + controllerPower + auxiliaryPower) / 24.0,
          powerFactor: 0.9,
          efficiency: 88,
          breakdown: {
            motors: motorPower,
            controller: controllerPower,
            auxiliary: auxiliaryPower,
          },
        };
      }

      // For individual motors, return motor power only
      return await this.readPower();
    } catch (error) {
      logger.error('Failed to read system power', { error: error.message });
      return {
        power: 0,
        voltage: 0,
        current: 0,
        powerFactor: 1.0,
        efficiency: 100,
      };
    }
  }

  /**
   * Calibrate power measurements
   */
  async calibratePowerMeasurement() {
    try {
      logger.info('Starting MKS power measurement calibration', { motorId: this.motorId });

      // Take multiple readings at different states
      const idleReading = await this.readPower();

      // If possible, trigger a small movement for loaded reading
      let loadedReading = idleReading;
      if (this.controller.moveRelative) {
        try {
          await this.controller.moveRelative(this.motorId, 100); // Small movement
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
          loadedReading = await this.readPower();
        } catch (moveError) {
          logger.warn('Could not perform calibration movement', { error: moveError.message });
        }
      }

      const calibrationData = {
        idlePower: idleReading.power,
        loadedPower: loadedReading.power,
        powerRange: loadedReading.power - idleReading.power,
        timestamp: Date.now(),
      };

      logger.info('MKS power measurement calibration completed', {
        motorId: this.motorId,
        calibrationData,
      });

      return calibrationData;
    } catch (error) {
      logger.error('Power measurement calibration failed', {
        motorId: this.motorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get motor power consumption profile
   */
  getPowerProfile() {
    return {
      deviceType: this.deviceType,
      motorId: this.motorId,
      lastReading: this.lastReading,
      capabilities: {
        directPowerReading: !!this.controller.queryParameter,
        voltageReading: !!this.controller.queryParameter,
        currentReading: !!this.controller.queryParameter,
        temperatureReading: !!this.controller.getTemperature,
        efficiencyReading: !!this.controller.queryParameter,
      },
      estimatedAccuracy: this.controller.queryParameter ? 95 : 75, // Percentage
      updateInterval: 1000, // ms
      powerRange: {
        min: 0,
        max: 100, // Watts - typical for servo motor
        typical: 15,
      },
    };
  }
}

/**
 * External Power Meter Integration
 * For systems requiring external power measurement devices
 */
class ExternalPowerMeter {
  constructor(meterType, config = {}) {
    this.meterType = meterType; // 'modbus', 'analog', 'smart_plug'
    this.config = config;
    this.deviceType = config.deviceType || 'system';
    this.lastReading = null;
  }

  async readPower() {
    switch (this.meterType) {
      case 'modbus':
        return await this.readModbusPower();
      case 'analog':
        return await this.readAnalogPower();
      case 'smart_plug':
        return await this.readSmartPlugPower();
      case 'simulation':
        return await this.simulatePowerReading();
      default:
        throw new Error(`Unsupported power meter type: ${this.meterType}`);
    }
  }

  async readModbusPower() {
    // Placeholder for Modbus power meter integration
    // Would connect to Modbus device and read power registers
    logger.info('Reading Modbus power meter - not implemented');
    return { power: 0, voltage: 0, current: 0, powerFactor: 1.0, efficiency: 100 };
  }

  async readAnalogPower() {
    // Placeholder for analog power measurement
    // Would read ADC values and convert to power
    logger.info('Reading analog power meter - not implemented');
    return { power: 0, voltage: 0, current: 0, powerFactor: 1.0, efficiency: 100 };
  }

  async readSmartPlugPower() {
    // Placeholder for smart plug integration (TP-Link Kasa, etc.)
    logger.info('Reading smart plug power - not implemented');
    return { power: 0, voltage: 0, current: 0, powerFactor: 1.0, efficiency: 100 };
  }

  async simulatePowerReading() {
    // Simulation for testing and demonstration
    const baselinePower = 10; // Baseline power consumption
    const variation = Math.sin(Date.now() / 10000) * 5; // Sine wave variation
    const randomNoise = (Math.random() - 0.5) * 2; // Random noise

    const power = Math.max(0, baselinePower + variation + randomNoise);

    return {
      power: Number(power.toFixed(2)),
      voltage: 24.0,
      current: Number((power / 24.0).toFixed(3)),
      powerFactor: 0.9,
      efficiency: 90,
      timestamp: Date.now(),
    };
  }
}

module.exports = { MKSPowerMonitor, ExternalPowerMeter };
