/**
 * Modbus Device Configuration Templates
 * Provides predefined configurations for common industrial devices
 */

class ModbusDeviceConfig {
  constructor() {
    this.supportedDevices = new Map([
      ['generic_plc', this.createGenericPLCConfig()],
      ['temperature_sensor', this.createTemperatureSensorConfig()],
      ['io_module', this.createIOModuleConfig()],
      ['servo_drive', this.createServoDriveConfig()],
      ['power_meter', this.createPowerMeterConfig()],
      ['hmi_panel', this.createHMIPanelConfig()],
      ['flow_meter', this.createFlowMeterConfig()],
      ['pressure_sensor', this.createPressureSensorConfig()],
    ]);
  }

  /**
   * Get all supported device types
   */
  getSupportedDeviceTypes() {
    return Array.from(this.supportedDevices.keys());
  }

  /**
   * Get configuration for a specific device type
   */
  getDeviceConfig(deviceType) {
    const config = this.supportedDevices.get(deviceType);
    if (!config) {
      throw new Error(`Unsupported device type: ${deviceType}`);
    }
    return JSON.parse(JSON.stringify(config)); // Deep clone to prevent modification
  }

  /**
   * Create a generic PLC configuration
   */
  createGenericPLCConfig() {
    return {
      name: 'Generic PLC',
      description: 'Standard industrial PLC with digital I/O and analog inputs',
      defaultConnection: {
        type: 'tcp',
        host: '192.168.1.100',
        port: 502,
        slaveId: 1,
        timeout: 1000,
      },
      registerMappings: [
        {
          id: 'digital_inputs',
          name: 'Digital Inputs',
          registerType: 'discrete',
          address: 0,
          count: 16,
          dataType: 'boolean',
          description: 'Digital input channels 0-15',
          logData: true,
          readOnly: true,
        },
        {
          id: 'digital_outputs',
          name: 'Digital Outputs',
          registerType: 'coil',
          address: 0,
          count: 16,
          dataType: 'boolean',
          description: 'Digital output channels 0-15',
          logData: true,
          readOnly: false,
        },
        {
          id: 'analog_inputs',
          name: 'Analog Inputs',
          registerType: 'input',
          address: 0,
          count: 8,
          dataType: 'int16',
          scale: 0.01,
          unit: 'V',
          description: 'Analog input channels 0-7 (0-10V)',
          logData: true,
          readOnly: true,
        },
        {
          id: 'analog_outputs',
          name: 'Analog Outputs',
          registerType: 'holding',
          address: 0,
          count: 4,
          dataType: 'int16',
          scale: 0.01,
          unit: 'V',
          description: 'Analog output channels 0-3 (0-10V)',
          logData: true,
          readOnly: false,
        },
        {
          id: 'system_status',
          name: 'System Status',
          registerType: 'holding',
          address: 100,
          count: 1,
          dataType: 'uint16',
          description: 'System status register',
          logData: true,
          readOnly: true,
        },
      ],
      pollingInterval: 100,
      timeout: 1000,
    };
  }

  /**
   * Create temperature sensor configuration
   */
  createTemperatureSensorConfig() {
    return {
      name: 'Temperature Sensor',
      description: 'Industrial temperature sensor with Modbus RTU interface',
      defaultConnection: {
        type: 'rtu',
        serialPort: '/dev/ttyUSB0',
        baudRate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        slaveId: 1,
        timeout: 1000,
      },
      registerMappings: [
        {
          id: 'temperature',
          name: 'Temperature',
          registerType: 'input',
          address: 0,
          count: 1,
          dataType: 'int16',
          scale: 0.1,
          unit: '°C',
          description: 'Current temperature reading',
          logData: true,
          readOnly: true,
        },
        {
          id: 'humidity',
          name: 'Humidity',
          registerType: 'input',
          address: 1,
          count: 1,
          dataType: 'int16',
          scale: 0.1,
          unit: '%',
          description: 'Current humidity reading',
          logData: true,
          readOnly: true,
        },
        {
          id: 'alarm_high',
          name: 'High Temperature Alarm',
          registerType: 'holding',
          address: 0,
          count: 1,
          dataType: 'int16',
          scale: 0.1,
          unit: '°C',
          description: 'High temperature alarm setpoint',
          logData: false,
          readOnly: false,
        },
        {
          id: 'alarm_low',
          name: 'Low Temperature Alarm',
          registerType: 'holding',
          address: 1,
          count: 1,
          dataType: 'int16',
          scale: 0.1,
          unit: '°C',
          description: 'Low temperature alarm setpoint',
          logData: false,
          readOnly: false,
        },
      ],
      pollingInterval: 1000,
      timeout: 1000,
    };
  }

