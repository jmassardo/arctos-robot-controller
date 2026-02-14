const fs = require('fs-extra');
const path = require('path');
const { logger } = require('./logger');

/**
 * Advanced G-code Parser and Validator
 * Provides comprehensive G-code parsing, validation, and simulation capabilities
 */
class GCodeParser {
  constructor(config = {}) {
    this.config = {
      maxLines: 10000,
      maxFileSize: 1024 * 1024, // 1MB
      strictValidation: false,
      supportedCommands: [
        // Motion commands
        'G0', 'G1', 'G2', 'G3', 'G4', 
        // Positioning
        'G17', 'G18', 'G19', 'G20', 'G21', 'G28', 'G90', 'G91',
        // Coordinate systems
        'G54', 'G55', 'G56', 'G57', 'G58', 'G59',
        // Tool commands
        'M0', 'M1', 'M2', 'M3', 'M5', 'M30', 'M106', 'M107',
        // Program flow
        'O', 'N'
      ],
      workspaceSize: {
        x: { min: -200, max: 200 },
        y: { min: -200, max: 200 },
        z: { min: -100, max: 100 },
        a: { min: -180, max: 180 },
        b: { min: -180, max: 180 },
        c: { min: -180, max: 180 }
      },
      arcSegmentResolution: 1.0, // degrees per segment for arc interpolation
      ...config
    };
    
    this.reset();
  }

  /**
   * Reset parser state
   */
  reset() {
    this.state = {
      absoluteMode: true,
      unitsInMM: true,
      currentPlane: 'XY', // G17
      currentPosition: { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 },
      workCoordinateSystem: 'G54', // Default work coordinate system
      coordinateSystemOffsets: {
        G54: { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 },
        G55: { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 },
        G56: { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 },
        G57: { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 },
        G58: { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 },
        G59: { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 }
      },
      feedRate: 100,
      spindleSpeed: 0,
      toolNumber: 0,
      lineNumber: 0,
      programNumber: null,
      subprograms: new Map(),
      errors: [],
      warnings: [],
      statistics: {
        totalLines: 0,
        validLines: 0,
        errorLines: 0,
        warningLines: 0,
        estimatedTime: 0,
        totalDistance: 0
      }
    };
  }

