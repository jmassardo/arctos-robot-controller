/**
 * G-code to MKS42D Command Translator
 * Converts G-code commands to MKS42D stepper controller commands
 */

class GCodeTranslator {
  constructor(mks42d, config = {}) {
    this.mks42d = mks42d;
    this.config = {
      stepsPerMM: config.stepsPerMM || { x: 80, y: 80, z: 400, e: 93 },
      maxSpeed: config.maxSpeed || { x: 3000, y: 3000, z: 1500, e: 2000 },
      homingSpeed: config.homingSpeed || 1000,
      ...config
    };
    
    // Current position tracking
    this.currentPosition = { x: 0, y: 0, z: 0, e: 0 };
    this.absoluteMode = true; // G90 = absolute, G91 = relative
    this.currentSpeed = 1000;
    this.unitsInMM = true; // G21 = mm, G20 = inches
  }

  /**
   * Parse and execute G-code string
   */
  async executeGCode(gcode, progressCallback = null) {
    const lines = gcode.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith(';'));
    const totalLines = lines.length;
    
    console.log(`MKS42D G-code: Processing ${totalLines} lines`);
    
    const results = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      try {
        const result = await this.parseLine(line);
        results.push({ line: i + 1, command: line, result, success: true });
        
        if (progressCallback) {
          progressCallback((i + 1) / totalLines * 100);
        }
        
        // Add small delay between commands to avoid overwhelming the controllers
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        console.error(`MKS42D G-code: Error on line ${i + 1} (${line}):`, error);
        results.push({ line: i + 1, command: line, error: error.message, success: false });
        
        if (progressCallback) {
          progressCallback((i + 1) / totalLines * 100);
        }
      }
    }
    
    return results;
  }

  /**
   * Parse a single G-code line
   */
  async parseLine(line) {
    // Remove comments
    line = line.split(';')[0].trim();
    if (!line) return null;
    
    // Parse command and parameters
    const parts = line.split(/\s+/);
    const command = parts[0].toUpperCase();
    const params = this.parseParameters(parts.slice(1));
    
    switch (command) {
      // Linear interpolation
      case 'G0':
      case 'G1':
        return await this.handleLinearMove(params);
      
      // Home all axes
      case 'G28':
        return await this.handleHome(params);
      
      // Absolute positioning
      case 'G90':
        this.absoluteMode = true;
        return { command: 'G90', message: 'Set to absolute positioning' };
      
      // Relative positioning
      case 'G91':
        this.absoluteMode = false;
        return { command: 'G91', message: 'Set to relative positioning' };
      
      // Set units to millimeters
      case 'G21':
        this.unitsInMM = true;
        return { command: 'G21', message: 'Set units to millimeters' };
      
      // Set units to inches
      case 'G20':
        this.unitsInMM = false;
        return { command: 'G20', message: 'Set units to inches' };
      
      // Dwell (pause)
      case 'G4':
        const pauseTime = params.P || 0;
        await new Promise(resolve => setTimeout(resolve, pauseTime));
        return { command: 'G4', message: `Paused for ${pauseTime}ms` };
      
      // Program stop
      case 'M0':
      case 'M1':
        await this.mks42d.stop();
        return { command, message: 'Program stopped' };
      
      // End program
      case 'M2':
      case 'M30':
        await this.mks42d.stop();
        return { command, message: 'Program ended' };
      
      // Activate gripper/spindle
      case 'M106':
      case 'M3':
        return await this.handleGripperControl(true, params);
      
      // Deactivate gripper/spindle
      case 'M107':
      case 'M5':
        return await this.handleGripperControl(false, params);
      
      default:
        console.warn(`MKS42D G-code: Unknown command ${command}`);
        return { command, message: `Unknown command: ${command}` };
    }
  }

  /**
   * Parse command parameters
   */
  parseParameters(parts) {
    const params = {};
    
    parts.forEach(part => {
      if (part.length >= 2) {
        const axis = part[0].toUpperCase();
        const value = parseFloat(part.substring(1));
        if (!isNaN(value)) {
          params[axis] = value;
        }
      }
    });
    
    return params;
  }

  /**
   * Handle linear movement (G0/G1)
   */
  async handleLinearMove(params) {
    const moves = [];
    const speed = params.F ? params.F : this.currentSpeed;
    
    if (params.F) {
      this.currentSpeed = params.F;
    }
    
    // Convert units if necessary
    const unitMultiplier = this.unitsInMM ? 1 : 25.4; // inches to mm
    
    // Process each axis
    for (const [axis, value] of Object.entries(params)) {
      if (['X', 'Y', 'Z', 'E'].includes(axis)) {
        const axisLower = axis.toLowerCase();
        const targetPosition = value * unitMultiplier;
        
        let finalPosition;
        if (this.absoluteMode) {
          finalPosition = targetPosition;
        } else {
          finalPosition = this.currentPosition[axisLower] + targetPosition;
        }
        
        // Convert position to steps
        const stepsPerUnit = this.config.stepsPerMM[axisLower] || 80;
        const targetSteps = Math.round(finalPosition * stepsPerUnit);
        const currentSteps = Math.round(this.currentPosition[axisLower] * stepsPerUnit);
        
        // Determine which controllers handle this axis
        const controllerIds = this.getControllersForAxis(axis);
        
        if (controllerIds.length > 0) {
          // Send move command to all relevant controllers
          for (const controllerId of controllerIds) {
            if (this.absoluteMode) {
              await this.mks42d.moveAbsolute(controllerId, this.getAxisNumber(axis), targetSteps, speed);
            } else {
              const distance = targetSteps - currentSteps;
              await this.mks42d.moveRelative(controllerId, this.getAxisNumber(axis), distance, speed);
            }
          }
          
          moves.push({
            axis: axisLower,
            from: this.currentPosition[axisLower],
            to: finalPosition,
            controllers: controllerIds
          });
          
          // Update current position
          this.currentPosition[axisLower] = finalPosition;
        }
      }
    }
    
    if (moves.length > 0) {
      return {
        command: 'G0/G1',
        message: `Linear move executed`,
        moves,
        speed
      };
    } else {
      return { command: 'G0/G1', message: 'No movement required' };
    }
  }

  /**
   * Handle homing command (G28)
   */
  async handleHome(params) {
    let controllerIds = [];
    
    if (Object.keys(params).length === 0) {
      // Home all axes
      controllerIds = this.mks42d.controllers.map(c => c.id);
    } else {
      // Home specific axes
      for (const axis of Object.keys(params)) {
        if (['X', 'Y', 'Z', 'E'].includes(axis)) {
          controllerIds.push(...this.getControllersForAxis(axis));
        }
      }
      // Remove duplicates
      controllerIds = [...new Set(controllerIds)];
    }
    
    if (controllerIds.length > 0) {
      await this.mks42d.goHome(controllerIds);
      
      // Reset position tracking for homed axes
      if (Object.keys(params).length === 0) {
        this.currentPosition = { x: 0, y: 0, z: 0, e: 0 };
      } else {
        for (const axis of Object.keys(params)) {
          if (['X', 'Y', 'Z', 'E'].includes(axis)) {
            this.currentPosition[axis.toLowerCase()] = 0;
          }
        }
      }
    }
    
    return {
      command: 'G28',
      message: `Homing ${controllerIds.length} controllers`,
      controllers: controllerIds
    };
  }

  /**
   * Handle gripper control (M106/M107, M3/M5)
   */
  async handleGripperControl(activate, params) {
    // Find controllers that handle gripper/end effector
    const gripperControllers = this.mks42d.controllers.filter(c => 
      c.type === 'gripper' || c.axes.includes('E')
    );
    
    const results = [];
    
    for (const controller of gripperControllers) {
      try {
        // Use E axis (extruder/gripper axis) for gripper control
        const axisNumber = this.getAxisNumber('E');
        const position = activate ? (params.S || 100) : 0; // S parameter for gripper position
        
        await this.mks42d.moveAbsolute(controller.id, axisNumber, position, 500);
        results.push({ controllerId: controller.id, success: true });
      } catch (error) {
        results.push({ controllerId: controller.id, success: false, error: error.message });
      }
    }
    
    return {
      command: activate ? 'M106/M3' : 'M107/M5',
      message: `Gripper ${activate ? 'activated' : 'deactivated'}`,
      results
    };
  }

  /**
   * Get controller IDs that handle a specific axis
   */
  getControllersForAxis(axis) {
    return this.mks42d.controllers
      .filter(controller => controller.axes && controller.axes.includes(axis.toUpperCase()))
      .map(controller => controller.id);
  }

  /**
   * Convert axis letter to number
   */
  getAxisNumber(axis) {
    const axisMap = { 'X': 0, 'Y': 1, 'Z': 2, 'E': 3 };
    return axisMap[axis.toUpperCase()] || 0;
  }

  /**
   * Get current position in G-code coordinates
   */
  getCurrentPosition() {
    return { ...this.currentPosition };
  }

  /**
   * Set current position (for position synchronization)
   */
  setCurrentPosition(position) {
    this.currentPosition = { ...this.currentPosition, ...position };
  }
}

module.exports = GCodeTranslator;