  /**
   * Create I/O module configuration
   */
  createIOModuleConfig() {
    return {
      name: 'I/O Module',
      description: 'Digital and analog I/O expansion module',
      defaultConnection: {
        type: 'rtu',
        serialPort: '/dev/ttyUSB0',
        baudRate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        slaveId: 1,
        timeout: 1000,
      },
      registerMappings: [
        {
          id: 'digital_inputs',
          name: 'Digital Inputs',
          registerType: 'discrete',
          address: 0,
          count: 32,
          dataType: 'boolean',
          description: 'Digital input channels 0-31',
          logData: true,
          readOnly: true,
        },
        {
          id: 'digital_outputs',
          name: 'Digital Outputs',
          registerType: 'coil',
          address: 0,
          count: 32,
          dataType: 'boolean',
          description: 'Digital output channels 0-31',
          logData: true,
          readOnly: false,
        },
        {
          id: 'analog_inputs',
          name: 'Analog Inputs',
          registerType: 'input',
          address: 0,
          count: 16,
          dataType: 'int16',
          scale: 0.001,
          unit: 'mA',
          description: 'Analog input channels 0-15 (4-20mA)',
          logData: true,
          readOnly: true,
        },
        {
          id: 'analog_outputs',
          name: 'Analog Outputs',
          registerType: 'holding',
          address: 0,
          count: 8,
          dataType: 'int16',
          scale: 0.001,
          unit: 'mA',
          description: 'Analog output channels 0-7 (4-20mA)',
          logData: true,
          readOnly: false,
        },
      ],
      pollingInterval: 200,
      timeout: 1000,
    };
  }

  /**
   * Create servo drive configuration
   */
  createServoDriveConfig() {
    return {
      name: 'Servo Drive',
      description: 'Industrial servo motor drive with position/velocity control',
      defaultConnection: {
        type: 'rtu',
        serialPort: '/dev/ttyUSB0',
        baudRate: 9600,
        dataBits: 8,
        parity: 'even',
        stopBits: 1,
        slaveId: 1,
        timeout: 1000,
      },
      registerMappings: [
        {
          id: 'position_command',
          name: 'Position Command',
          registerType: 'holding',
          address: 0,
          count: 2,
          dataType: 'int32',
          unit: 'pulses',
          description: 'Target position command',
          logData: true,
          readOnly: false,
        },
        {
          id: 'position_feedback',
          name: 'Position Feedback',
          registerType: 'input',
          address: 0,
          count: 2,
          dataType: 'int32',
          unit: 'pulses',
          description: 'Actual position feedback',
          logData: true,
          readOnly: true,
        },
        {
          id: 'velocity_command',
          name: 'Velocity Command',
          registerType: 'holding',
          address: 10,
          count: 1,
          dataType: 'int16',
          unit: 'rpm',
          description: 'Target velocity command',
          logData: true,
          readOnly: false,
        },
        {
          id: 'velocity_feedback',
          name: 'Velocity Feedback',
          registerType: 'input',
          address: 10,
          count: 1,
          dataType: 'int16',
          unit: 'rpm',
          description: 'Actual velocity feedback',
          logData: true,
          readOnly: true,
        },
        {
          id: 'torque_feedback',
          name: 'Torque Feedback',
          registerType: 'input',
          address: 15,
          count: 1,
          dataType: 'int16',
          scale: 0.1,
          unit: '%',
          description: 'Motor torque feedback',
          logData: true,
          readOnly: true,
        },
        {
          id: 'drive_status',
          name: 'Drive Status',
          registerType: 'input',
          address: 20,
          count: 1,
          dataType: 'uint16',
          description: 'Drive status word',
          logData: true,
          readOnly: true,
        },
        {
          id: 'control_word',
          name: 'Control Word',
          registerType: 'holding',
          address: 20,
          count: 1,
          dataType: 'uint16',
          description: 'Drive control word',
          logData: true,
          readOnly: false,
        },
      ],
      pollingInterval: 50,
      timeout: 500,
    };
  }

