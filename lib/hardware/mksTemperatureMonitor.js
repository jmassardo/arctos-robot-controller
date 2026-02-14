/**
 * MKS Temperature Monitor
 * Monitors temperature for MKS stepper motor controllers
 */

const { EventEmitter } = require('events');

// MKS temperature query commands
const MKS_TEMP_COMMANDS = {
  READ_DRIVER_TEMP: 0x90, // Driver IC temperature
  READ_MOTOR_TEMP: 0x91, // Motor winding temperature
  READ_AMBIENT_TEMP: 0x92, // Ambient temperature
};

/**
 * MKS Temperature Monitor Class
 */
class MKSTemperatureMonitor extends EventEmitter {
  constructor(controller, options = {}) {
    super();

    this.controller = controller;
    this.temperatureReadings = new Map();
    this.thresholds = {
      warning: options.warningTemp || 60,
      critical: options.criticalTemp || 75,
      emergency: options.emergencyTemp || 85,
    };

    this.monitoringInterval = options.monitoringInterval || 1000; // 1 second
    this.isMonitoring = false;
    this.intervalId = null;
    this.simulationMode = !controller || controller.simulationMode;

    // Simulation data for testing when hardware not available
    this.simulationData = new Map();
  }

  /**
   * Start temperature monitoring
   */
  startMonitoring(motorIds = []) {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;

    // Initialize temperature readings for each motor
    motorIds.forEach(motorId => {
      this.temperatureReadings.set(motorId, {
        driverTemp: null,
        motorTemp: null,
        ambientTemp: null,
        lastUpdate: null,
        alertLevel: 'normal',
      });

      // Initialize simulation data if in simulation mode
      if (this.simulationMode) {
        this.simulationData.set(motorId, {
          baseTemp: 25 + Math.random() * 10, // 25-35°C base
          variation: 0,
        });
      }
    });

    this.intervalId = setInterval(() => {
      this._performTemperatureReading(motorIds);
    }, this.monitoringInterval);

    this.emit('monitoring:started', { motorIds });
    console.log('MKS Temperature monitoring started for motors:', motorIds);
  }

  /**
   * Stop temperature monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.emit('monitoring:stopped');
    console.log('MKS Temperature monitoring stopped');
  }

  /**
   * Read temperature from a specific motor
   */
  async readTemperature(motorId, tempType = 'READ_MOTOR_TEMP') {
    try {
      if (this.simulationMode) {
        return this._simulateTemperatureReading(motorId, tempType);
      }

      // Query MKS controller for temperature
      const command = {
        id: motorId,
        data: [MKS_TEMP_COMMANDS[tempType], 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
      };

      const response = await this.controller.sendCommand(command);
      return this._parseTemperatureResponse(response, tempType);
    } catch (error) {
      console.error(`Failed to read temperature for motor ${motorId}:`, error.message);
      this.emit('error', {
        motorId,
        tempType,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Get current temperature readings for all motors
   */
  getCurrentReadings() {
    const readings = {};
    this.temperatureReadings.forEach((reading, motorId) => {
      readings[motorId] = { ...reading };
    });
    return readings;
  }

  /**
   * Update temperature thresholds
   */
  updateThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    this.emit('thresholds:updated', this.thresholds);
  }

  /**
   * Perform temperature reading for all motors
   */
  async _performTemperatureReading(motorIds) {
    for (const motorId of motorIds) {
      try {
        // Read all temperature types
        const [driverTemp, motorTemp, ambientTemp] = await Promise.all([
          this.readTemperature(motorId, 'READ_DRIVER_TEMP'),
          this.readTemperature(motorId, 'READ_MOTOR_TEMP'),
          this.readTemperature(motorId, 'READ_AMBIENT_TEMP'),
        ]);

        // Update readings
        const reading = {
          driverTemp,
          motorTemp,
          ambientTemp,
          lastUpdate: new Date(),
          alertLevel: this._determineAlertLevel(motorTemp || driverTemp),
        };

        this.temperatureReadings.set(motorId, reading);

        // Emit temperature update event
        this.emit('temperature:update', {
          motorId,
          ...reading,
        });

        // Check for temperature alerts
        this._checkTemperatureAlerts(motorId, reading);
      } catch (error) {
        console.error(`Error reading temperature for motor ${motorId}:`, error);
      }
    }
  }

  /**
   * Simulate temperature reading for testing
   */
  _simulateTemperatureReading(motorId, tempType) {
    const simData = this.simulationData.get(motorId);
    if (!simData) {
      return null;
    }

    // Simulate temperature with some variation
    simData.variation += (Math.random() - 0.5) * 2; // ±1°C variation
    simData.variation = Math.max(-10, Math.min(10, simData.variation)); // Limit variation

    let temperature = simData.baseTemp + simData.variation;

    // Add type-specific offsets
    switch (tempType) {
      case 'READ_DRIVER_TEMP':
        temperature += 5; // Driver typically warmer
        break;
      case 'READ_AMBIENT_TEMP':
        temperature -= 10; // Ambient cooler
        break;
      default: // Motor temperature
        break;
    }

    // Slowly increase base temperature to simulate heating
    simData.baseTemp += 0.01;

    return Math.round(temperature * 10) / 10; // Round to 1 decimal
  }

  /**
   * Parse temperature response from MKS controller
   */
  _parseTemperatureResponse(response, tempType) {
    if (!response || !response.data) {
      return null;
    }

    // MKS temperature response format: [command, temp_high, temp_low, ...]
    const tempHigh = response.data[1] || 0;
    const tempLow = response.data[2] || 0;

    // Convert to temperature (assuming 0.1°C resolution)
    const temperature = ((tempHigh << 8) | tempLow) / 10;

    return temperature;
  }

  /**
   * Determine alert level based on temperature
   */
  _determineAlertLevel(temperature) {
    if (!temperature || isNaN(temperature)) {
      return 'normal';
    }

    if (temperature >= this.thresholds.emergency) {
      return 'emergency';
    } else if (temperature >= this.thresholds.critical) {
      return 'critical';
    } else if (temperature >= this.thresholds.warning) {
      return 'warning';
    }

    return 'normal';
  }

  /**
   * Check for temperature alerts and emit events
   */
  _checkTemperatureAlerts(motorId, reading) {
    const maxTemp = Math.max(reading.driverTemp || 0, reading.motorTemp || 0);

    const alertLevel = this._determineAlertLevel(maxTemp);
    const previousReading = this.temperatureReadings.get(motorId);
    const previousAlertLevel = previousReading?.alertLevel || 'normal';

    // Only emit alert if level has changed or is critical/emergency
    if (alertLevel !== previousAlertLevel || ['critical', 'emergency'].includes(alertLevel)) {
      this.emit('temperature:alert', {
        motorId,
        temperature: maxTemp,
        alertLevel,
        previousLevel: previousAlertLevel,
        reading,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get temperature trend for a motor
   */
  getTemperatureTrend(motorId, readings = []) {
    if (readings.length < 3) {
      return 'stable';
    }

    // Calculate trend from last few readings
    const recent = readings.slice(-3);
    const temps = recent.map(r => r.temperature);

    const increasing = temps[2] > temps[0] + 1; // >1°C increase
    const decreasing = temps[2] < temps[0] - 1; // >1°C decrease

    if (increasing) {
      return 'rising';
    }
    if (decreasing) {
      return 'falling';
    }
    return 'stable';
  }
}

module.exports = MKSTemperatureMonitor;
