const { GeometryUtils } = require('./geometryUtils');
const { logger } = require('./logger');

/**
 * Motion Planning and Execution Time Prediction
 * Provides accurate motion planning with kinematic constraints and execution time estimation
 */
class MotionPlanner {
  constructor(machineParams = {}) {
    this.machineParams = {
      // Default machine parameters - should be loaded from configuration
      maxAcceleration: {
        x: 1000, // mm/min²
        y: 1000,
        z: 500,
        a: 2000, // deg/min²
        b: 2000,
        c: 2000,
      },
      maxVelocity: {
        x: 3000, // mm/min
        y: 3000,
        z: 1500,
        a: 3600, // deg/min
        b: 3600,
        c: 3600,
      },
      maxJerk: {
        x: 10000, // mm/min³
        y: 10000,
        z: 5000,
        a: 36000, // deg/min³
        b: 36000,
        c: 36000,
      },
      rapidFeedRate: 3000, // mm/min for G0 moves
      homingSpeed: 1000, // mm/min for homing
      dwellOverhead: 0.1, // seconds of overhead per dwell command
      ...machineParams,
    };

    this.lastPosition = { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 };
    this.executionState = {
      totalTime: 0,
      currentTime: 0,
      segments: [],
    };
  }

  /**
   * Calculate execution time for a G-code program
   * @param {Array} program - Parsed G-code program (array of parsed lines)
   * @param {Object} options - Calculation options
   * @returns {Object} Execution time analysis
   */
  calculateExecutionTime(program, options = {}) {
    const settings = {
      includeAcceleration: true,
      includeToolChanges: true,
      includeHoming: true,
      safetyFactor: 1.1, // Add 10% safety margin
      ...options,
    };

    logger.info('Calculating execution time', {
      programLength: program.length,
      settings: settings,
    });

    try {
      this.resetState();
      const analysis = {
        totalTime: 0,
        segmentTimes: [],
        breakdown: {
          motionTime: 0,
          dwellTime: 0,
          homingTime: 0,
          toolChangeTime: 0,
          overhead: 0,
        },
        criticalPath: [],
        warnings: [],
      };

      // Process each program line
      for (let i = 0; i < program.length; i++) {
        const line = program[i];
        const segmentTime = this.calculateSegmentTime(line, settings, analysis);

        analysis.segmentTimes.push({
          lineNumber: line.lineNumber || i + 1,
          time: segmentTime.time,
          cumulativeTime: analysis.totalTime + segmentTime.time,
          type: segmentTime.type,
          details: segmentTime.details,
        });

        analysis.totalTime += segmentTime.time;

        // Update breakdown
        const breakdown = analysis.breakdown;
        if ((breakdown.motionTime += segmentTime.time)) {
        } else if (segmentTime.type === 'dwell') breakdown.dwellTime += segmentTime.time;
        else if (segmentTime.type === 'homing') breakdown.homingTime += segmentTime.time;
        else if (segmentTime.type === 'toolchange') breakdown.toolChangeTime += segmentTime.time;
        else breakdown.overhead += segmentTime.time;
      }

      // Apply safety factor
      analysis.totalTime *= settings.safetyFactor;
      Object.keys(analysis.breakdown).forEach(key => {
        analysis.breakdown[key] *= settings.safetyFactor;
      });

      // Identify critical path (longest sequences)
      analysis.criticalPath = this.identifyCriticalPath(analysis.segmentTimes);

      // Format results
      analysis.formattedTime = this.formatTime(analysis.totalTime);
      analysis.estimatedCompletionTime = new Date(Date.now() + analysis.totalTime * 1000);

      logger.info('Execution time calculated', {
        totalTimeMinutes: Math.round((analysis.totalTime / 60) * 100) / 100,
        motionTimePercent: Math.round((analysis.breakdown.motionTime / analysis.totalTime) * 100),
        segments: analysis.segmentTimes.length,
      });

      return {
        success: true,
        analysis: analysis,
        machineParams: this.machineParams,
      };
    } catch (error) {
      logger.error('Execution time calculation failed', { error: error.message });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Reset planner state
   */
  resetState() {
    this.lastPosition = { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 };
    this.executionState = {
      totalTime: 0,
      currentTime: 0,
      segments: [],
    };
  }

  /**
   * Calculate execution time for a single program segment
   * @param {Object} line - Parsed G-code line
   * @param {Object} settings - Calculation settings
   * @param {Object} analysis - Analysis object to update
   * @returns {Object} Segment time information
   */
  calculateSegmentTime(line, settings, analysis) {
    if (!line || !line.commands) {
      return { time: 0, type: 'overhead', details: 'empty line' };
    }

    // Handle different command types
    for (const command of line.commands) {
      switch (command) {
        case 'G0': // Rapid positioning
        case 'G1': // Linear interpolation
          return this.calculateMotionTime(line, command === 'G0', settings);

        case 'G2': // Clockwise arc
        case 'G3': // Counter-clockwise arc
          return this.calculateArcTime(line, settings);

        case 'G4': // Dwell
          return this.calculateDwellTime(line, settings);

        case 'G28': // Home
          return this.calculateHomingTime(line, settings);

        case 'M3': // Spindle on
        case 'M5': // Spindle off
          return this.calculateSpindleTime(line, settings);

        case 'M6': // Tool change
          return this.calculateToolChangeTime(line, settings);

        case 'M0': // Program stop
        case 'M1': // Optional stop
          return { time: 1.0, type: 'overhead', details: 'program stop' };

        default:
          // Unknown command - assume minimal overhead
          return { time: 0.01, type: 'overhead', details: `command ${command}` };
      }
    }

    return { time: 0, type: 'overhead', details: 'no commands' };
  }

  /**
   * Calculate motion time for linear moves (G0/G1)
   * @param {Object} line - Parsed line
   * @param {boolean} isRapid - True for G0 (rapid)
   * @param {Object} settings - Settings
   * @returns {Object} Motion time details
   */
  calculateMotionTime(line, isRapid, settings) {
    if (!line.movement) {
      return { time: 0, type: 'motion', details: 'no movement' };
    }

    const movement = line.movement;
    const distance = movement.distance || 0;

    if (distance === 0) {
      return { time: 0.01, type: 'motion', details: 'zero distance' };
    }

    // Get feed rate
    let feedRate;
    if (isRapid) {
      feedRate = this.machineParams.rapidFeedRate;
    } else {
      feedRate = movement.feedRate || line.modal?.feedRate || 100;
    }

    // Calculate time with acceleration if enabled
    let motionTime;
    if (settings.includeAcceleration) {
      motionTime = this.calculateAcceleratedMotionTime(movement, feedRate);
    } else {
      motionTime = (distance / feedRate) * 60; // Convert mm/min to seconds
    }

    // Update position
    this.lastPosition = { ...movement.end };

    return {
      time: motionTime,
      type: 'motion',
      details: {
        distance: distance,
        feedRate: feedRate,
        isRapid: isRapid,
        acceleration: settings.includeAcceleration,
      },
    };
  }

  /**
   * Calculate motion time including acceleration/deceleration
   * @param {Object} movement - Movement details
   * @param {number} targetFeedRate - Target feed rate
   * @returns {number} Motion time in seconds
   */
  calculateAcceleratedMotionTime(movement, targetFeedRate) {
    const distance = movement.distance;
    const startPos = movement.start;
    const endPos = movement.end;

    // Calculate maximum acceleration for this move
    const maxAccel = this.getMaxAccelerationForMove(startPos, endPos);

    // Convert feed rate from mm/min to mm/s
    const targetVelocity = targetFeedRate / 60;

    // Calculate acceleration time and distance
    const accelTime = targetVelocity / maxAccel;
    const accelDistance = 0.5 * maxAccel * accelTime * accelTime;

    // Check if we can reach target velocity
    if (2 * accelDistance >= distance) {
      // Triangular velocity profile (can't reach target velocity)
      const maxReachableVelocity = Math.sqrt(maxAccel * distance);
      const totalTime = 2 * Math.sqrt(distance / maxAccel);
      return totalTime;
    } else {
      // Trapezoidal velocity profile
      const constantVelocityDistance = distance - 2 * accelDistance;
      const constantVelocityTime = constantVelocityDistance / targetVelocity;
      const totalTime = 2 * accelTime + constantVelocityTime;
      return totalTime;
    }
  }

  /**
   * Get maximum acceleration for a move considering all axes
   * @param {Object} startPos - Start position
   * @param {Object} endPos - End position
   * @returns {number} Maximum acceleration in mm/s²
   */
  getMaxAccelerationForMove(startPos, endPos) {
    let minAccel = Infinity;

    ['x', 'y', 'z', 'a', 'b', 'c'].forEach(axis => {
      const delta = Math.abs((endPos[axis] || 0) - (startPos[axis] || 0));
      if (delta > 0) {
        const axisAccel = (this.machineParams.maxAcceleration[axis] || 1000) / 3600; // Convert to mm/s²
        minAccel = Math.min(minAccel, axisAccel);
      }
    });

    return minAccel === Infinity ? 1000 / 3600 : minAccel; // Default if no movement
  }

  /**
   * Calculate time for circular motion (G2/G3)
   * @param {Object} line - Parsed line
   * @param {Object} settings - Settings
   * @returns {Object} Arc time details
   */
  calculateArcTime(line, settings) {
    if (!line.movement || line.movement.type !== 'circular') {
      return { time: 0, type: 'motion', details: 'no circular movement' };
    }

    const movement = line.movement;
    const distance = movement.distance || 0;
    const feedRate = movement.feedRate || 100;

    let arcTime;
    if (settings.includeAcceleration) {
      // For arcs, use a simplified acceleration model
      const avgAccel = this.getMaxAccelerationForMove(movement.start, movement.end) * 0.7; // Reduce for curved motion
      arcTime = this.calculateAcceleratedMotionTimeSimple(distance, feedRate / 60, avgAccel);
    } else {
      arcTime = (distance / feedRate) * 60;
    }

    this.lastPosition = { ...movement.end };

    return {
      time: arcTime,
      type: 'motion',
      details: {
        distance: distance,
        feedRate: feedRate,
        radius: movement.radius,
        angle: movement.angle,
      },
    };
  }

  /**
   * Simplified acceleration calculation
   * @param {number} distance - Distance to travel
   * @param {number} targetVelocity - Target velocity (mm/s)
   * @param {number} acceleration - Acceleration (mm/s²)
   * @returns {number} Time in seconds
   */
  calculateAcceleratedMotionTimeSimple(distance, targetVelocity, acceleration) {
    const accelTime = targetVelocity / acceleration;
    const accelDistance = 0.5 * acceleration * accelTime * accelTime;

    if (2 * accelDistance >= distance) {
      return 2 * Math.sqrt(distance / acceleration);
    } else {
      const constantDistance = distance - 2 * accelDistance;
      return 2 * accelTime + constantDistance / targetVelocity;
    }
  }

  /**
   * Calculate dwell time (G4)
   * @param {Object} line - Parsed line
   * @param {Object} settings - Settings
   * @returns {Object} Dwell time details
   */
  calculateDwellTime(line, settings) {
    if (!line.dwell) {
      return { time: 0, type: 'dwell', details: 'no dwell specified' };
    }

    const dwellTime = line.dwell.time + this.machineParams.dwellOverhead;

    return {
      time: dwellTime,
      type: 'dwell',
      details: {
        programmedTime: line.dwell.time,
        overhead: this.machineParams.dwellOverhead,
      },
    };
  }

  /**
   * Calculate homing time (G28)
   * @param {Object} line - Parsed line
   * @param {Object} settings - Settings
   * @returns {Object} Homing time details
   */
  calculateHomingTime(line, settings) {
    if (!line.home) {
      return { time: 0, type: 'homing', details: 'no homing specified' };
    }

    // Estimate homing distance based on current position
    let estimatedDistance = 0;
    const homingAxes = line.home.axes;

    if (homingAxes.includes('all')) {
      // Home all axes - estimate maximum travel
      estimatedDistance = Math.max(
        Math.abs(this.lastPosition.x || 0) + 50, // Add safety margin
        Math.abs(this.lastPosition.y || 0) + 50,
        Math.abs(this.lastPosition.z || 0) + 50
      );
    } else {
      // Home specific axes
      homingAxes.forEach(axis => {
        estimatedDistance += Math.abs(this.lastPosition[axis] || 0) + 20;
      });
    }

    const homingTime = (estimatedDistance / this.machineParams.homingSpeed) * 60 + 2; // Add 2 seconds overhead

    // Reset homed axes to zero
    homingAxes.forEach(axis => {
      if (axis === 'all') {
        this.lastPosition = { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 };
      } else {
        this.lastPosition[axis] = 0;
      }
    });

    return {
      time: homingTime,
      type: 'homing',
      details: {
        axes: homingAxes,
        estimatedDistance: estimatedDistance,
        speed: this.machineParams.homingSpeed,
      },
    };
  }

  /**
   * Calculate spindle start/stop time
   * @param {Object} line - Parsed line
   * @param {Object} settings - Settings
   * @returns {Object} Spindle time details
   */
  calculateSpindleTime(line, settings) {
    if (!line.spindle) {
      return { time: 0.1, type: 'overhead', details: 'spindle command overhead' };
    }

    // Spindle start/stop typically takes 1-2 seconds
    const spindleTime = line.spindle.state === 'on' ? 1.5 : 0.5;

    return {
      time: spindleTime,
      type: 'overhead',
      details: {
        state: line.spindle.state,
        speed: line.spindle.speed,
      },
    };
  }

  /**
   * Calculate tool change time
   * @param {Object} line - Parsed line
   * @param {Object} settings - Settings
   * @returns {Object} Tool change time details
   */
  calculateToolChangeTime(line, settings) {
    // Tool change typically takes 10-30 seconds depending on system
    const toolChangeTime = 15; // seconds

    return {
      time: toolChangeTime,
      type: 'toolchange',
      details: {
        toolNumber: line.parameters?.T || 'unknown',
      },
    };
  }

  /**
   * Identify critical path segments (longest execution times)
   * @param {Array} segmentTimes - Array of segment times
   * @returns {Array} Critical path segments
   */
  identifyCriticalPath(segmentTimes) {
    // Sort segments by time (descending)
    const sortedSegments = segmentTimes
      .slice()
      .sort((a, b) => b.time - a.time)
      .slice(0, 10); // Top 10 longest segments

    return sortedSegments.map(segment => ({
      lineNumber: segment.lineNumber,
      time: segment.time,
      type: segment.type,
      percentage: (segment.time / segmentTimes.reduce((sum, s) => sum + s.time, 0)) * 100,
    }));
  }

  /**
   * Format time duration
   * @param {number} seconds - Time in seconds
   * @returns {string} Formatted time string
   */
  formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.round(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  /**
   * Predict resource usage during execution
   * @param {Array} program - Parsed G-code program
   * @returns {Object} Resource usage prediction
   */
  predictResourceUsage(program) {
    const usage = {
      powerConsumption: 0, // kWh
      toolWear: 0, // relative units
      maintenanceScore: 100, // 0-100, lower means more maintenance needed
      criticalOperations: [],
    };

    let totalMotionTime = 0;
    let rapidMotionTime = 0;
    let spindleOnTime = 0;

    program.forEach(line => {
      if (line.movement) {
        const time = line.movement.time || 0;
        totalMotionTime += time;

        if (line.movement.type === 'rapid') {
          rapidMotionTime += time;
        }

        // Estimate power based on motion type
        const motionPower = line.movement.type === 'rapid' ? 2.0 : 1.5; // kW
        usage.powerConsumption += (motionPower * time) / 3600;
      }

      if (line.spindle && line.spindle.state === 'on') {
        spindleOnTime += line.spindle.estimatedOnTime || 10; // Estimate
        usage.powerConsumption += (3.0 * spindleOnTime) / 3600; // Spindle power
      }

      // Estimate tool wear based on cutting operations
      if (line.movement && line.movement.feedRate < 1000) {
        // Cutting move
        usage.toolWear += line.movement.distance / 1000; // Wear per meter
      }
    });

    // Calculate maintenance score based on usage
    usage.maintenanceScore = Math.max(0, 100 - (totalMotionTime / 3600) * 2 - usage.toolWear * 10);

    return usage;
  }

  /**
   * Generate motion profile for visualization
   * @param {Array} program - Parsed G-code program
   * @returns {Object} Motion profile data
   */
  generateMotionProfile(program) {
    const profile = {
      velocity: [],
      acceleration: [],
      position: [],
      timeStamps: [],
    };

    let currentTime = 0;
    let currentPos = { x: 0, y: 0, z: 0 };

    program.forEach((line, index) => {
      if (line.movement) {
        const segmentTime = line.movement.time || 0;
        const targetPos = line.movement.end;
        const feedRate = line.movement.feedRate || 100;

        // Sample points along this segment
        const samples = Math.max(1, Math.ceil(segmentTime / 0.1)); // Sample every 0.1s

        for (let i = 0; i <= samples; i++) {
          const t = i / samples;
          const time = currentTime + t * segmentTime;

          // Interpolate position
          const pos = {
            x: currentPos.x + t * ((targetPos.x || 0) - currentPos.x),
            y: currentPos.y + t * ((targetPos.y || 0) - currentPos.y),
            z: currentPos.z + t * ((targetPos.z || 0) - currentPos.z),
          };

          profile.timeStamps.push(time);
          profile.position.push(pos);
          profile.velocity.push(feedRate / 60); // Convert to mm/s
          profile.acceleration.push(0); // Simplified - would need more complex calculation
        }

        currentTime += segmentTime;
        currentPos = { ...targetPos };
      }
    });

    return profile;
  }
}

module.exports = { MotionPlanner };
