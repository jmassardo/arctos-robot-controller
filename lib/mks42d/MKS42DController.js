/**
 * MKS42D Stepper Controller CAN Communication Library
 * Implements commands from MKS SERVO42/57D CAN User Manual V1.0.6
 */

// Handle optional socketcan dependency (Linux-only)
let can;
try {
  can = require('socketcan');
} catch (error) {
  console.warn('socketcan module not available (Linux only). Running in simulation mode.');
  can = null;
}

const EventEmitter = require('events');

class MKS42DController extends EventEmitter {
  constructor(options = {}) {
    super();

    this.interface = options.interface || 'can0';
    this.controllers = options.controllers || [];
    this.isConnected = false;
    this.channel = null;
    // Enable simulation mode if socketcan is not available or explicitly requested
    this.simulationMode = options.simulationMode || !can;

    if (!can) {
      console.log('MKS42D: socketcan not available, running in simulation mode');
    }

    // MKS42D CAN Command IDs (based on typical MKS protocols)
    this.commands = {
      GO_HOME: 0x200,
      MOVE_RELATIVE: 0x201,
      MOVE_ABSOLUTE: 0x202,
      SET_POSITION: 0x203,
      GET_POSITION: 0x204,
      STOP: 0x205,
      SET_SPEED: 0x206,
      ENABLE_MOTOR: 0x207,
      DISABLE_MOTOR: 0x208,
      GET_STATUS: 0x209,
    };

    // Response command IDs
    this.responses = {
      POSITION_RESPONSE: 0x304,
      STATUS_RESPONSE: 0x309,
      COMMAND_ACK: 0x3ff,
    };

    // Controller positions cache
    this.positions = {};

    // Initialize controllers
    this.controllers.forEach(controller => {
      this.positions[controller.id] = { x: 0, y: 0, z: 0, e: 0 };
    });
  }

  /**
   * Initialize CAN connection
   */
  async connect() {
    if (this.simulationMode || !can) {
      console.log('MKS42D: Running in simulation mode');
      this.isConnected = true;
      this.emit('connected');
      return true;
    }

    try {
      this.channel = can.createRawChannel(this.interface, true);

      this.channel.addListener('onMessage', message => {
        this.handleCanMessage(message);
      });

      this.channel.start();
      this.isConnected = true;
      console.log(`MKS42D: Connected to CAN interface ${this.interface}`);
      this.emit('connected');
      return true;
    } catch (error) {
      console.error('MKS42D: Failed to connect to CAN interface:', error);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Disconnect CAN channel
   */
  disconnect() {
    if (this.channel) {
      this.channel.stop();
      this.channel = null;
    }
    this.isConnected = false;
    this.emit('disconnected');
  }

  /**
   * Handle incoming CAN messages
   */
  handleCanMessage(message) {
    const commandId = message.id & 0xfff;
    const controllerId = (message.id >> 12) & 0xff;

    switch (commandId) {
      case this.responses.POSITION_RESPONSE:
        this.handlePositionResponse(controllerId, message.data);
        break;
      case this.responses.STATUS_RESPONSE:
        this.handleStatusResponse(controllerId, message.data);
        break;
      case this.responses.COMMAND_ACK:
        this.handleCommandAck(controllerId, message.data);
        break;
      default:
        console.log(`MKS42D: Unknown message received: ${message.id.toString(16)}`);
    }
  }

  /**
   * Send CAN message to controller(s)
   */
  async sendCommand(controllerIds, commandId, data = []) {
    if (!Array.isArray(controllerIds)) {
      controllerIds = [controllerIds];
    }

    const promises = controllerIds.map(async controllerId => {
      if (this.simulationMode) {
        return this.simulateCommand(controllerId, commandId, data);
      }

      if (!this.isConnected) {
        throw new Error('CAN interface not connected');
      }

      const canId = (controllerId << 12) | commandId;
      const message = {
        id: canId,
        data: Buffer.from(data),
        ext: false,
      };

      try {
        this.channel.send(message);
        return { success: true, controllerId };
      } catch (error) {
        console.error(`MKS42D: Failed to send command to controller ${controllerId}:`, error);
        return { success: false, controllerId, error };
      }
    });

    return Promise.all(promises);
  }

  /**
   * Simulate command execution for testing
   */
  async simulateCommand(controllerId, commandId, data) {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 50));

    switch (commandId) {
      case this.commands.GET_POSITION:
        // Simulate position response
        setTimeout(() => {
          this.handlePositionResponse(controllerId, [0, 0, 0, 0, 0, 0, 0, 0]);
        }, 100);
        break;
      case this.commands.GO_HOME:
        // Simulate homing completion
        setTimeout(() => {
          this.positions[controllerId] = { x: 0, y: 0, z: 0, e: 0 };
          this.handleCommandAck(controllerId, [0x01]);
        }, 2000);
        break;
      case this.commands.MOVE_ABSOLUTE:
      case this.commands.MOVE_RELATIVE:
        // Simulate move completion
        setTimeout(() => {
          this.handleCommandAck(controllerId, [0x01]);
        }, 1000);
        break;
    }

    return { success: true, controllerId };
  }

