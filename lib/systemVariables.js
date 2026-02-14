const { logger } = require('./logger');

/**
 * System Variables Manager for G-code Standard Variables
 * Implements standard G-code system variables and coordinate system offsets
 */
class SystemVariables {
  constructor() {
    // Current machine position variables (read-only)
    this.currentPosition = {
      5061: 0, // Current X position in work coordinates
      5062: 0, // Current Y position in work coordinates
      5063: 0, // Current Z position in work coordinates
      5064: 0, // Current A position in work coordinates
      5065: 0, // Current B position in work coordinates
      5066: 0, // Current C position in work coordinates
    };

    // Current machine position in machine coordinates
    this.machinePosition = {
      5041: 0, // Machine X position
      5042: 0, // Machine Y position
      5043: 0, // Machine Z position
      5044: 0, // Machine A position
      5045: 0, // Machine B position
      5046: 0, // Machine C position
    };

    // Feed rate and spindle speed
    this.feedSpindle = {
      5070: 0,    // Current feed rate
      5071: 0,    // Current spindle speed
    };

    // Work coordinate system offsets (G54-G59)
    this.workOffsets = {
      // G54 offsets (coordinate system 1)
      5221: 0, // G54 X offset
      5222: 0, // G54 Y offset  
      5223: 0, // G54 Z offset
      5224: 0, // G54 A offset
      5225: 0, // G54 B offset
      5226: 0, // G54 C offset

      // G55 offsets (coordinate system 2)
      5241: 0, // G55 X offset
      5242: 0, // G55 Y offset
      5243: 0, // G55 Z offset
      5244: 0, // G55 A offset
      5245: 0, // G55 B offset
      5246: 0, // G55 C offset

      // G56 offsets (coordinate system 3)
      5261: 0, // G56 X offset
      5262: 0, // G56 Y offset
      5263: 0, // G56 Z offset
      5264: 0, // G56 A offset
      5265: 0, // G56 B offset
      5266: 0, // G56 C offset

      // G57 offsets (coordinate system 4)
      5281: 0, // G57 X offset
      5282: 0, // G57 Y offset
      5283: 0, // G57 Z offset
      5284: 0, // G57 A offset
      5285: 0, // G57 B offset
      5286: 0, // G57 C offset

      // G58 offsets (coordinate system 5)
      5301: 0, // G58 X offset
      5302: 0, // G58 Y offset
      5303: 0, // G58 Z offset
      5304: 0, // G58 A offset
      5305: 0, // G58 B offset
      5306: 0, // G58 C offset

      // G59 offsets (coordinate system 6)
      5321: 0, // G59 X offset
      5322: 0, // G59 Y offset
      5323: 0, // G59 Z offset
      5324: 0, // G59 A offset
      5325: 0, // G59 B offset
      5326: 0, // G59 C offset
    };

    // Tool variables
    this.toolVariables = {
      5400: 0, // Current tool number
      5401: 0, // Tool X offset
      5402: 0, // Tool Y offset
      5403: 0, // Tool Z offset
      5404: 0, // Tool A offset
      5405: 0, // Tool B offset
      5406: 0, // Tool C offset
      5407: 0, // Tool diameter
      5408: 0, // Tool radius compensation
    };

    // Probing and measurement variables
    this.probingVariables = {
      5061: 0, // Probe X position
      5062: 0, // Probe Y position
      5063: 0, // Probe Z position
      5064: 0, // Probe A position
      5065: 0, // Probe B position
      5066: 0, // Probe C position
      5067: 0, // Probe success flag
    };

    // Modal group variables
    this.modalVariables = {
      5070: 0, // Current feed rate
      5080: 1, // Motion mode (G0, G1, G2, G3)
      5090: 0, // Current coordinate system (54-59)
      5100: 17, // Current plane (G17=0, G18=1, G19=2) 
      5110: 90, // Distance mode (G90=0, G91=1)
      5120: 21, // Units mode (G20=0 inches, G21=1 mm)
      5130: 40, // Compensation mode
      5140: 0,  // Current cutter radius compensation
      5150: 43, // Tool length compensation mode
    };

    // Runtime variables
    this.runtime = {
      5050: 0, // Program running flag
      5051: 0, // Current line number
      5052: 0, // Current program number
      5053: 0, // Execution time in seconds
      5054: 0, // Feed override percentage (100 = normal)
      5055: 0, // Spindle override percentage (100 = normal)
      5056: 0, // Rapid override percentage (100 = normal)
    };

    this.activeCoordinateSystem = 54; // Default to G54
    this.isInitialized = false;
  }