  /**
   * Create power meter configuration
   */
  createPowerMeterConfig() {
    return {
      name: 'Power Meter',
      description: 'Industrial power meter for energy monitoring',
      defaultConnection: {
        type: 'rtu',
        serialPort: '/dev/ttyUSB0',
        baudRate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        slaveId: 1,
        timeout: 1000,
      },
      registerMappings: [
        {
          id: 'voltage_l1',
          name: 'Voltage L1',
          registerType: 'input',
          address: 0,
          count: 2,
          dataType: 'float32',
          unit: 'V',
          description: 'Line 1 voltage',
          logData: true,
          readOnly: true,
        },
        {
          id: 'voltage_l2',
          name: 'Voltage L2',
          registerType: 'input',
          address: 2,
          count: 2,
          dataType: 'float32',
          unit: 'V',
          description: 'Line 2 voltage',
          logData: true,
          readOnly: true,
        },
        {
          id: 'voltage_l3',
          name: 'Voltage L3',
          registerType: 'input',
          address: 4,
          count: 2,
          dataType: 'float32',
          unit: 'V',
          description: 'Line 3 voltage',
          logData: true,
          readOnly: true,
        },
        {
          id: 'current_l1',
          name: 'Current L1',
          registerType: 'input',
          address: 10,
          count: 2,
          dataType: 'float32',
          unit: 'A',
          description: 'Line 1 current',
          logData: true,
          readOnly: true,
        },
        {
          id: 'current_l2',
          name: 'Current L2',
          registerType: 'input',
          address: 12,
          count: 2,
          dataType: 'float32',
          unit: 'A',
          description: 'Line 2 current',
          logData: true,
          readOnly: true,
        },
        {
          id: 'current_l3',
          name: 'Current L3',
          registerType: 'input',
          address: 14,
          count: 2,
          dataType: 'float32',
          unit: 'A',
          description: 'Line 3 current',
          logData: true,
          readOnly: true,
        },
        {
          id: 'active_power',
          name: 'Active Power',
          registerType: 'input',
          address: 20,
          count: 2,
          dataType: 'float32',
          unit: 'W',
          description: 'Total active power',
          logData: true,
          readOnly: true,
        },
        {
          id: 'reactive_power',
          name: 'Reactive Power',
          registerType: 'input',
          address: 22,
          count: 2,
          dataType: 'float32',
          unit: 'VAR',
          description: 'Total reactive power',
          logData: true,
          readOnly: true,
        },
        {
          id: 'energy_total',
          name: 'Total Energy',
          registerType: 'input',
          address: 30,
          count: 2,
          dataType: 'float32',
          unit: 'kWh',
          description: 'Total energy consumption',
          logData: true,
          readOnly: true,
        },
      ],
      pollingInterval: 1000,
      timeout: 1000,
    };
  }

  /**
   * Create HMI panel configuration
   */
  createHMIPanelConfig() {
    return {
      name: 'HMI Panel',
      description: 'Human-Machine Interface panel with touch display',
      defaultConnection: {
        type: 'tcp',
        host: '192.168.1.200',
        port: 502,
        slaveId: 1,
        timeout: 1000,
      },
      registerMappings: [
        {
          id: 'screen_number',
          name: 'Active Screen',
          registerType: 'holding',
          address: 0,
          count: 1,
          dataType: 'uint16',
          description: 'Currently active screen number',
          logData: false,
          readOnly: false,
        },
        {
          id: 'alarm_status',
          name: 'Alarm Status',
          registerType: 'input',
          address: 10,
          count: 1,
          dataType: 'uint16',
          description: 'Alarm status register',
          logData: true,
          readOnly: true,
        },
        {
          id: 'touch_coordinates',
          name: 'Touch Coordinates',
          registerType: 'input',
          address: 20,
          count: 2,
          dataType: 'uint16',
          description: 'Last touch X,Y coordinates',
          logData: false,
          readOnly: true,
        },
        {
          id: 'backlight_level',
          name: 'Backlight Level',
          registerType: 'holding',
          address: 30,
          count: 1,
          dataType: 'uint16',
          scale: 1,
          unit: '%',
          description: 'Display backlight level (0-100%)',
          logData: false,
          readOnly: false,
        },
      ],
      pollingInterval: 500,
      timeout: 1000,
    };
  }

  /**
   * Create flow meter configuration
   */
  createFlowMeterConfig() {
    return {
      name: 'Flow Meter',
      description: 'Industrial flow meter with totalizer',
      defaultConnection: {
        type: 'rtu',
        serialPort: '/dev/ttyUSB0',
        baudRate: 9600,
        dataBits: 8,
        parity: 'even',
        stopBits: 1,
        slaveId: 1,
        timeout: 1000,
      },
      registerMappings: [
        {
          id: 'flow_rate',
          name: 'Flow Rate',
          registerType: 'input',
          address: 0,
          count: 2,
          dataType: 'float32',
          unit: 'L/min',
          description: 'Instantaneous flow rate',
          logData: true,
          readOnly: true,
        },
        {
          id: 'flow_total',
          name: 'Flow Total',
          registerType: 'input',
          address: 10,
          count: 2,
          dataType: 'float32',
          unit: 'L',
          description: 'Cumulative flow total',
          logData: true,
          readOnly: true,
        },
        {
          id: 'temperature',
          name: 'Fluid Temperature',
          registerType: 'input',
          address: 20,
          count: 1,
          dataType: 'int16',
          scale: 0.1,
          unit: '°C',
          description: 'Fluid temperature',
          logData: true,
          readOnly: true,
        },
        {
          id: 'reset_total',
          name: 'Reset Total',
          registerType: 'holding',
          address: 0,
          count: 1,
          dataType: 'uint16',
          description: 'Write 1 to reset flow total',
          logData: false,
          readOnly: false,
        },
      ],
      pollingInterval: 500,
      timeout: 1000,
    };
  }

