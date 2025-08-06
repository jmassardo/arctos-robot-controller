const MKS57D = require('./mks57d');

/**
 * MKS57D Controller Manager
 * Manages multiple MKS57D controllers and provides high-level interface
 */
class MKS57DManager {
  constructor(config = {}) {
    this.config = config;
    this.mks57d = null;
    this.controllers = new Map();
    this.isInitialized = false;
    
    // Default controller addresses for a 6-axis robot arm
    this.defaultAddresses = config.controllerAddresses || [1, 2, 3, 4, 5, 6];
  }

  /**
   * Initialize the MKS57D manager
   */
  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      // Create MKS57D instance with RS485 config
      this.mks57d = new MKS57D(this.config.rs485Config);
      
      // Connect to the RS485 bus
      const connected = await this.mks57d.connect();
      if (!connected) {
        throw new Error('Failed to connect to MKS57D RS485 bus');
      }

      // Initialize controller tracking
      for (const address of this.defaultAddresses) {
        this.controllers.set(address, {
          address,
          position: 0,
          lastKnownPosition: 0,
          isHomed: false,
          isMoving: false,
          lastUpdate: null
        });
      }

      this.isInitialized = true;
      console.log(`MKS57D Manager initialized with controllers: ${this.defaultAddresses.join(', ')}`);
      return true;
    } catch (error) {
      console.error('Failed to initialize MKS57D Manager:', error);
      return false;
    }
  }

  /**
   * Get current positions from all controllers
   */
  async getAllPositions() {
    if (!this.isInitialized) {
      throw new Error('MKS57D Manager not initialized');
    }

    try {
      const addresses = Array.from(this.controllers.keys());
      const positions = await this.mks57d.getPositionsMultiple(addresses);
      
      // Update our tracking
      for (const [address, position] of Object.entries(positions)) {
        if (position !== null) {
          const controller = this.controllers.get(parseInt(address));
          if (controller) {
            controller.lastKnownPosition = position;
            controller.position = this.mks57d.stepsToDegrees(position);
            controller.lastUpdate = Date.now();
          }
        }
      }
      
      return this.getControllerStates();
    } catch (error) {
      console.error('Failed to get all positions:', error);
      throw error;
    }
  }

  /**
   * Home all controllers
   */
  async homeAll() {
    if (!this.isInitialized) {
      throw new Error('MKS57D Manager not initialized');
    }

    try {
      const addresses = Array.from(this.controllers.keys());
      const results = await this.mks57d.homeMultiple(addresses);
      
      // Update homing status
      for (const [address, success] of Object.entries(results)) {
        const controller = this.controllers.get(parseInt(address));
        if (controller) {
          controller.isHomed = success;
          if (success) {
            controller.position = 0;
            controller.lastKnownPosition = 0;
          }
        }
      }
      
      return results;
    } catch (error) {
      console.error('Failed to home all controllers:', error);
      throw error;
    }
  }

  /**
   * Move single axis to position
   * @param {string} axis - Axis identifier (axis1, axis2, etc.)
   * @param {number} degrees - Target position in degrees
   */
  async moveAxis(axis, degrees) {
    if (!this.isInitialized) {
      throw new Error('MKS57D Manager not initialized');
    }

    // Convert axis name to controller address
    const axisNumber = parseInt(axis.replace('axis', ''));
    const address = axisNumber;
    
    if (!this.controllers.has(address)) {
      throw new Error(`Controller ${address} not configured`);
    }

    try {
      const steps = this.mks57d.degreesToSteps(degrees);
      const success = await this.mks57d.moveAbsolute(address, steps);
      
      if (success) {
        const controller = this.controllers.get(address);
        controller.position = degrees;
        controller.isMoving = true;
        
        // Start position tracking
        this.trackMovement(address, steps);
      }
      
      return success;
    } catch (error) {
      console.error(`Failed to move axis ${axis} to ${degrees} degrees:`, error);
      throw error;
    }
  }

  /**
   * Move multiple axes simultaneously
   * @param {Object} axisPositions - Object with axis: degrees pairs
   */
  async moveMultipleAxes(axisPositions) {
    if (!this.isInitialized) {
      throw new Error('MKS57D Manager not initialized');
    }

    const promises = [];
    for (const [axis, degrees] of Object.entries(axisPositions)) {
      promises.push(this.moveAxis(axis, degrees));
    }

    try {
      const results = await Promise.all(promises);
      return results.every(result => result);
    } catch (error) {
      console.error('Failed to move multiple axes:', error);
      throw error;
    }
  }

  /**
   * Emergency stop all controllers
   */
  async emergencyStop() {
    if (!this.isInitialized) {
      console.warn('MKS57D Manager not initialized, cannot emergency stop');
      return false;
    }

    try {
      const addresses = Array.from(this.controllers.keys());
      const success = await this.mks57d.emergencyStopAll(addresses);
      
      // Update movement status
      for (const controller of this.controllers.values()) {
        controller.isMoving = false;
      }
      
      return success;
    } catch (error) {
      console.error('Emergency stop failed:', error);
      return false;
    }
  }

  /**
   * Parse G-code command and convert to controller movements
   * @param {string} gcodeLine - Single line of G-code
   */
  parseGCodeToMovements(gcodeLine) {
    const movements = {};
    const line = gcodeLine.trim().toUpperCase();
    
    // Handle G1 (linear move) commands
    if (line.startsWith('G1') || line.startsWith('G0')) {
      const matches = {
        X: line.match(/X([-+]?\d*\.?\d+)/),
        Y: line.match(/Y([-+]?\d*\.?\d+)/),
        Z: line.match(/Z([-+]?\d*\.?\d+)/),
        A: line.match(/A([-+]?\d*\.?\d+)/),
        B: line.match(/B([-+]?\d*\.?\d+)/),
        C: line.match(/C([-+]?\d*\.?\d+)/)
      };
      
      // Map G-code axes to robot axes
      const axisMapping = {
        X: 'axis1',
        Y: 'axis2', 
        Z: 'axis3',
        A: 'axis4',
        B: 'axis5',
        C: 'axis6'
      };
      
      for (const [gcodeAxis, match] of Object.entries(matches)) {
        if (match && axisMapping[gcodeAxis]) {
          movements[axisMapping[gcodeAxis]] = parseFloat(match[1]);
        }
      }
    }
    
    // Handle G28 (home) command
    if (line.startsWith('G28')) {
      movements._home = true;
    }
    
    return movements;
  }

  /**
   * Execute G-code command
   * @param {string} gcodeLine - Single line of G-code
   */
  async executeGCode(gcodeLine) {
    const movements = this.parseGCodeToMovements(gcodeLine);
    
    if (movements._home) {
      return await this.homeAll();
    } else if (Object.keys(movements).length > 0) {
      return await this.moveMultipleAxes(movements);
    }
    
    return true; // No movement command, consider success
  }

  /**
   * Track movement completion (simplified version)
   */
  trackMovement(address, targetSteps) {
    const controller = this.controllers.get(address);
    if (!controller) return;
    
    // Simple timeout-based completion tracking
    // In a real implementation, you'd poll the controller status
    setTimeout(async () => {
      try {
        const currentPosition = await this.mks57d.getPosition(address);
        controller.lastKnownPosition = currentPosition;
        controller.position = this.mks57d.stepsToDegrees(currentPosition);
        controller.isMoving = Math.abs(currentPosition - targetSteps) > 10; // Tolerance
        controller.lastUpdate = Date.now();
      } catch (error) {
        console.error(`Failed to track movement for controller ${address}:`, error);
        controller.isMoving = false;
      }
    }, 2000); // 2 second delay
  }

  /**
   * Get current state of all controllers
   */
  getControllerStates() {
    const states = {};
    for (const [address, controller] of this.controllers.entries()) {
      states[`axis${address}`] = {
        position: controller.position,
        isHomed: controller.isHomed,
        isMoving: controller.isMoving,
        lastUpdate: controller.lastUpdate
      };
    }
    return states;
  }

  /**
   * Shutdown the manager
   */
  async shutdown() {
    if (this.mks57d) {
      await this.mks57d.disconnect();
    }
    this.isInitialized = false;
  }
}

module.exports = MKS57DManager;