  /**
   * Initialize system variables with default values
   */
  initialize() {
    if (this.isInitialized) {
      return;
    }

    // Set default modal states
    this.modalVariables[5090] = 54; // G54 coordinate system
    this.modalVariables[5100] = 17; // XY plane (G17)
    this.modalVariables[5110] = 90; // Absolute positioning (G90)
    this.modalVariables[5120] = 21; // Millimeter units (G21)
    
    // Set default overrides
    this.runtime[5054] = 100; // 100% feed rate
    this.runtime[5055] = 100; // 100% spindle speed
    this.runtime[5056] = 100; // 100% rapid rate

    this.isInitialized = true;
    logger.debug('System variables initialized');
  }

  /**
   * Get system variable value
   * @param {number|string} variableNumber - Variable number (5061, etc.)
   * @returns {number} Variable value
   */
  getVariable(variableNumber) {
    const varNum = parseInt(variableNumber);
    
    // Check all variable categories
    if (this.currentPosition.hasOwnProperty(varNum)) {
      return this.currentPosition[varNum];
    }
    
    if (this.machinePosition.hasOwnProperty(varNum)) {
      return this.machinePosition[varNum];
    }
    
    if (this.feedSpindle.hasOwnProperty(varNum)) {
      return this.feedSpindle[varNum];
    }
    
    if (this.workOffsets.hasOwnProperty(varNum)) {
      return this.workOffsets[varNum];
    }
    
    if (this.toolVariables.hasOwnProperty(varNum)) {
      return this.toolVariables[varNum];
    }
    
    if (this.probingVariables.hasOwnProperty(varNum)) {
      return this.probingVariables[varNum];
    }
    
    if (this.modalVariables.hasOwnProperty(varNum)) {
      return this.modalVariables[varNum];
    }
    
    if (this.runtime.hasOwnProperty(varNum)) {
      return this.runtime[varNum];
    }
    
    logger.warn(`Unknown system variable: #${varNum}`);
    return 0; // Return 0 for unknown variables per G-code standard
  }

  /**
   * Set system variable value (for writable variables only)
   * @param {number|string} variableNumber - Variable number
   * @param {number} value - New value
   * @returns {boolean} True if variable was set, false if read-only
   */
  setVariable(variableNumber, value) {
    const varNum = parseInt(variableNumber);
    const numValue = parseFloat(value);
    
    if (isNaN(numValue)) {
      throw new Error(`Invalid numeric value for system variable #${varNum}: ${value}`);
    }

    // Work coordinate system offsets are writable
    if (this.workOffsets.hasOwnProperty(varNum)) {
      this.workOffsets[varNum] = numValue;
      logger.debug(`Set work offset #${varNum} = ${numValue}`);
      return true;
    }
    
    // Tool variables are writable
    if (this.toolVariables.hasOwnProperty(varNum)) {
      this.toolVariables[varNum] = numValue;
      logger.debug(`Set tool variable #${varNum} = ${numValue}`);
      return true;
    }
    
    // Some modal variables are writable
    if ([5070, 5054, 5055, 5056].includes(varNum)) {
      this.modalVariables[varNum] = numValue;
      logger.debug(`Set modal variable #${varNum} = ${numValue}`);
      return true;
    }
    
    // Position variables are read-only
    if (this.machinePosition.hasOwnProperty(varNum)) {
      logger.warn(`Attempted to set read-only position variable #${varNum}`);
      return false;
    }
    
    logger.warn(`Unknown or read-only system variable: #${varNum}`);
    return false;
  }

