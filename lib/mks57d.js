const { SerialPort } = require('serialport');
const { DelimiterParser } = require('@serialport/parser-delimiter');

/**
 * MKS57D Stepper Controller Library
 * Implements communication with MKS57D controllers over RS485
 */
class MKS57D {
  constructor(config = {}) {
    this.config = {
      port: config.port || '/dev/ttyUSB1',
      baudRate: config.baudRate || 9600,
      dataBits: config.dataBits || 8,
      stopBits: config.stopBits || 1,
      parity: config.parity || 'none',
      timeout: config.timeout || 1000,
      ...config
    };
    
    this.serialPort = null;
    this.parser = null;
    this.isConnected = false;
    this.pendingCommands = new Map();
    this.commandId = 0;
  }

  /**
   * Initialize connection to MKS57D controller
   */
  async connect() {
    try {
      if (this.isConnected) {
        return true;
      }

      this.serialPort = new SerialPort({
        path: this.config.port,
        baudRate: this.config.baudRate,
        dataBits: this.config.dataBits,
        stopBits: this.config.stopBits,
        parity: this.config.parity
      });

      this.parser = this.serialPort.pipe(new DelimiterParser({ delimiter: '\r\n' }));
      
      // Handle responses
      this.parser.on('data', (data) => {
        this.handleResponse(data.toString());
      });

      this.serialPort.on('error', (err) => {
        console.error('MKS57D Serial Error:', err);
        this.isConnected = false;
      });

      await this.waitForConnection();
      this.isConnected = true;
      console.log('MKS57D connected successfully');
      return true;
    } catch (error) {
      console.error('Failed to connect to MKS57D:', error);
      return false;
    }
  }

  /**
   * Wait for serial port to open
   */
  waitForConnection() {
    return new Promise((resolve, reject) => {
      this.serialPort.on('open', resolve);
      this.serialPort.on('error', reject);
    });
  }

  /**
   * Disconnect from controller
   */
  async disconnect() {
    if (this.serialPort && this.isConnected) {
      this.serialPort.close();
      this.isConnected = false;
    }
  }

