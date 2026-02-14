const EventEmitter = require('events');
const { logger } = require('../logger');

/**
 * Modbus Register Mapping System
 * Provides flexible mapping of Modbus registers to system variables
 */
class ModbusRegisterMapper extends EventEmitter {
  constructor(modbusManager) {
    super();
    this.modbusManager = modbusManager;
    this.mappings = new Map();
    this.valueCache = new Map();
    this.lastUpdated = new Map();

    // Data converters for different data types
    this.dataConverters = new Map([
      ['int16', this.convertInt16.bind(this)],
      ['uint16', this.convertUInt16.bind(this)],
      ['int32', this.convertInt32.bind(this)],
      ['uint32', this.convertUInt32.bind(this)],
      ['float32', this.convertFloat32.bind(this)],
      ['boolean', this.convertBoolean.bind(this)],
      ['string', this.convertString.bind(this)],
    ]);

    // Listen for data from Modbus Manager
    this.modbusManager.on('dataReceived', this.handleDataReceived.bind(this));
  }

  /**
   * Add a register mapping
   */
  addMapping(mappingId, config) {
    try {
      // Validate mapping configuration
      const validation = this.validateMapping(config);
      if (!validation.isValid) {
        throw new Error(`Invalid mapping configuration: ${validation.errors.join(', ')}`);
      }

      const mapping = {
        id: mappingId,
        deviceId: config.deviceId,
        registerType: config.registerType, // 'holding', 'input', 'coil', 'discrete'
        address: config.address,
        count: config.count || 1,
        dataType: config.dataType,
        scale: config.scale || 1,
        offset: config.offset || 0,
        unit: config.unit || '',
        description: config.description || '',
        readOnly: config.readOnly !== false, // Default to read-only
        logData: config.logData !== false, // Default to logging enabled
        alarmConfig: config.alarmConfig || null,
        created: new Date().toISOString(),
      };

      this.mappings.set(mappingId, mapping);
      logger.info(`Added register mapping: ${mappingId} for device ${config.deviceId}`);

      this.emit('mappingAdded', { mappingId, mapping });
      return mapping;
    } catch (error) {
      logger.error(`Failed to add register mapping ${mappingId}:`, error);
      throw error;
    }
  }

  /**
   * Remove a register mapping
   */
  removeMapping(mappingId) {
    const mapping = this.mappings.get(mappingId);
    if (!mapping) {
      throw new Error(`Mapping ${mappingId} not found`);
    }

    this.mappings.delete(mappingId);
    this.valueCache.delete(mappingId);
    this.lastUpdated.delete(mappingId);

    logger.info(`Removed register mapping: ${mappingId}`);
    this.emit('mappingRemoved', { mappingId, mapping });

    return mapping;
  }

  /**
   * Get a register mapping
   */
  getMapping(mappingId) {
    return this.mappings.get(mappingId);
  }

  /**
   * Get all register mappings
   */
  getAllMappings() {
    return Array.from(this.mappings.values());
  }

  /**
   * Get mappings for a specific device
   */
  getDeviceMappings(deviceId) {
    return Array.from(this.mappings.values()).filter(mapping => mapping.deviceId === deviceId);
  }

  /**
   * Read a mapped value
   */
  async readMappedValue(mappingId) {
    const mapping = this.mappings.get(mappingId);
    if (!mapping) {
      throw new Error(`Mapping ${mappingId} not found`);
    }

    try {
      // Read raw value from Modbus device
      const rawValue = await this.readRawValue(mapping);

      // Convert and scale the value
      const convertedValue = this.convertValue(rawValue, mapping);

      // Update cache
      this.valueCache.set(mappingId, convertedValue);
      this.lastUpdated.set(mappingId, new Date().toISOString());

      // Check alarms if configured
      this.checkAlarms(mappingId, convertedValue, mapping);

      return {
        mappingId,
        rawValue,
        value: convertedValue,
        unit: mapping.unit,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Failed to read mapped value for ${mappingId}:`, error);
      throw error;
    }
  }

  /**
   * Write a mapped value
   */
  async writeMappedValue(mappingId, value) {
    const mapping = this.mappings.get(mappingId);
    if (!mapping) {
      throw new Error(`Mapping ${mappingId} not found`);
    }

    if (mapping.readOnly) {
      throw new Error(`Mapping ${mappingId} is read-only`);
    }

    try {
      // Convert scaled value back to raw value
      const rawValue = this.convertToRaw(value, mapping);

      // Write to Modbus device
      await this.writeRawValue(mapping, rawValue);

      // Update cache
      this.valueCache.set(mappingId, value);
      this.lastUpdated.set(mappingId, new Date().toISOString());

      logger.info(`Wrote mapped value: ${mappingId} = ${value}`);
      this.emit('valueWritten', { mappingId, value, rawValue });

      return {
        success: true,
        mappingId,
        value,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Failed to write mapped value for ${mappingId}:`, error);
      throw error;
    }
  }