  /**
   * Update current position variables
   * @param {Object} position - Position object with x, y, z, a, b, c
   */
  updateCurrentPosition(position) {
    if (this.currentPosition[5061] = position.x) {
      ;
    }
    if (this.currentPosition[5062] = position.y) {
      ;
    }
    if (this.currentPosition[5063] = position.z) {
      ;
    }
    if (this.currentPosition[5064] = position.a) {
      ;
    }
    if (this.currentPosition[5065] = position.b) {
      ;
    }
    if (this.currentPosition[5066] = position.c) {
      ;
    }
  }

  /**
   * Update machine position variables
   * @param {Object} position - Machine position object
   */
  updateMachinePosition(position) {
    if (this.machinePosition[5041] = position.x) {
      ;
    }
    if (this.machinePosition[5042] = position.y) {
      ;
    }
    if (this.machinePosition[5043] = position.z) {
      ;
    }
    if (this.machinePosition[5044] = position.a) {
      ;
    }
    if (this.machinePosition[5045] = position.b) {
      ;
    }
    if (this.machinePosition[5046] = position.c) {
      ;
    }
  }

  /**
   * Update feed rate
   * @param {number} feedRate - Feed rate in mm/min
   */
  updateFeedRate(feedRate) {
    this.feedSpindle[5070] = feedRate;
    this.modalVariables[5070] = feedRate;
  }

  /**
   * Update spindle speed
   * @param {number} spindleSpeed - Spindle speed in RPM
   */
  updateSpindleSpeed(spindleSpeed) {
    this.feedSpindle[5071] = spindleSpeed;
  }

  /**
   * Set work coordinate system offset
   * @param {number} coordinateSystem - System number (54-59)
   * @param {string} axis - Axis letter (X, Y, Z, A, B, C)
   * @param {number} offset - Offset value
   */
  setWorkOffset(coordinateSystem, axis, offset) {
    const systemBase = this.getCoordinateSystemBase(coordinateSystem);
    const axisOffset = this.getAxisOffset(axis);
    const variableNumber = systemBase + axisOffset;
    
    if (this.workOffsets.hasOwnProperty(variableNumber)) {
      this.workOffsets[variableNumber] = offset;
      logger.debug(`Set G${coordinateSystem} ${axis} offset = ${offset}`);
    } else {
      throw new Error(`Invalid coordinate system or axis: G${coordinateSystem} ${axis}`);
    }
  }

  /**
   * Get work coordinate system offset
   * @param {number} coordinateSystem - System number (54-59)
   * @param {string} axis - Axis letter
   * @returns {number} Offset value
   */
  getWorkOffset(coordinateSystem, axis) {
    const systemBase = this.getCoordinateSystemBase(coordinateSystem);
    const axisOffset = this.getAxisOffset(axis);
    const variableNumber = systemBase + axisOffset;
    
    return this.workOffsets[variableNumber] || 0;
  }

  /**
   * Set active coordinate system
   * @param {number} coordinateSystem - System number (54-59)
   */
  setActiveCoordinateSystem(coordinateSystem) {
    if (coordinateSystem >= 54 && coordinateSystem <= 59) {
      this.activeCoordinateSystem = coordinateSystem;
      this.modalVariables[5090] = coordinateSystem;
      logger.debug(`Active coordinate system set to G${coordinateSystem}`);
    } else {
      throw new Error(`Invalid coordinate system: G${coordinateSystem}`);
    }
  }

  /**
   * Get base variable number for coordinate system
   * @param {number} coordinateSystem 
   * @returns {number}
   */
  getCoordinateSystemBase(coordinateSystem) {
    const bases = {
      54: 5221, // G54
      55: 5241, // G55
      56: 5261, // G56
      57: 5281, // G57
      58: 5301, // G58
      59: 5321  // G59
    };
    
    return bases[coordinateSystem];
  }

