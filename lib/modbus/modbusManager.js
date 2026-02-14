const ModbusRTU = require('modbus-serial');
const EventEmitter = require('events');
const { logger } = require('../logger');
const { DatabaseManager } = require('../database');

class ModbusManager extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map();
    this.deviceConfigs = new Map();
    this.pollingIntervals = new Map();
    this.registerMappings = new Map();
    this.isPolling = new Map();
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000; // 5 seconds
  }

  /**
   * Add a new Modbus device
   * @param {string} deviceId - Unique device identifier
   * @param {Object} config - Device configuration
   */
  async addDevice(deviceId, config) {
    try {
      if (this.connections.has(deviceId)) {
        throw new Error(`Device ${deviceId} already exists`);
      }

      const client = new ModbusRTU();

      // Set connection timeout and retry options
      client.setTimeout(config.timeout || 1000);
      client.setMaxListeners(20);

      // Connect based on connection type
      if (config.type === 'tcp') {
        await client.connectTCP(config.host, {
          port: config.port || 502,
          timeout: config.timeout || 1000,
        });
        logger.info(
          `Connected to Modbus TCP device ${deviceId} at ${config.host}:${config.port || 502}`
        );
      } else if (config.type === 'rtu') {
        await client.connectRTUBuffered(config.serialPort, {
          baudRate: config.baudRate || 9600,
          dataBits: config.dataBits || 8,
          parity: config.parity || 'none',
          stopBits: config.stopBits || 1,
          timeout: config.timeout || 1000,
        });
        logger.info(`Connected to Modbus RTU device ${deviceId} on ${config.serialPort}`);
      } else {
        throw new Error(`Unsupported Modbus type: ${config.type}`);
      }

      // Set slave ID
      client.setID(config.slaveId || 1);

      // Store connection and configuration
      this.connections.set(deviceId, client);
      this.deviceConfigs.set(deviceId, config);
      this.reconnectAttempts.set(deviceId, 0);

      // Set up error handling and reconnection
      this.setupErrorHandling(deviceId, client);

      // Start polling if configured
      if (config.pollingInterval && config.pollingInterval > 0) {
        this.startPolling(deviceId, config.pollingInterval);
      }

      // Save device configuration to database
      await this.saveDeviceConfig(deviceId, config);

      this.emit('deviceConnected', { deviceId, config });
      return { success: true, deviceId, message: 'Device connected successfully' };
    } catch (error) {
      logger.error(`Failed to add Modbus device ${deviceId}:`, error);
      this.emit('deviceError', { deviceId, error: error.message });
      throw new Error(`Failed to connect to Modbus device: ${error.message}`);
    }
  }

  /**
   * Remove a Modbus device
   */
  async removeDevice(deviceId) {
    try {
      // Stop polling
      this.stopPolling(deviceId);

      // Close connection
      const client = this.connections.get(deviceId);
      if (client) {
        await client.close();
        this.connections.delete(deviceId);
      }

      // Clean up
      this.deviceConfigs.delete(deviceId);
      this.registerMappings.delete(deviceId);
      this.reconnectAttempts.delete(deviceId);

      // Remove from database
      await this.removeDeviceConfig(deviceId);

      logger.info(`Removed Modbus device ${deviceId}`);
      this.emit('deviceDisconnected', { deviceId });
      return { success: true, message: 'Device removed successfully' };
    } catch (error) {
      logger.error(`Failed to remove Modbus device ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Read holding registers
   */
  async readHoldingRegisters(deviceId, startAddress, quantity) {
    const client = this.connections.get(deviceId);
    if (!client) {
      throw new Error(`Device ${deviceId} not found`);
    }

    try {
      const result = await client.readHoldingRegisters(startAddress, quantity);
      logger.debug(
        `Read holding registers from ${deviceId}: address=${startAddress}, quantity=${quantity}`
      );
      return result.data;
    } catch (error) {
      logger.error(`Failed to read holding registers from ${deviceId}:`, error);
      this.handleConnectionError(deviceId, error);
      throw new Error(`Failed to read holding registers: ${error.message}`);
    }
  }

  /**
   * Read input registers
   */
  async readInputRegisters(deviceId, startAddress, quantity) {
    const client = this.connections.get(deviceId);
    if (!client) {
      throw new Error(`Device ${deviceId} not found`);
    }

    try {
      const result = await client.readInputRegisters(startAddress, quantity);
      logger.debug(
        `Read input registers from ${deviceId}: address=${startAddress}, quantity=${quantity}`
      );
      return result.data;
    } catch (error) {
      logger.error(`Failed to read input registers from ${deviceId}:`, error);
      this.handleConnectionError(deviceId, error);
      throw new Error(`Failed to read input registers: ${error.message}`);
    }
  }

  /**
   * Read coils
   */
  async readCoils(deviceId, startAddress, quantity) {
    const client = this.connections.get(deviceId);
    if (!client) {
      throw new Error(`Device ${deviceId} not found`);
    }

    try {
      const result = await client.readCoils(startAddress, quantity);
      logger.debug(`Read coils from ${deviceId}: address=${startAddress}, quantity=${quantity}`);
      return result.data;
    } catch (error) {
      logger.error(`Failed to read coils from ${deviceId}:`, error);
      this.handleConnectionError(deviceId, error);
      throw new Error(`Failed to read coils: ${error.message}`);
    }
  }

  /**
   * Read discrete inputs
   */
  async readDiscreteInputs(deviceId, startAddress, quantity) {
    const client = this.connections.get(deviceId);
    if (!client) {
      throw new Error(`Device ${deviceId} not found`);
    }

    try {
      const result = await client.readDiscreteInputs(startAddress, quantity);
      logger.debug(
        `Read discrete inputs from ${deviceId}: address=${startAddress}, quantity=${quantity}`
      );
      return result.data;
    } catch (error) {
      logger.error(`Failed to read discrete inputs from ${deviceId}:`, error);
      this.handleConnectionError(deviceId, error);
      throw new Error(`Failed to read discrete inputs: ${error.message}`);
    }
  }

  /**
   * Write multiple holding registers
   */
  async writeMultipleRegisters(deviceId, startAddress, values) {
    const client = this.connections.get(deviceId);
    if (!client) {
      throw new Error(`Device ${deviceId} not found`);
    }

    try {
      await client.writeMultipleRegisters(startAddress, values);
      logger.debug(
        `Wrote holding registers to ${deviceId}: address=${startAddress}, values=[${values}]`
      );
      this.emit('registersWritten', { deviceId, startAddress, values });
      return { success: true };
    } catch (error) {
      logger.error(`Failed to write holding registers to ${deviceId}:`, error);
      this.handleConnectionError(deviceId, error);
      throw new Error(`Failed to write holding registers: ${error.message}`);
    }
  }

  /**
   * Write multiple coils
   */
  async writeMultipleCoils(deviceId, startAddress, values) {
    const client = this.connections.get(deviceId);
    if (!client) {
      throw new Error(`Device ${deviceId} not found`);
    }

    try {
      await client.writeMultipleCoils(startAddress, values);
      logger.debug(`Wrote coils to ${deviceId}: address=${startAddress}, values=[${values}]`);
      this.emit('coilsWritten', { deviceId, startAddress, values });
      return { success: true };
    } catch (error) {
      logger.error(`Failed to write coils to ${deviceId}:`, error);
      this.handleConnectionError(deviceId, error);
      throw new Error(`Failed to write coils: ${error.message}`);
    }
  }

  /**
   * Start polling for a device
   */
  startPolling(deviceId, interval) {
    // Stop existing polling if any
    this.stopPolling(deviceId);

    const config = this.deviceConfigs.get(deviceId);
    if (!config || !config.registerMappings) {
      return;
    }

    this.isPolling.set(deviceId, true);
    const pollingId = setInterval(async () => {
      if (!this.isPolling.get(deviceId)) {
        clearInterval(pollingId);
        return;
      }

      try {
        await this.pollDevice(deviceId);
      } catch (error) {
        logger.error(`Polling error for device ${deviceId}:`, error);
        this.emit('pollingError', { deviceId, error: error.message });
      }
    }, interval);

    this.pollingIntervals.set(deviceId, pollingId);
    logger.info(`Started polling for device ${deviceId} with interval ${interval}ms`);
  }

  /**
   * Stop polling for a device
   */
  stopPolling(deviceId) {
    const pollingId = this.pollingIntervals.get(deviceId);
    if (pollingId) {
      clearInterval(pollingId);
      this.pollingIntervals.delete(deviceId);
    }
    this.isPolling.set(deviceId, false);
    logger.info(`Stopped polling for device ${deviceId}`);
  }

  /**
   * Poll a single device for all its configured register mappings
   */
  async pollDevice(deviceId) {
    const config = this.deviceConfigs.get(deviceId);
    if (!config || !config.registerMappings) {
      return;
    }

    for (const mapping of config.registerMappings) {
      try {
        let data;

        switch (mapping.registerType) {
          case 'holding':
            data = await this.readHoldingRegisters(deviceId, mapping.address, mapping.count || 1);
            break;
          case 'input':
            data = await this.readInputRegisters(deviceId, mapping.address, mapping.count || 1);
            break;
          case 'coil':
            data = await this.readCoils(deviceId, mapping.address, mapping.count || 1);
            break;
          case 'discrete':
            data = await this.readDiscreteInputs(deviceId, mapping.address, mapping.count || 1);
            break;
          default:
            continue;
        }

        // Convert and emit data
        const convertedData = this.convertRegisterData(data, mapping);
        this.emit('dataReceived', {
          deviceId,
          mappingId: mapping.id,
          registerType: mapping.registerType,
          address: mapping.address,
          rawData: data,
          convertedData,
          timestamp: new Date().toISOString(),
        });

        // Log data if configured
        if (mapping.logData) {
          await this.logRegisterData(deviceId, mapping.id, data, convertedData);
        }
      } catch (error) {
        logger.warn(`Failed to poll mapping ${mapping.id} for device ${deviceId}:`, error);
      }
    }
  }

  /**
   * Convert raw register data based on mapping configuration
   */
  convertRegisterData(rawData, mapping) {
    if (!rawData || rawData.length === 0) {
      return null;
    }

    try {
      let convertedData;

      switch (mapping.dataType) {
        case 'int16':
          convertedData = rawData.map(val => {
            // Convert unsigned to signed if necessary
            return val > 32767 ? val - 65536 : val;
          });
          break;

        case 'uint16':
          convertedData = rawData;
          break;

        case 'int32':
          convertedData = [];
          for (let i = 0; i < rawData.length; i += 2) {
            if (i + 1 < rawData.length) {
              const combined = (rawData[i] << 16) | rawData[i + 1];
              convertedData.push(combined > 2147483647 ? combined - 4294967296 : combined);
            }
          }
          break;

        case 'uint32':
          convertedData = [];
          for (let i = 0; i < rawData.length; i += 2) {
            if (i + 1 < rawData.length) {
              convertedData.push((rawData[i] << 16) | rawData[i + 1]);
            }
          }
          break;

        case 'float32':
          convertedData = [];
          for (let i = 0; i < rawData.length; i += 2) {
            if (i + 1 < rawData.length) {
              const buffer = Buffer.allocUnsafe(4);
              buffer.writeUInt16BE(rawData[i], 0);
              buffer.writeUInt16BE(rawData[i + 1], 2);
              convertedData.push(buffer.readFloatBE(0));
            }
          }
          break;

        case 'boolean':
          convertedData = rawData.map(val => Boolean(val));
          break;

        default:
          convertedData = rawData;
      }

      // Apply scaling and offset
      if (mapping.scale !== undefined && mapping.scale !== 1) {
        convertedData = convertedData.map(val => val * mapping.scale);
      }

      if (mapping.offset !== undefined && mapping.offset !== 0) {
        convertedData = convertedData.map(val => val + mapping.offset);
      }

      // Return single value if only one element
      return convertedData.length === 1 ? convertedData[0] : convertedData;
    } catch (error) {
      logger.error(`Failed to convert register data for mapping ${mapping.id}:`, error);
      return rawData;
    }
  }

  /**
   * Set up error handling and reconnection for a device
   */
  setupErrorHandling(deviceId, client) {
    client.on('error', error => {
      logger.error(`Modbus client error for device ${deviceId}:`, error);
      this.handleConnectionError(deviceId, error);
    });

    client.on('close', () => {
      logger.warn(`Modbus connection closed for device ${deviceId}`);
      this.emit('deviceDisconnected', { deviceId });
      this.handleConnectionError(deviceId, new Error('Connection closed'));
    });
  }

  /**
   * Handle connection errors and attempt reconnection
   */
  async handleConnectionError(deviceId, error) {
    const attempts = this.reconnectAttempts.get(deviceId) || 0;

    if (attempts < this.maxReconnectAttempts) {
      this.reconnectAttempts.set(deviceId, attempts + 1);

      logger.info(
        `Attempting to reconnect device ${deviceId} (attempt ${attempts + 1}/${this.maxReconnectAttempts})`
      );

      setTimeout(async () => {
        try {
          await this.reconnectDevice(deviceId);
        } catch (reconnectError) {
          logger.error(`Reconnection failed for device ${deviceId}:`, reconnectError);
        }
      }, this.reconnectDelay);
    } else {
      logger.error(`Max reconnection attempts reached for device ${deviceId}`);
      this.emit('deviceConnectionFailed', { deviceId, error: error.message });
    }
  }

  /**
   * Attempt to reconnect a device
   */
  async reconnectDevice(deviceId) {
    const config = this.deviceConfigs.get(deviceId);
    if (!config) {
      throw new Error(`Configuration not found for device ${deviceId}`);
    }

    // Remove existing connection
    const client = this.connections.get(deviceId);
    if (client) {
      try {
        await client.close();
      } catch (error) {
        // Ignore close errors
      }
      this.connections.delete(deviceId);
    }

    // Stop polling during reconnection
    this.stopPolling(deviceId);

    // Recreate connection
    await this.addDevice(deviceId, config);

    // Reset reconnection attempts on success
    this.reconnectAttempts.set(deviceId, 0);

    logger.info(`Successfully reconnected device ${deviceId}`);
  }

  /**
   * Get device status
   */
  getDeviceStatus(deviceId) {
    const client = this.connections.get(deviceId);
    const config = this.deviceConfigs.get(deviceId);
    const isPolling = this.isPolling.get(deviceId) || false;
    const reconnectAttempts = this.reconnectAttempts.get(deviceId) || 0;

    return {
      deviceId,
      isConnected: Boolean(client && client.isOpen),
      isPolling,
      reconnectAttempts,
      config: config || null,
    };
  }

  /**
   * Get all device statuses
   */
  getAllDeviceStatuses() {
    const statuses = [];
    for (const deviceId of this.deviceConfigs.keys()) {
      statuses.push(this.getDeviceStatus(deviceId));
    }
    return statuses;
  }

  /**
   * Save device configuration to database
   */
  async saveDeviceConfig(deviceId, config) {
    try {
      const db = DatabaseManager.getInstance();
      // Implementation depends on database model - will be added when database models are created
      logger.debug(`Saved device configuration for ${deviceId}`);
    } catch (error) {
      logger.error(`Failed to save device configuration for ${deviceId}:`, error);
    }
  }

  /**
   * Remove device configuration from database
   */
  async removeDeviceConfig(deviceId) {
    try {
      const db = DatabaseManager.getInstance();
      // Implementation depends on database model - will be added when database models are created
      logger.debug(`Removed device configuration for ${deviceId}`);
    } catch (error) {
      logger.error(`Failed to remove device configuration for ${deviceId}:`, error);
    }
  }

  /**
   * Log register data to database
   */
  async logRegisterData(deviceId, mappingId, rawData, convertedData) {
    try {
      const db = DatabaseManager.getInstance();
      // Implementation depends on database model - will be added when database models are created
      logger.debug(`Logged register data for ${deviceId}/${mappingId}`);
    } catch (error) {
      logger.error(`Failed to log register data for ${deviceId}/${mappingId}:`, error);
    }
  }

  /**
   * Shutdown all connections
   */
  async shutdown() {
    logger.info('Shutting down Modbus Manager...');

    // Stop all polling
    for (const deviceId of this.deviceConfigs.keys()) {
      this.stopPolling(deviceId);
    }

    // Close all connections
    const closePromises = [];
    for (const [deviceId, client] of this.connections.entries()) {
      closePromises.push(
        client.close().catch(error => {
          logger.warn(`Error closing connection for device ${deviceId}:`, error);
        })
      );
    }

    await Promise.all(closePromises);

    // Clear all maps
    this.connections.clear();
    this.deviceConfigs.clear();
    this.pollingIntervals.clear();
    this.registerMappings.clear();
    this.isPolling.clear();
    this.reconnectAttempts.clear();

    logger.info('Modbus Manager shutdown complete');
  }
}

module.exports = ModbusManager;