  /**
   * Get cached value for a mapping
   */
  getCachedValue(mappingId) {
    const value = this.valueCache.get(mappingId);
    const lastUpdated = this.lastUpdated.get(mappingId);
    const mapping = this.mappings.get(mappingId);

    return {
      mappingId,
      value,
      unit: mapping ? mapping.unit : '',
      lastUpdated,
      isStale: this.isValueStale(lastUpdated),
    };
  }

  /**
   * Get all cached values
   */
  getAllCachedValues() {
    const values = {};
    for (const mappingId of this.mappings.keys()) {
      values[mappingId] = this.getCachedValue(mappingId);
    }
    return values;
  }

  /**
   * Handle data received from Modbus Manager
   */
  handleDataReceived(data) {
    const { deviceId, mappingId, rawData, convertedData, timestamp } = data;

    // Find matching mapping
    for (const [id, mapping] of this.mappings.entries()) {
      if (
        mapping.deviceId === deviceId &&
        mapping.address === data.address &&
        mapping.registerType === data.registerType
      ) {
        // Update cache
        this.valueCache.set(id, convertedData);
        this.lastUpdated.set(id, timestamp);

        // Check alarms
        this.checkAlarms(id, convertedData, mapping);

        // Emit value update
        this.emit('valueUpdated', {
          mappingId: id,
          value: convertedData,
          rawValue: rawData,
          timestamp,
        });
      }
    }
  }

  /**
   * Read raw value from Modbus device
   */
  async readRawValue(mapping) {
    switch (mapping.registerType) {
      case 'holding':
        return await this.modbusManager.readHoldingRegisters(
          mapping.deviceId,
          mapping.address,
          mapping.count
        );
      case 'input':
        return await this.modbusManager.readInputRegisters(
          mapping.deviceId,
          mapping.address,
          mapping.count
        );
      case 'coil':
        return await this.modbusManager.readCoils(mapping.deviceId, mapping.address, mapping.count);
      case 'discrete':
        return await this.modbusManager.readDiscreteInputs(
          mapping.deviceId,
          mapping.address,
          mapping.count
        );
      default:
        throw new Error(`Unsupported register type: ${mapping.registerType}`);
    }
  }