  /**
   * Create pressure sensor configuration
   */
  createPressureSensorConfig() {
    return {
      name: 'Pressure Sensor',
      description: 'Industrial pressure transmitter',
      defaultConnection: {
        type: 'rtu',
        serialPort: '/dev/ttyUSB0',
        baudRate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        slaveId: 1,
        timeout: 1000,
      },
      registerMappings: [
        {
          id: 'pressure',
          name: 'Pressure',
          registerType: 'input',
          address: 0,
          count: 1,
          dataType: 'int16',
          scale: 0.01,
          unit: 'bar',
          description: 'Current pressure reading',
          logData: true,
          readOnly: true,
        },
        {
          id: 'temperature',
          name: 'Temperature',
          registerType: 'input',
          address: 1,
          count: 1,
          dataType: 'int16',
          scale: 0.1,
          unit: '°C',
          description: 'Sensor temperature',
          logData: true,
          readOnly: true,
        },
        {
          id: 'pressure_min',
          name: 'Minimum Pressure',
          registerType: 'input',
          address: 10,
          count: 1,
          dataType: 'int16',
          scale: 0.01,
          unit: 'bar',
          description: 'Minimum recorded pressure',
          logData: false,
          readOnly: true,
        },
        {
          id: 'pressure_max',
          name: 'Maximum Pressure',
          registerType: 'input',
          address: 11,
          count: 1,
          dataType: 'int16',
          scale: 0.01,
          unit: 'bar',
          description: 'Maximum recorded pressure',
          logData: false,
          readOnly: true,
        },
        {
          id: 'alarm_setpoint',
          name: 'Alarm Setpoint',
          registerType: 'holding',
          address: 0,
          count: 1,
          dataType: 'int16',
          scale: 0.01,
          unit: 'bar',
          description: 'High pressure alarm setpoint',
          logData: false,
          readOnly: false,
        },
      ],
      pollingInterval: 500,
      timeout: 1000,
    };
  }

  /**
   * Create custom device configuration
   */
  createCustomConfig(name, description, connection, registerMappings) {
    return {
      name: name || 'Custom Device',
      description: description || 'Custom Modbus device configuration',
      defaultConnection: connection || {
        type: 'tcp',
        host: '192.168.1.100',
        port: 502,
        slaveId: 1,
        timeout: 1000,
      },
      registerMappings: registerMappings || [],
      pollingInterval: 1000,
      timeout: 1000,
    };
  }

  /**
   * Validate device configuration
   */
  validateConfig(config) {
    const errors = [];

    // Check required fields
    if (!config.name) {
      errors.push('Device name is required');
    }

    if (!config.defaultConnection) {
      errors.push('Default connection configuration is required');
    } else {
      // Validate connection config
      if (!config.defaultConnection.type) {
        errors.push('Connection type is required');
      } else if (!['tcp', 'rtu'].includes(config.defaultConnection.type)) {
        errors.push('Connection type must be "tcp" or "rtu"');
      }

      if (config.defaultConnection.type === 'tcp') {
        if (!config.defaultConnection.host) {
          errors.push('Host is required for TCP connection');
        }
      } else if (config.defaultConnection.type === 'rtu') {
        if (!config.defaultConnection.serialPort) {
          errors.push('Serial port is required for RTU connection');
        }
      }

      if (config.defaultConnection.slaveId === undefined) {
        errors.push('Slave ID is required');
      } else if (config.defaultConnection.slaveId < 1 || config.defaultConnection.slaveId > 255) {
        errors.push('Slave ID must be between 1 and 255');
      }
    }

    // Validate register mappings
    if (config.registerMappings && Array.isArray(config.registerMappings)) {
      config.registerMappings.forEach((mapping, index) => {
        if (!mapping.id) {
          errors.push(`Register mapping ${index}: ID is required`);
        }
        if (!mapping.registerType) {
          errors.push(`Register mapping ${index}: Register type is required`);
        } else if (!['holding', 'input', 'coil', 'discrete'].includes(mapping.registerType)) {
          errors.push(`Register mapping ${index}: Invalid register type`);
        }
        if (mapping.address === undefined) {
          errors.push(`Register mapping ${index}: Address is required`);
        }
        if (!mapping.dataType) {
          errors.push(`Register mapping ${index}: Data type is required`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

module.exports = ModbusDeviceConfig;
