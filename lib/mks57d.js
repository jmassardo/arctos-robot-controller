// Handle optional socketcan dependency (Linux-only)
let can;
try {
  can = require('socketcan');
} catch (error) {
  console.warn('socketcan module not available (Linux only). Running in simulation mode.');
  can = null;
}

/**
 * MKS57D Stepper Controller Library
 * Implements communication with MKS57D controllers over CAN bus
 */
class MKS57D {
  constructor(config = {}) {
    this.config = {
      interface: config.interface || 'can0',
      timeout: config.timeout || 1000,
      baseCanId: config.baseCanId || 0x100,
      ...config
    };
    
    this.canChannel = null;
    this.isConnected = false;
    this.pendingCommands = new Map();
    this.commandId = 0;
    this.simulationMode = !can; // Enable simulation if socketcan not available
    
    if (!can) {
      console.log('MKS57D: socketcan not available, running in simulation mode');
    }
  }

  /**
   * Initialize connection to MKS57D controller via CAN bus
   */
  async connect() {
    try {
      if (this.isConnected) {
        return true;
      }

      if (this.simulationMode) {
        console.log('MKS57D: Running in simulation mode');
        this.isConnected = true;
        return true;
      }

      this.canChannel = can.createRawChannel(this.config.interface, true);
      
      // Handle CAN messages
      this.canChannel.addListener('onMessage', (msg) => {
        this.handleCanMessage(msg);
      });

      this.canChannel.addListener('onStopped', () => {
        console.log('CAN channel stopped');
        this.isConnected = false;
      });

      this.canChannel.start();
      this.isConnected = true;
      console.log(`MKS57D connected to CAN interface: ${this.config.interface}`);
      return true;
    } catch (error) {
      console.error('Failed to connect to MKS57D via CAN:', error);
      return false;
    }
  }

  /**
   * Disconnect from controller
   */
  async disconnect() {
    if (this.canChannel && this.isConnected) {
      this.canChannel.stop();
      this.isConnected = false;
    }
  }

  /**
   * Send command to MKS57D controller via CAN
   * @param {number} address - Controller address (1-247)
   * @param {string} command - Command string
   * @param {Object} options - Command options
   */
  async sendCommand(address, command, options = {}) {
    if (!this.isConnected) {
      throw new Error('MKS57D not connected');
    }

    const commandId = ++this.commandId;
    const canId = this.config.baseCanId + address;
    
    // Convert command to CAN data format
    const commandData = this.encodeCommand(command);
    
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
        canId,
        timestamp: Date.now()
      });

      // Send CAN message
      try {
        this.canChannel.send({
          id: canId,
          data: commandData
        });
      } catch (err) {
        clearTimeout(timeout);
        this.pendingCommands.delete(commandId);
        reject(err);
      }
    });
  }

  /**
   * Handle CAN message from controller
   */
  handleCanMessage(msg) {
    if (!msg.data || msg.data.length === 0) return;

    // Extract address from CAN ID
    const address = msg.id - this.config.baseCanId;
    if (address < 1 || address > 247) return;
    
    // Decode response data
    const responseData = this.decodeResponse(msg.data);
    
    // Find matching pending command
    for (const [commandId, pendingCmd] of this.pendingCommands.entries()) {
      if (pendingCmd.address === address) {
        clearTimeout(pendingCmd.timeout);
        this.pendingCommands.delete(commandId);
        pendingCmd.resolve({
          address,
          data: responseData,
          raw: msg.data
        });
        return;
      }
    }

    console.warn('Unmatched CAN response:', msg);
  }

  /**
   * Encode command string to CAN data format
   */
  encodeCommand(command) {
    // Convert command string to buffer with max 8 bytes for CAN
    const buffer = Buffer.from(command, 'utf8');
    return buffer.slice(0, 8); // CAN frames can carry max 8 bytes
  }

  /**
   * Decode CAN data to response string
   */
  decodeResponse(data) {
    // Convert buffer back to string, removing null bytes
    return data.toString('utf8').replace(/\0/g, '').trim();
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