  /**
   * Send command to MKS57D controller
   * @param {number} address - Controller address (1-247)
   * @param {string} command - Command string
   * @param {Object} options - Command options
   */
  async sendCommand(address, command, options = {}) {
    if (!this.isConnected) {
      throw new Error('MKS57D not connected');
    }

    const commandId = ++this.commandId;
    const fullCommand = `${address.toString().padStart(3, '0')}${command}\r\n`;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error(`Command timeout: ${command}`));
      }, options.timeout || this.config.timeout);

      this.pendingCommands.set(commandId, {
        resolve,
        reject,
        timeout,
        address,
        command,
        timestamp: Date.now()
      });

      this.serialPort.write(fullCommand, (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pendingCommands.delete(commandId);
          reject(err);
        }
      });
    });
  }

  /**
   * Handle response from controller
   */
  handleResponse(response) {
    const trimmedResponse = response.trim();
    if (!trimmedResponse) return;

    // Parse response format: address + response
    const match = trimmedResponse.match(/^(\d{3})(.+)$/);
    if (!match) {
      console.warn('Invalid response format:', trimmedResponse);
      return;
    }

    const [, addressStr, responseData] = match;
    const address = parseInt(addressStr);
    
    // Find matching pending command
    for (const [commandId, pendingCmd] of this.pendingCommands.entries()) {
      if (pendingCmd.address === address) {
        clearTimeout(pendingCmd.timeout);
        this.pendingCommands.delete(commandId);
        pendingCmd.resolve({
          address,
          data: responseData,
          raw: trimmedResponse
        });
        return;
      }
    }

    console.warn('Unmatched response:', trimmedResponse);
  }

  // ========== MKS57D Commands ==========

  /**
   * Get controller status
   * @param {number} address - Controller address
   */
  async getStatus(address) {
    try {
      const response = await this.sendCommand(address, 'S');
      return this.parseStatusResponse(response.data);
    } catch (error) {
      console.error(`Failed to get status for controller ${address}:`, error);
      throw error;
    }
  }

  /**
   * Home the controller (return to zero position)
   * @param {number} address - Controller address
   */
  async home(address) {
    try {
      const response = await this.sendCommand(address, 'H');
      return response.data === 'OK';
    } catch (error) {
      console.error(`Failed to home controller ${address}:`, error);
      throw error;
    }
  }

  /**
   * Move to absolute position
   * @param {number} address - Controller address
   * @param {number} position - Target position in steps
   * @param {number} speed - Movement speed (optional)
   */
  async moveAbsolute(address, position, speed = null) {
    try {
      const speedParam = speed ? `,${speed}` : '';
      const command = `MA${position}${speedParam}`;
      const response = await this.sendCommand(address, command);
      return response.data === 'OK';
    } catch (error) {
      console.error(`Failed to move controller ${address} to position ${position}:`, error);
      throw error;
    }
  }

  /**
   * Move relative position
   * @param {number} address - Controller address  
   * @param {number} steps - Steps to move (positive or negative)
   * @param {number} speed - Movement speed (optional)
   */
  async moveRelative(address, steps, speed = null) {
    try {
      const speedParam = speed ? `,${speed}` : '';
      const command = `MR${steps}${speedParam}`;
      const response = await this.sendCommand(address, command);
      return response.data === 'OK';
    } catch (error) {
      console.error(`Failed to move controller ${address} by ${steps} steps:`, error);
      throw error;
    }
  }

  /**
   * Get current position
   * @param {number} address - Controller address
   */
  async getPosition(address) {
    try {
      const response = await this.sendCommand(address, 'P');
      return parseInt(response.data);
    } catch (error) {
      console.error(`Failed to get position for controller ${address}:`, error);
      throw error;
    }
  }

  /**
   * Stop movement
   * @param {number} address - Controller address
   */
  async stop(address) {
    try {
      const response = await this.sendCommand(address, 'ST');
      return response.data === 'OK';
    } catch (error) {
      console.error(`Failed to stop controller ${address}:`, error);
      throw error;
    }
  }

  /**
   * Emergency stop all controllers
   * @param {number[]} addresses - Array of controller addresses
   */
  async emergencyStopAll(addresses = []) {
    const promises = addresses.map(address => this.stop(address));
    try {
      await Promise.all(promises);
      return true;
    } catch (error) {
      console.error('Emergency stop failed for some controllers:', error);
      return false;
    }
  }

  /**
   * Home multiple controllers
   * @param {number[]} addresses - Array of controller addresses
   */
  async homeMultiple(addresses = []) {
    const results = {};
    
    for (const address of addresses) {
      try {
        results[address] = await this.home(address);
      } catch (error) {
        results[address] = false;
        console.error(`Failed to home controller ${address}:`, error);
      }
    }
    
    return results;
  }

  /**
   * Get positions from multiple controllers
   * @param {number[]} addresses - Array of controller addresses
   */
  async getPositionsMultiple(addresses = []) {
    const positions = {};
    
    for (const address of addresses) {
      try {
        positions[address] = await this.getPosition(address);
      } catch (error) {
        positions[address] = null;
        console.error(`Failed to get position for controller ${address}:`, error);
      }
    }
    
    return positions;
  }

  /**
   * Parse status response from controller
   */
  parseStatusResponse(statusData) {
    // Basic status parsing - would need to be expanded based on actual MKS57D protocol
    return {
      ready: statusData.includes('OK') || statusData.includes('READY'),
      error: statusData.includes('ERROR'),
      moving: statusData.includes('MOVING'),
      raw: statusData
    };
  }

  /**
   * Convert degrees to steps based on controller configuration
   * @param {number} degrees - Angle in degrees
   * @param {number} stepsPerRev - Steps per revolution (default: 3200 for MKS57D)
   */
  degreesToSteps(degrees, stepsPerRev = 3200) {
    return Math.round((degrees / 360) * stepsPerRev);
  }

  /**
   * Convert steps to degrees
   * @param {number} steps - Steps
   * @param {number} stepsPerRev - Steps per revolution (default: 3200 for MKS57D)
   */
  stepsToDegrees(steps, stepsPerRev = 3200) {
    return (steps / stepsPerRev) * 360;
  }
}

module.exports = MKS57D;