  /**
   * Get axis offset for variable calculation
   * @param {string} axis 
   * @returns {number}
   */
  getAxisOffset(axis) {
    const offsets = {
      'X': 0, 'Y': 1, 'Z': 2,
      'A': 3, 'B': 4, 'C': 5
    };
    
    return offsets[axis.toUpperCase()];
  }

  /**
   * Check if variable is a system variable
   * @param {number|string} variableNumber 
   * @returns {boolean}
   */
  isSystemVariable(variableNumber) {
    const varNum = parseInt(variableNumber);
    return varNum >= 5000 && varNum <= 6000;
  }

  /**
   * Check if system variable is read-only
   * @param {number|string} variableNumber 
   * @returns {boolean}
   */
  isReadOnlyVariable(variableNumber) {
    const varNum = parseInt(variableNumber);
    
    // Position variables are read-only
    if ((varNum >= 5041 && varNum <= 5046) || // Machine position
        (varNum >= 5061 && varNum <= 5066)) { // Work position
      return true;
    }
    
    // Runtime variables are mostly read-only
    if (varNum >= 5050 && varNum <= 5053) {
      return true;
    }
    
    // Modal variables except feed/spindle overrides
    if (varNum >= 5080 && varNum <= 5150 && ![5070].includes(varNum)) {
      return true;
    }
    
    return false;
  }

  /**
   * Get all system variables for monitoring
   * @returns {Object} All system variables organized by category
   */
  getAllVariables() {
    return {
      currentPosition: { ...this.currentPosition },
      machinePosition: { ...this.machinePosition },
      feedSpindle: { ...this.feedSpindle },
      workOffsets: { ...this.workOffsets },
      toolVariables: { ...this.toolVariables },
      probingVariables: { ...this.probingVariables },
      modalVariables: { ...this.modalVariables },
      runtime: { ...this.runtime },
      activeCoordinateSystem: this.activeCoordinateSystem
    };
  }

  /**
   * Update runtime information
   * @param {Object} info - Runtime information
   */
  updateRuntime(info) {
    if (info.programRunning !== undefined) {
      this.runtime[5050] = info.programRunning ? 1 : 0;
    }
    if (info.currentLine !== undefined) {
      this.runtime[5051] = info.currentLine;
    }
    if (info.programNumber !== undefined) {
      this.runtime[5052] = info.programNumber;
    }
    if (info.executionTime !== undefined) {
      this.runtime[5053] = info.executionTime;
    }
  }

  /**
   * Set override values
   * @param {Object} overrides - Override percentages
   */
  setOverrides(overrides) {
    if (overrides.feed !== undefined) {
      this.runtime[5054] = Math.max(10, Math.min(200, overrides.feed));
    }
    if (overrides.spindle !== undefined) {
      this.runtime[5055] = Math.max(10, Math.min(200, overrides.spindle));
    }
    if (overrides.rapid !== undefined) {
      this.runtime[5056] = Math.max(10, Math.min(100, overrides.rapid));
    }
  }

  /**
   * Reset all system variables to default values
   */
  reset() {
    Object.keys(this.currentPosition).forEach(key => {
      this.currentPosition[key] = 0;
    });
    
    Object.keys(this.machinePosition).forEach(key => {
      this.machinePosition[key] = 0;
    });
    
    Object.keys(this.workOffsets).forEach(key => {
      this.workOffsets[key] = 0;
    });
    
    Object.keys(this.toolVariables).forEach(key => {
      this.toolVariables[key] = 0;
    });
    
    this.feedSpindle[5070] = 0;
    this.feedSpindle[5071] = 0;
    
    this.activeCoordinateSystem = 54;
    this.isInitialized = false;
    
    logger.debug('System variables reset to defaults');
  }
}

module.exports = { SystemVariables };