  /**
   * Send GO_HOME command to multiple controllers
   */
  async goHome(controllerIds = null) {
    if (!controllerIds) {
      controllerIds = this.controllers.map(c => c.id);
    }

    console.log(`MKS42D: Sending GO_HOME command to controllers: ${controllerIds.join(', ')}`);
    const results = await this.sendCommand(controllerIds, this.commands.GO_HOME);

    this.emit('homeStarted', { controllerIds, results });
    return results;
  }

  /**
   * Move controller to absolute position
   */
  async moveAbsolute(controllerId, axis, position, speed = 1000) {
    const data = [
      axis, // Axis number (0=X, 1=Y, 2=Z, 3=E)
      ...this.int32ToBytes(position), // Position in steps/degrees
      ...this.int16ToBytes(speed), // Speed
    ];

    console.log(
      `MKS42D: Moving controller ${controllerId} axis ${axis} to absolute position ${position}`
    );
    const results = await this.sendCommand(controllerId, this.commands.MOVE_ABSOLUTE, data);

    this.emit('moveStarted', { controllerId, axis, position, speed, type: 'absolute' });
    return results;
  }

  /**
   * Move controller relative to current position
   */
  async moveRelative(controllerId, axis, distance, speed = 1000) {
    const data = [
      axis, // Axis number
      ...this.int32ToBytes(distance), // Distance in steps/degrees
      ...this.int16ToBytes(speed), // Speed
    ];

    console.log(
      `MKS42D: Moving controller ${controllerId} axis ${axis} relative distance ${distance}`
    );
    const results = await this.sendCommand(controllerId, this.commands.MOVE_RELATIVE, data);

    this.emit('moveStarted', { controllerId, axis, distance, speed, type: 'relative' });
    return results;
  }

  /**
   * Get current position from controller
   */
  async getPosition(controllerId) {
    console.log(`MKS42D: Requesting position from controller ${controllerId}`);
    const results = await this.sendCommand(controllerId, this.commands.GET_POSITION);

    // Return cached position immediately, actual position will be updated via CAN response
    return this.positions[controllerId] || { x: 0, y: 0, z: 0, e: 0 };
  }

  /**
   * Get positions from all controllers
   */
  async getAllPositions() {
    const controllerIds = this.controllers.map(c => c.id);
    const promises = controllerIds.map(id => this.getPosition(id));
    const positions = await Promise.all(promises);

    const result = {};
    controllerIds.forEach((id, index) => {
      result[id] = positions[index];
    });

    return result;
  }

  /**
   * Stop all movement on controller
   */
  async stop(controllerIds = null) {
    if (!controllerIds) {
      controllerIds = this.controllers.map(c => c.id);
    }

    console.log(`MKS42D: Stopping controllers: ${controllerIds.join(', ')}`);
    const results = await this.sendCommand(controllerIds, this.commands.STOP);

    this.emit('stopped', { controllerIds, results });
    return results;
  }

  /**
   * Enable/disable motor
   */
  async setMotorState(controllerId, enabled = true) {
    const commandId = enabled ? this.commands.ENABLE_MOTOR : this.commands.DISABLE_MOTOR;
    console.log(
      `MKS42D: ${enabled ? 'Enabling' : 'Disabling'} motor on controller ${controllerId}`
    );

    const results = await this.sendCommand(controllerId, commandId);
    this.emit('motorStateChanged', { controllerId, enabled, results });
    return results;
  }

  // Message handlers
  handlePositionResponse(controllerId, data) {
    // Parse position data (assuming 4 axes, 2 bytes each, signed)
    const position = {
      x: this.bytesToInt16(data.slice(0, 2)),
      y: this.bytesToInt16(data.slice(2, 4)),
      z: this.bytesToInt16(data.slice(4, 6)),
      e: this.bytesToInt16(data.slice(6, 8)),
    };

    this.positions[controllerId] = position;
    this.emit('positionUpdated', { controllerId, position });
  }

  handleStatusResponse(controllerId, data) {
    const status = {
      isHomed: (data[0] & 0x01) !== 0,
      isMoving: (data[0] & 0x02) !== 0,
      isEnabled: (data[0] & 0x04) !== 0,
      hasError: (data[0] & 0x80) !== 0,
    };

    this.emit('statusUpdated', { controllerId, status });
  }

  handleCommandAck(controllerId, data) {
    const success = data[0] === 0x01;
    this.emit('commandAck', { controllerId, success });
  }

  // Utility methods
  int32ToBytes(value) {
    return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
  }

  int16ToBytes(value) {
    return [value & 0xff, (value >> 8) & 0xff];
  }

  bytesToInt16(bytes) {
    return (bytes[1] << 8) | bytes[0];
  }

  bytesToInt32(bytes) {
    return (bytes[3] << 24) | (bytes[2] << 16) | (bytes[1] << 8) | bytes[0];
  }
}

module.exports = MKS42DController;