  /**
   * Parse and validate G-code string or file
   * @param {string} input - G-code string or file path
   * @param {Object} options - Parsing options
   * @returns {Object} Parsing results with validation info
   */
  async parse(input, options = {}) {
    try {
      let gcode = input;
      
      // Check if input is a file path
      if (input.length < 1000 && (input.includes('.gcode') || input.includes('.nc'))) {
        if (await fs.pathExists(input)) {
          const stats = await fs.stat(input);
          if (stats.size > this.config.maxFileSize) {
            throw new Error(`File size ${stats.size} bytes exceeds maximum ${this.config.maxFileSize} bytes`);
          }
          gcode = await fs.readFile(input, 'utf8');
        }
      }

      this.reset();
      const lines = this.preprocessLines(gcode);
      
      if (lines.length > this.config.maxLines) {
        throw new Error(`G-code has ${lines.length} lines, exceeds maximum ${this.config.maxLines} lines`);
      }

      const parsedLines = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        this.state.lineNumber = i + 1;
        
        try {
          const parsed = await this.parseLine(line);
          if (parsed) {
            parsedLines.push({
              lineNumber: i + 1,
              original: line,
              ...parsed
            });
            this.state.validLines++;
          }
        } catch (error) {
          this.addError(i + 1, error.message, line);
          this.state.errorLines++;
        }
      }

      this.state.statistics.totalLines = lines.length;
      
      const result = {
        success: this.state.errors.length === 0 || !this.config.strictValidation,
        lines: parsedLines,
        state: this.state,
        errors: this.state.errors,
        warnings: this.state.warnings,
        statistics: this.state.statistics,
        simulation: this.generateSimulation(parsedLines)
      };

      logger.robot('G-code parsed', {
        totalLines: this.state.statistics.totalLines,
        validLines: this.state.statistics.validLines,
        errorLines: this.state.statistics.errorLines,
        warningLines: this.state.statistics.warningLines,
        success: result.success
      });

      return result;
    } catch (error) {
      logger.error('G-code parsing failed', { error: error.message });
      return {
        success: false,
        error: error.message,
        errors: [{ line: 0, message: error.message, code: 'PARSE_ERROR' }],
        warnings: [],
        lines: [],
        statistics: this.state.statistics
      };
    }
  }

  /**
   * Preprocess G-code lines
   * @param {string} gcode - Raw G-code string
   * @returns {Array} Cleaned lines
   */
  preprocessLines(gcode) {
    return gcode
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map((line, index) => {
        // Remove inline comments
        const commentIndex = line.indexOf(';');
        if (commentIndex !== -1) {
          line = line.substring(0, commentIndex).trim();
        }
        // Remove parenthetical comments
        line = line.replace(/\([^)]*\)/g, '').trim();
        return line;
      })
      .filter(line => line.length > 0);
  }

  /**
   * Parse a single G-code line
   * @param {string} line - G-code line to parse
   * @returns {Object} Parsed line object
   */
  async parseLine(line) {
    if (!line || typeof line !== 'string') {
      return null;
    }

    const upperLine = line.toUpperCase();
    const tokens = this.tokenizeLine(upperLine);
    
    if (!tokens || tokens.length === 0) {
      return null;
    }

    const parsed = {
      tokens,
      commands: [],
      parameters: {},
      modal: {},
      warnings: []
    };

    // Extract commands and parameters
    for (const token of tokens) {
      if (this.isCommand(token)) {
        parsed.commands.push(token);
      } else if (this.isParameter(token)) {
        const axis = token.charAt(0);
        const value = parseFloat(token.substring(1));
        if (!isNaN(value)) {
          parsed.parameters[axis] = value;
        }
      }
    }

    // Validate and process each command
    for (const command of parsed.commands) {
      await this.processCommand(command, parsed);
    }

    // Update modal state
    this.updateModalState(parsed);

    // Validate workspace bounds
    this.validateWorkspaceBounds(parsed);

    return parsed;
  }

  /**
   * Tokenize a G-code line into individual elements
   * @param {string} line - G-code line
   * @returns {Array} Array of tokens
   */
  tokenizeLine(line) {
    // Match G/M commands, parameters, and line numbers
    const tokenRegex = /([GM]\d+\.?\d*)|([ABCDEFHIJKLNPQRSTUVWXYZ]-?\d+\.?\d*)/g;
    const tokens = [];
    let match;
    
    while ((match = tokenRegex.exec(line)) !== null) {
      tokens.push(match[0]);
    }
    
    return tokens;
  }

  /**
   * Check if token is a command
   * @param {string} token - Token to check
   * @returns {boolean} True if token is a command
   */
  isCommand(token) {
    return /^[GM]\d+\.?\d*$/.test(token);
  }

  /**
   * Check if token is a parameter
   * @param {string} token - Token to check
   * @returns {boolean} True if token is a parameter
   */
  isParameter(token) {
    return /^[ABCDEFHIJKLNPQRSTUVWXYZ]-?\d+\.?\d*$/.test(token) && !this.isCommand(token);
  }

  /**
   * Process a G-code command
   * @param {string} command - Command to process
   * @param {Object} parsed - Parsed line object
   */
  async processCommand(command, parsed) {
    if (!this.config.supportedCommands.includes(command)) {
      this.addWarning(this.state.lineNumber, `Unsupported command: ${command}`);
      return;
    }

    switch (command) {
      // Rapid positioning
      case 'G0':
        this.processLinearMove(parsed, { rapid: true });
        break;
      
      // Linear interpolation
      case 'G1':
        this.processLinearMove(parsed, { rapid: false });
        break;
      
      // Clockwise circular interpolation
      case 'G2':
        this.processCircularMove(parsed, { clockwise: true });
        break;
      
      // Counter-clockwise circular interpolation
      case 'G3':
        this.processCircularMove(parsed, { clockwise: false });
        break;
      
      // Dwell
      case 'G4':
        this.processDwell(parsed);
        break;
      
      // Plane selection
      case 'G17':
        this.state.currentPlane = 'XY';
        parsed.modal.plane = 'XY';
        break;
      case 'G18':
        this.state.currentPlane = 'XZ';
        parsed.modal.plane = 'XZ';
        break;
      case 'G19':
        this.state.currentPlane = 'YZ';
        parsed.modal.plane = 'YZ';
        break;
      
      // Units
      case 'G20':
        this.state.unitsInMM = false;
        parsed.modal.units = 'inches';
        break;
      case 'G21':
        this.state.unitsInMM = true;
        parsed.modal.units = 'mm';
        break;
      
      // Home
      case 'G28':
        this.processHome(parsed);
        break;
      
      // Positioning mode
      case 'G90':
        this.state.absoluteMode = true;
        parsed.modal.positioning = 'absolute';
        break;
      case 'G91':
        this.state.absoluteMode = false;
        parsed.modal.positioning = 'relative';
        break;
      
      // Work coordinate systems
      case 'G54':
      case 'G55':
      case 'G56':
      case 'G57':
      case 'G58':
      case 'G59':
        this.state.workCoordinateSystem = command;
        parsed.modal.workCoordinateSystem = command;
        break;
      
      // M codes
      case 'M0':
      case 'M1':
        parsed.modal.programStop = true;
        break;
      case 'M2':
      case 'M30':
        parsed.modal.programEnd = true;
        break;
      case 'M3':
        this.processSpindleOn(parsed, { clockwise: true });
        break;
      case 'M5':
        this.processSpindleOff(parsed);
        break;
      case 'M106':
        parsed.modal.coolant = true;
        break;
      case 'M107':
        parsed.modal.coolant = false;
        break;
      
      default:
        this.addWarning(this.state.lineNumber, `Command ${command} not fully implemented`);
    }
  }

  /**
   * Process linear movement
   * @param {Object} parsed - Parsed line object
   * @param {Object} options - Movement options
   */
  processLinearMove(parsed, options = {}) {
    const movement = {
      type: options.rapid ? 'rapid' : 'linear',
      start: { ...this.state.currentPosition },
      end: { ...this.state.currentPosition }
    };

    // Calculate target position
    ['x', 'y', 'z', 'a', 'b', 'c'].forEach(axis => {
      if (parsed.parameters[axis.toUpperCase()] !== undefined) {
        const value = parsed.parameters[axis.toUpperCase()];
        if (this.state.absoluteMode) {
          movement.end[axis] = value;
        } else {
          movement.end[axis] = this.state.currentPosition[axis] + value;
        }
      }
    });

    // Calculate distance and time
    movement.distance = this.calculateDistance(movement.start, movement.end);
    
    // Update feed rate if specified
    if (parsed.parameters.F !== undefined) {
      this.state.feedRate = parsed.parameters.F;
    }
    
    movement.feedRate = this.state.feedRate;
    movement.time = options.rapid ? movement.distance / 3000 : movement.distance / this.state.feedRate; // Assume rapid at 3000mm/min

    // Update statistics
    this.state.statistics.totalDistance += movement.distance;
    this.state.statistics.estimatedTime += movement.time;

    // Update current position
    this.state.currentPosition = { ...movement.end };
    
    parsed.movement = movement;
  }

  /**
   * Process circular movement (G2/G3)
   * @param {Object} parsed - Parsed line object
   * @param {Object} options - Movement options
   */
  processCircularMove(parsed, options = {}) {
    const movement = {
      type: 'circular',
      clockwise: options.clockwise,
      start: { ...this.state.currentPosition },
      end: { ...this.state.currentPosition },
      center: { x: 0, y: 0, z: 0 },
      plane: this.state.currentPlane
    };

    // Apply coordinate system transformation to current position
    const transformedStart = this.transformToWorkCoordinate(movement.start);
    movement.start = transformedStart;

    // Calculate target position
    ['x', 'y', 'z'].forEach(axis => {
      if (parsed.parameters[axis.toUpperCase()] !== undefined) {
        const value = parsed.parameters[axis.toUpperCase()];
        if (this.state.absoluteMode) {
          movement.end[axis] = value;
        } else {
          movement.end[axis] = this.state.currentPosition[axis] + value;
        }
      }
    });

    // Apply coordinate system transformation to end position
    const transformedEnd = this.transformToWorkCoordinate(movement.end);
    movement.end = transformedEnd;

    // Validate arc parameters
    const hasIJK = parsed.parameters.I !== undefined || 
                   parsed.parameters.J !== undefined || 
                   parsed.parameters.K !== undefined;
    const hasR = parsed.parameters.R !== undefined;

    if (!hasIJK && !hasR) {
      this.addError(this.state.lineNumber, 'Circular interpolation requires either I,J,K parameters or R parameter');
      return;
    }

    if (hasIJK && hasR) {
      this.addError(this.state.lineNumber, 'Cannot specify both IJK and R parameters for circular interpolation');
      return;
    }

    // Get arc center
    if (hasR) {
      // R format - calculate center from radius
      const radius = parsed.parameters.R;
      movement.radius = Math.abs(radius);
      movement.center = this.calculateArcCenterFromRadius(movement.start, movement.end, radius, options.clockwise, this.state.currentPlane);
    } else {
      // I, J, K format - center relative to start point
      movement.center = { ...movement.start };
      
      // Apply IJK offsets based on current plane
      switch (this.state.currentPlane) {
        case 'XY':
          movement.center.x += (parsed.parameters.I || 0);
          movement.center.y += (parsed.parameters.J || 0);
          break;
        case 'XZ':
          movement.center.x += (parsed.parameters.I || 0);
          movement.center.z += (parsed.parameters.K || 0);
          break;
        case 'YZ':
          movement.center.y += (parsed.parameters.J || 0);
          movement.center.z += (parsed.parameters.K || 0);
          break;
      }
      
      movement.radius = this.calculateDistance2D(movement.start, movement.center, this.state.currentPlane);
    }

    // Validate arc consistency
    const startRadius = this.calculateDistance2D(movement.start, movement.center, this.state.currentPlane);
    const endRadius = this.calculateDistance2D(movement.end, movement.center, this.state.currentPlane);
    const radiusTolerance = 0.001;

    if (Math.abs(startRadius - endRadius) > radiusTolerance) {
      this.addError(this.state.lineNumber, 
        `Arc radius inconsistency: start radius ${startRadius.toFixed(4)}, end radius ${endRadius.toFixed(4)}`);
      return;
    }

    // Calculate arc angle and direction
    movement.angle = this.calculateArcAngle(movement.start, movement.end, movement.center, this.state.currentPlane, options.clockwise);
    movement.distance = movement.radius * Math.abs(movement.angle);
    
    // Generate arc segments for smooth motion
    movement.segments = this.generateArcSegments(movement);
    
    if (parsed.parameters.F !== undefined) {
      this.state.feedRate = parsed.parameters.F;
    }
    
    movement.feedRate = this.state.feedRate;
    movement.time = movement.distance / this.state.feedRate;

    // Update statistics
    this.state.statistics.totalDistance += movement.distance;
    this.state.statistics.estimatedTime += movement.time;

    // Update current position (transform back from work coordinates)
    this.state.currentPosition = this.transformFromWorkCoordinate(movement.end);
    
    parsed.movement = movement;
  }

  /**
   * Process dwell command (G4)
   * @param {Object} parsed - Parsed line object
   */
  processDwell(parsed) {
    const dwellTime = parsed.parameters.P || 0; // P parameter in seconds or milliseconds
    const time = dwellTime < 1000 ? dwellTime : dwellTime / 1000; // Convert ms to seconds if needed
    
    parsed.dwell = {
      time: time,
      description: `Dwell for ${time} seconds`
    };
    
    this.state.statistics.estimatedTime += time;
  }

  /**
   * Process home command (G28)
   * @param {Object} parsed - Parsed line object
   */
  processHome(parsed) {
    const homeAxes = [];
    
    // If no axes specified, home all axes
    if (!parsed.parameters.X && !parsed.parameters.Y && !parsed.parameters.Z && 
        !parsed.parameters.A && !parsed.parameters.B && !parsed.parameters.C) {
      homeAxes.push('all');
      this.state.currentPosition = { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 };
    } else {
      // Home specified axes
      ['X', 'Y', 'Z', 'A', 'B', 'C'].forEach(axis => {
        if (parsed.parameters[axis] !== undefined) {
          homeAxes.push(axis.toLowerCase());
          this.state.currentPosition[axis.toLowerCase()] = 0;
        }
      });
    }
    
    parsed.home = {
      axes: homeAxes,
      description: `Home ${homeAxes.join(', ')} axes`
    };
    
    // Estimate home time (assume 10 seconds per axis)
    this.state.statistics.estimatedTime += homeAxes.length === 1 && homeAxes[0] === 'all' ? 30 : homeAxes.length * 10;
  }

  /**
   * Process spindle on command
   * @param {Object} parsed - Parsed line object
   * @param {Object} options - Spindle options
   */
  processSpindleOn(parsed, options = {}) {
    if (parsed.parameters.S !== undefined) {
      this.state.spindleSpeed = parsed.parameters.S;
    }
    
    parsed.spindle = {
      state: 'on',
      clockwise: options.clockwise,
      speed: this.state.spindleSpeed
    };
  }

  /**
   * Process spindle off command
   * @param {Object} parsed - Parsed line object
   */
  processSpindleOff(parsed) {
    this.state.spindleSpeed = 0;
    parsed.spindle = {
      state: 'off',
      speed: 0
    };
  }

  /**
   * Update modal state
   * @param {Object} parsed - Parsed line object
   */
  updateModalState(parsed) {
    // Modal states persist until changed
    parsed.modal = {
      ...parsed.modal,
      absoluteMode: this.state.absoluteMode,
      unitsInMM: this.state.unitsInMM,
      currentPlane: this.state.currentPlane,
      workCoordinateSystem: this.state.workCoordinateSystem,
      feedRate: this.state.feedRate,
      spindleSpeed: this.state.spindleSpeed
    };
  }

  /**
   * Validate workspace bounds
   * @param {Object} parsed - Parsed line object
   */
  validateWorkspaceBounds(parsed) {
    if (!parsed || !parsed.movement) {
      return;
    }
    
    const pos = parsed.movement.end;
    const bounds = this.config.workspaceSize;
    
    ['x', 'y', 'z', 'a', 'b', 'c'].forEach(axis => {
      if (bounds[axis] && pos[axis] !== undefined) {
        if (pos[axis] < bounds[axis].min || pos[axis] > bounds[axis].max) {
          this.addError(this.state.lineNumber, 
            `${axis.toUpperCase()} position ${pos[axis]} exceeds workspace bounds [${bounds[axis].min}, ${bounds[axis].max}]`);
        }
      }
    });
  }

  /**
   * Calculate distance between two points
   * @param {Object} start - Start position
   * @param {Object} end - End position
   * @returns {number} Distance
   */
  calculateDistance(start, end) {
    const dx = (end.x || 0) - (start.x || 0);
    const dy = (end.y || 0) - (start.y || 0);
    const dz = (end.z || 0) - (start.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Calculate arc center from radius
   * @param {Object} start - Start point
   * @param {Object} end - End point
   * @param {number} radius - Arc radius
   * @param {boolean} clockwise - Arc direction
   * @param {string} plane - Active plane (XY, XZ, YZ)
   * @returns {Object} Arc center
   */
  calculateArcCenterFromRadius(start, end, radius, clockwise, plane = 'XY') {
    let ax, ay, bx, by;
    
    // Map coordinates based on active plane
    switch (plane) {
      case 'XY':
        ax = start.x; ay = start.y;
        bx = end.x; by = end.y;
        break;
      case 'XZ':
        ax = start.x; ay = start.z;
        bx = end.x; by = end.z;
        break;
      case 'YZ':
        ax = start.y; ay = start.z;
        bx = end.y; by = end.z;
        break;
      default:
        ax = start.x; ay = start.y;
        bx = end.x; by = end.y;
    }

    // Calculate midpoint
    const midX = (ax + bx) / 2;
    const midY = (ay + by) / 2;
    
    // Calculate distance between start and end points
    const dx = bx - ax;
    const dy = by - ay;
    const chordLength = Math.sqrt(dx * dx + dy * dy);
    
    if (chordLength === 0) {
      // Start and end are the same point - full circle
      return { ...start };
    }
    
    if (chordLength > 2 * Math.abs(radius)) {
      throw new Error(`Arc radius ${Math.abs(radius)} too small for chord length ${chordLength}`);
    }
    
    // Calculate distance from midpoint to arc center
    const sagitta = Math.sqrt(radius * radius - (chordLength / 2) * (chordLength / 2));
    
    // Unit vector perpendicular to chord
    const perpX = -dy / chordLength;
    const perpY = dx / chordLength;
    
    // Determine which side of the chord the center is on
    const sign = (radius > 0) === clockwise ? -1 : 1;
    
    // Calculate center coordinates in 2D
    const centerX = midX + sign * sagitta * perpX;
    const centerY = midY + sign * sagitta * perpY;
    
    // Map back to 3D coordinates based on plane
    const center = { ...start };
    switch (plane) {
      case 'XY':
        center.x = centerX;
        center.y = centerY;
        break;
      case 'XZ':
        center.x = centerX;
        center.z = centerY;
        break;
      case 'YZ':
        center.y = centerX;
        center.z = centerY;
        break;
    }
    
    return center;
  }

  /**
   * Calculate distance between two points in specified plane
   * @param {Object} p1 - First point
   * @param {Object} p2 - Second point
   * @param {string} plane - Active plane (XY, XZ, YZ)
   * @returns {number} Distance in specified plane
   */
  calculateDistance2D(p1, p2, plane = 'XY') {
    let dx, dy;
    
    switch (plane) {
      case 'XY':
        dx = (p2.x || 0) - (p1.x || 0);
        dy = (p2.y || 0) - (p1.y || 0);
        break;
      case 'XZ':
        dx = (p2.x || 0) - (p1.x || 0);
        dy = (p2.z || 0) - (p1.z || 0);
        break;
      case 'YZ':
        dx = (p2.y || 0) - (p1.y || 0);
        dy = (p2.z || 0) - (p1.z || 0);
        break;
      default:
        dx = (p2.x || 0) - (p1.x || 0);
        dy = (p2.y || 0) - (p1.y || 0);
    }
    
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculate arc angle
   * @param {Object} start - Start point
   * @param {Object} end - End point
   * @param {Object} center - Arc center
   * @param {string} plane - Active plane (XY, XZ, YZ)
   * @param {boolean} clockwise - Arc direction
   * @returns {number} Arc angle in radians
   */
  calculateArcAngle(start, end, center, plane = 'XY', clockwise = false) {
    let ax, ay, bx, by;
    
    // Map coordinates based on active plane
    switch (plane) {
      case 'XY':
        ax = start.x - center.x; ay = start.y - center.y;
        bx = end.x - center.x; by = end.y - center.y;
        break;
      case 'XZ':
        ax = start.x - center.x; ay = start.z - center.z;
        bx = end.x - center.x; by = end.z - center.z;
        break;
      case 'YZ':
        ax = start.y - center.y; ay = start.z - center.z;
        bx = end.y - center.y; by = end.z - center.z;
        break;
      default:
        ax = start.x - center.x; ay = start.y - center.y;
        bx = end.x - center.x; by = end.y - center.y;
    }

    const startAngle = Math.atan2(ay, ax);
    const endAngle = Math.atan2(by, bx);
    
    let angle = endAngle - startAngle;
    
    if (clockwise) {
      if (angle > 0) {
        angle -= 2 * Math.PI;
      }
    } else {
      if (angle < 0) {
        angle += 2 * Math.PI;
      }
    }
    
    return angle;
  }

  /**
   * Generate arc segments for smooth motion
   * @param {Object} movement - Movement object with arc parameters
   * @returns {Array} Array of linear segments
   */
  generateArcSegments(movement) {
    const segments = [];
    const totalAngle = Math.abs(movement.angle);
    const segmentAngle = (this.config.arcSegmentResolution * Math.PI) / 180; // Convert to radians
    const numSegments = Math.max(1, Math.ceil(totalAngle / segmentAngle));
    const actualSegmentAngle = movement.angle / numSegments;
    
    let currentAngle = this.getAngleFromCenter(movement.start, movement.center, movement.plane);
    
    for (let i = 0; i <= numSegments; i++) {
      const angle = currentAngle + (actualSegmentAngle * i);
      const point = this.getPointOnArc(movement.center, movement.radius, angle, movement.plane);
      
      // For the last segment, use the exact end point
      if (i === numSegments) {
        segments.push({ ...movement.end });
      } else {
        segments.push(point);
      }
    }
    
    return segments;
  }

  /**
   * Get angle from center to point
   * @param {Object} point - Point coordinates
   * @param {Object} center - Arc center
   * @param {string} plane - Active plane
   * @returns {number} Angle in radians
   */
  getAngleFromCenter(point, center, plane = 'XY') {
    let dx, dy;
    
    switch (plane) {
      case 'XY':
        dx = point.x - center.x;
        dy = point.y - center.y;
        break;
      case 'XZ':
        dx = point.x - center.x;
        dy = point.z - center.z;
        break;
      case 'YZ':
        dx = point.y - center.y;
        dy = point.z - center.z;
        break;
      default:
        dx = point.x - center.x;
        dy = point.y - center.y;
    }
    
    return Math.atan2(dy, dx);
  }

  /**
   * Get point on arc at specified angle
   * @param {Object} center - Arc center
   * @param {number} radius - Arc radius
   * @param {number} angle - Angle in radians
   * @param {string} plane - Active plane
   * @returns {Object} Point coordinates
   */
  getPointOnArc(center, radius, angle, plane = 'XY') {
    const x = center.x + radius * Math.cos(angle);
    const y = center.y + radius * Math.sin(angle);
    
    const point = { ...center };
    
    switch (plane) {
      case 'XY':
        point.x = x;
        point.y = y;
        break;
      case 'XZ':
        point.x = x;
        point.z = y;
        break;
      case 'YZ':
        point.y = x;
        point.z = y;
        break;
    }
    
    return point;
  }

  /**
   * Transform position to work coordinate system
   * @param {Object} position - Machine position
   * @returns {Object} Work coordinate position
   */
  transformToWorkCoordinate(position) {
    const offset = this.state.coordinateSystemOffsets[this.state.workCoordinateSystem];
    const transformed = {};
    
    ['x', 'y', 'z', 'a', 'b', 'c'].forEach(axis => {
      transformed[axis] = (position[axis] || 0) + (offset[axis] || 0);
    });
    
    return transformed;
  }

  /**
   * Transform position from work coordinate system
   * @param {Object} position - Work coordinate position
   * @returns {Object} Machine position
   */
  transformFromWorkCoordinate(position) {
    const offset = this.state.coordinateSystemOffsets[this.state.workCoordinateSystem];
    const transformed = {};
    
    ['x', 'y', 'z', 'a', 'b', 'c'].forEach(axis => {
      transformed[axis] = (position[axis] || 0) - (offset[axis] || 0);
    });
    
    return transformed;
  }

  /**
   * Generate simulation data
   * @param {Array} lines - Parsed lines
   * @returns {Object} Simulation data
   */
  generateSimulation(lines) {
    const toolpath = [];
    let currentPos = { x: 0, y: 0, z: 0 };
    
    lines.forEach(line => {
      if (line.movement) {
        toolpath.push({
          type: line.movement.type,
          start: line.movement.start,
          end: line.movement.end,
          feedRate: line.movement.feedRate
        });
        currentPos = { ...line.movement.end };
      }
    });
    
    return {
      toolpath,
      boundingBox: this.calculateBoundingBox(toolpath),
      estimatedTime: this.state.statistics.estimatedTime,
      totalDistance: this.state.statistics.totalDistance
    };
  }

  /**
   * Calculate bounding box of toolpath
   * @param {Array} toolpath - Toolpath data
   * @returns {Object} Bounding box
   */
  calculateBoundingBox(toolpath) {
    if (toolpath.length === 0) {
      return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    }
    
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    toolpath.forEach(segment => {
      [segment.start, segment.end].forEach(point => {
        minX = Math.min(minX, point.x || 0);
        minY = Math.min(minY, point.y || 0);
        minZ = Math.min(minZ, point.z || 0);
        maxX = Math.max(maxX, point.x || 0);
        maxY = Math.max(maxY, point.y || 0);
        maxZ = Math.max(maxZ, point.z || 0);
      });
    });
    
    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ }
    };
  }

  /**
   * Add error to error list
   * @param {number} line - Line number
   * @param {string} message - Error message
   * @param {string} code - Original code line
   */
  addError(line, message, code = '') {
    this.state.errors.push({
      line,
      message,
      code,
      severity: 'error'
    });
  }

  /**
   * Add warning to warning list
   * @param {number} line - Line number
   * @param {string} message - Warning message
   */
  addWarning(line, message) {
    this.state.warnings.push({
      line,
      message,
      severity: 'warning'
    });
    this.state.statistics.warningLines++;
  }

  /**
   * Set coordinate system offset
   * @param {string} system - Coordinate system (G54-G59)
   * @param {Object} offset - Offset values
   */
  setCoordinateSystemOffset(system, offset) {
    if (!['G54', 'G55', 'G56', 'G57', 'G58', 'G59'].includes(system)) {
      throw new Error(`Invalid coordinate system: ${system}`);
    }
    
    this.state.coordinateSystemOffsets[system] = {
      x: offset.x || 0,
      y: offset.y || 0,
      z: offset.z || 0,
      a: offset.a || 0,
      b: offset.b || 0,
      c: offset.c || 0
    };
  }

  /**
   * Get current coordinate system information
   * @returns {Object} Coordinate system info
   */
  getCoordinateSystemInfo() {
    return {
      active: this.state.workCoordinateSystem,
      offsets: this.state.coordinateSystemOffsets,
      currentOffset: this.state.coordinateSystemOffsets[this.state.workCoordinateSystem]
    };
  }
  validateSyntax(gcode) {
    const lines = this.preprocessLines(gcode);
    const errors = [];
    const warnings = [];
    
    lines.forEach((line, index) => {
      try {
        const tokens = this.tokenizeLine(line.toUpperCase());
        
        // Check for valid tokens
        tokens.forEach(token => {
          if (this.isCommand(token)) {
            if (!this.config.supportedCommands.includes(token)) {
              warnings.push({
                line: index + 1,
                message: `Unsupported command: ${token}`,
                severity: 'warning'
              });
            }
          } else if (!this.isParameter(token)) {
            errors.push({
              line: index + 1,
              message: `Invalid token: ${token}`,
              severity: 'error'
            });
          }
        });
      } catch (error) {
        errors.push({
          line: index + 1,
          message: error.message,
          severity: 'error'
        });
      }
    });
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      lineCount: lines.length
    };
  }
}

module.exports = { GCodeParser };