  /**
   * Write raw value to Modbus device
   */
  async writeRawValue(mapping, rawValue) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];

    switch (mapping.registerType) {
      case 'holding':
        return await this.modbusManager.writeMultipleRegisters(
          mapping.deviceId,
          mapping.address,
          values
        );
      case 'coil':
        return await this.modbusManager.writeMultipleCoils(
          mapping.deviceId,
          mapping.address,
          values
        );
      default:
        throw new Error(`Register type ${mapping.registerType} is not writable`);
    }
  }

  /**
   * Convert raw value based on mapping configuration
   */
  convertValue(rawValue, mapping) {
    if (!rawValue || rawValue.length === 0) {
      return null;
    }

    try {
      const converter = this.dataConverters.get(mapping.dataType);
      if (!converter) {
        logger.warn(`Unknown data type: ${mapping.dataType}, returning raw value`);
        return rawValue;
      }

      let convertedValue = converter(rawValue);

      // Apply scaling and offset
      if (mapping.scale !== 1) {
        if (Array.isArray(convertedValue)) {
          convertedValue = convertedValue.map(val => val * mapping.scale);
        } else {
          convertedValue = convertedValue * mapping.scale;
        }
      }

      if (mapping.offset !== 0) {
        if (Array.isArray(convertedValue)) {
          convertedValue = convertedValue.map(val => val + mapping.offset);
        } else {
          convertedValue = convertedValue + mapping.offset;
        }
      }

      return convertedValue;
    } catch (error) {
      logger.error(`Failed to convert value for mapping ${mapping.id}:`, error);
      return rawValue;
    }
  }

  /**
   * Convert scaled value back to raw value
   */
  convertToRaw(value, mapping) {
    try {
      let rawValue = value;

      // Reverse offset and scaling
      if (mapping.offset !== 0) {
        if (Array.isArray(rawValue)) {
          rawValue = rawValue.map(val => val - mapping.offset);
        } else {
          rawValue = rawValue - mapping.offset;
        }
      }

      if (mapping.scale !== 1) {
        if (Array.isArray(rawValue)) {
          rawValue = rawValue.map(val => val / mapping.scale);
        } else {
          rawValue = rawValue / mapping.scale;
        }
      }

      // Convert back to appropriate format
      switch (mapping.dataType) {
        case 'int16':
          return Array.isArray(rawValue)
            ? rawValue.map(val => Math.round(val))
            : Math.round(rawValue);
        case 'uint16':
          return Array.isArray(rawValue)
            ? rawValue.map(val => Math.max(0, Math.round(val)))
            : Math.max(0, Math.round(rawValue));
        case 'boolean':
          return Array.isArray(rawValue) ? rawValue.map(val => Boolean(val)) : Boolean(rawValue);
        default:
          return rawValue;
      }
    } catch (error) {
      logger.error(`Failed to convert to raw value for mapping ${mapping.id}:`, error);
      return value;
    }
  }

  /**
   * Data converter functions
   */
  convertInt16(rawData) {
    return rawData.map(val => {
      // Convert unsigned to signed if necessary
      return val > 32767 ? val - 65536 : val;
    });
  }

  convertUInt16(rawData) {
    return rawData;
  }

  convertInt32(rawData) {
    const result = [];
    for (let i = 0; i < rawData.length; i += 2) {
      if (i + 1 < rawData.length) {
        const combined = (rawData[i] << 16) | rawData[i + 1];
        result.push(combined > 2147483647 ? combined - 4294967296 : combined);
      }
    }
    return result;
  }

  convertUInt32(rawData) {
    const result = [];
    for (let i = 0; i < rawData.length; i += 2) {
      if (i + 1 < rawData.length) {
        result.push((rawData[i] << 16) | rawData[i + 1]);
      }
    }
    return result;
  }

  convertFloat32(rawData) {
    const result = [];
    for (let i = 0; i < rawData.length; i += 2) {
      if (i + 1 < rawData.length) {
        const buffer = Buffer.allocUnsafe(4);
        buffer.writeUInt16BE(rawData[i], 0);
        buffer.writeUInt16BE(rawData[i + 1], 2);
        result.push(buffer.readFloatBE(0));
      }
    }
    return result;
  }

  convertBoolean(rawData) {
    return rawData.map(val => Boolean(val));
  }

  convertString(rawData) {
    // Convert 16-bit registers to ASCII string
    const chars = [];
    for (const val of rawData) {
      chars.push(String.fromCharCode((val >> 8) & 0xff));
      chars.push(String.fromCharCode(val & 0xff));
    }
    return chars.join('').replace(/\0/g, ''); // Remove null characters
  }

  /**
   * Check alarm conditions for a value
   */
  checkAlarms(mappingId, value, mapping) {
    if (!mapping.alarmConfig) {
      return;
    }

    const { highAlarm, lowAlarm, highWarning, lowWarning } = mapping.alarmConfig;
    let alarmLevel = 'normal';
    let message = '';

    if (highAlarm !== undefined && value > highAlarm) {
      alarmLevel = 'alarm';
      message = `High alarm: ${value} > ${highAlarm}`;
    } else if (lowAlarm !== undefined && value < lowAlarm) {
      alarmLevel = 'alarm';
      message = `Low alarm: ${value} < ${lowAlarm}`;
    } else if (highWarning !== undefined && value > highWarning) {
      alarmLevel = 'warning';
      message = `High warning: ${value} > ${highWarning}`;
    } else if (lowWarning !== undefined && value < lowWarning) {
      alarmLevel = 'warning';
      message = `Low warning: ${value} < ${lowWarning}`;
    }

    if (alarmLevel !== 'normal') {
      this.emit('alarm', {
        mappingId,
        level: alarmLevel,
        message,
        value,
        unit: mapping.unit,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Validate mapping configuration
   */
  validateMapping(config) {
    const errors = [];

    if (!config.deviceId) {
      errors.push('Device ID is required');
    }

    if (!config.registerType) {
      errors.push('Register type is required');
    } else if (!['holding', 'input', 'coil', 'discrete'].includes(config.registerType)) {
      errors.push('Invalid register type');
    }

    if (config.address === undefined) {
      errors.push('Register address is required');
    } else if (config.address < 0 || config.address > 65535) {
      errors.push('Register address must be between 0 and 65535');
    }

    if (!config.dataType) {
      errors.push('Data type is required');
    } else if (!this.dataConverters.has(config.dataType)) {
      errors.push('Invalid data type');
    }

    if (config.count !== undefined && (config.count < 1 || config.count > 125)) {
      errors.push('Register count must be between 1 and 125');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if a cached value is stale
   */
  isValueStale(lastUpdated, maxAge = 30000) {
    // 30 seconds default
    if (!lastUpdated) {
      return true;
    }

    const age = Date.now() - new Date(lastUpdated).getTime();
    return age > maxAge;
  }

  /**
   * Export mappings to JSON
   */
  exportMappings() {
    const mappings = {};
    for (const [id, mapping] of this.mappings.entries()) {
      mappings[id] = mapping;
    }
    return JSON.stringify(mappings, null, 2);
  }

  /**
   * Import mappings from JSON
   */
  importMappings(jsonData) {
    try {
      const mappings = JSON.parse(jsonData);
      let imported = 0;
      let errors = 0;

      for (const [id, config] of Object.entries(mappings)) {
        try {
          this.addMapping(id, config);
          imported++;
        } catch (error) {
          logger.error(`Failed to import mapping ${id}:`, error);
          errors++;
        }
      }

      return { imported, errors };
    } catch (error) {
      throw new Error(`Failed to parse mapping JSON: ${error.message}`);
    }
  }

  /**
   * Clear all mappings
   */
  clearAllMappings() {
    const count = this.mappings.size;
    this.mappings.clear();
    this.valueCache.clear();
    this.lastUpdated.clear();

    logger.info(`Cleared all ${count} register mappings`);
    this.emit('allMappingsCleared', { count });

    return count;
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      totalMappings: this.mappings.size,
      cachedValues: this.valueCache.size,
      deviceCount: new Set(Array.from(this.mappings.values()).map(m => m.deviceId)).size,
      registerTypes: {
        holding: Array.from(this.mappings.values()).filter(m => m.registerType === 'holding')
          .length,
        input: Array.from(this.mappings.values()).filter(m => m.registerType === 'input').length,
        coil: Array.from(this.mappings.values()).filter(m => m.registerType === 'coil').length,
        discrete: Array.from(this.mappings.values()).filter(m => m.registerType === 'discrete')
          .length,
      },
      dataTypes: {
        int16: Array.from(this.mappings.values()).filter(m => m.dataType === 'int16').length,
        uint16: Array.from(this.mappings.values()).filter(m => m.dataType === 'uint16').length,
        int32: Array.from(this.mappings.values()).filter(m => m.dataType === 'int32').length,
        uint32: Array.from(this.mappings.values()).filter(m => m.dataType === 'uint32').length,
        float32: Array.from(this.mappings.values()).filter(m => m.dataType === 'float32').length,
        boolean: Array.from(this.mappings.values()).filter(m => m.dataType === 'boolean').length,
      },
    };
  }
}

module.exports = ModbusRegisterMapper;
