/**
 * Motion Profiler Engine
 * Generates velocity and acceleration profiles for smooth robotic motion
 */

const { logger } = require('./logger');

class MotionProfiler {
  constructor() {
    this.profileTypes = ['trapezoidal', 's_curve', 'custom'];
    this.defaultParams = {
      maxVelocity: 1000, // mm/min
      acceleration: 5000, // mm/min²
      jerk: 50000, // mm/min³
    };
  }

  /**
   * Generate motion profile based on type and parameters
   * @param {number} moveDistance - Distance to move (mm)
   * @param {string} profileType - Type of profile ('trapezoidal', 's_curve', 'custom')
   * @param {Object} params - Profile parameters
   * @returns {Object} Generated profile
   */
  generateProfile(moveDistance, profileType, params = {}) {
    const effectiveParams = { ...this.defaultParams, ...params };

    logger.info(`Generating ${profileType} profile for ${moveDistance}mm move`, {
      params: effectiveParams,
    });

    try {
      switch (profileType) {
        case 'trapezoidal':
          return this.generateTrapezoidalProfile(moveDistance, effectiveParams);
        case 's_curve':
          return this.generateSCurveProfile(moveDistance, effectiveParams);
        case 'custom':
          return this.generateCustomProfile(moveDistance, effectiveParams);
        default:
          throw new Error(`Unknown profile type: ${profileType}`);
      }
    } catch (error) {
      logger.error('Profile generation failed', {
        error: error.message,
        profileType,
        moveDistance,
        params,
      });
      throw error;
    }
  }

  /**
   * Generate trapezoidal velocity profile
   * @param {number} distance - Move distance
   * @param {Object} params - Profile parameters
   * @returns {Object} Trapezoidal profile
   */
  generateTrapezoidalProfile(distance, params) {
    const { maxVelocity, acceleration } = params;

    // Convert to consistent units (mm/s and mm/s²)
    const maxVel = maxVelocity / 60; // mm/min to mm/s
    const accel = acceleration / 3600; // mm/min² to mm/s²

    const accelTime = maxVel / accel;
    const accelDist = 0.5 * accel * accelTime * accelTime;

    let profile;

    if (2 * accelDist >= Math.abs(distance)) {
      // Triangle profile (no constant velocity phase)
      const triangleVel = Math.sqrt(Math.abs(distance) * accel);
      const triangleTime = triangleVel / accel;

      profile = {
        type: 'triangle',
        phases: [
          {
            name: 'acceleration',
            duration: triangleTime,
            startVel: 0,
            endVel: triangleVel,
            startPos: 0,
            endPos: 0.5 * accel * triangleTime * triangleTime,
            acceleration: accel,
          },
          {
            name: 'deceleration',
            duration: triangleTime,
            startVel: triangleVel,
            endVel: 0,
            startPos: 0.5 * accel * triangleTime * triangleTime,
            endPos: Math.abs(distance),
            acceleration: -accel,
          },
        ],
        totalTime: 2 * triangleTime,
        maxVelocityReached: triangleVel,
        distance: Math.abs(distance),
      };
    } else {
      // True trapezoidal profile
      const constDist = Math.abs(distance) - 2 * accelDist;
      const constTime = constDist / maxVel;

      profile = {
        type: 'trapezoidal',
        phases: [
          {
            name: 'acceleration',
            duration: accelTime,
            startVel: 0,
            endVel: maxVel,
            startPos: 0,
            endPos: accelDist,
            acceleration: accel,
          },
          {
            name: 'constant_velocity',
            duration: constTime,
            startVel: maxVel,
            endVel: maxVel,
            startPos: accelDist,
            endPos: accelDist + constDist,
            acceleration: 0,
          },
          {
            name: 'deceleration',
            duration: accelTime,
            startVel: maxVel,
            endVel: 0,
            startPos: accelDist + constDist,
            endPos: Math.abs(distance),
            acceleration: -accel,
          },
        ],
        totalTime: 2 * accelTime + constTime,
        maxVelocityReached: maxVel,
        distance: Math.abs(distance),
      };
    }

    // Generate time-series data for visualization and interpolation
    profile.timepoints = [];
    profile.velocities = [];
    profile.positions = [];
    profile.accelerations = [];

    this.generateTimeSeriesData(profile);

    // Apply direction
    if (distance < 0) {
      profile.velocities = profile.velocities.map(v => -v);
      profile.positions = profile.positions.map(p => -p);
      profile.phases.forEach(phase => {
        phase.startVel *= -1;
        phase.endVel *= -1;
        phase.startPos *= -1;
        phase.endPos *= -1;
        if (phase.name === 'acceleration') {
          phase.acceleration *= -1;
        } else if (phase.name === 'deceleration') {
          phase.acceleration *= -1;
        }
      });
    }

    return profile;
  }

  /**
   * Generate S-curve velocity profile (jerk-limited)
   * @param {number} distance - Move distance
   * @param {Object} params - Profile parameters
   * @returns {Object} S-curve profile
   */
  generateSCurveProfile(distance, params) {
    const SCurveGenerator = require('./sCurveGenerator');
    const generator = new SCurveGenerator();

    // Convert units
    const maxVel = params.maxVelocity / 60; // mm/min to mm/s
    const maxAccel = params.acceleration / 3600; // mm/min² to mm/s²
    const jerk = params.jerk / 216000; // mm/min³ to mm/s³

    return generator.generateSCurve(distance, maxVel, maxAccel, jerk);
  }

  /**
   * Generate custom velocity profile
   * @param {number} distance - Move distance
   * @param {Object} params - Profile parameters including custom curve definition
   * @returns {Object} Custom profile
   */
  generateCustomProfile(distance, params) {
    if (!params.customCurve) {
      throw new Error('Custom profile requires customCurve parameter');
    }

    const { customCurve } = params;
    const totalTime = customCurve.totalTime || 1.0;

    const profile = {
      type: 'custom',
      phases: [
        {
          name: 'custom',
          duration: totalTime,
          startVel: 0,
          endVel: 0,
          startPos: 0,
          endPos: Math.abs(distance),
          acceleration: 0,
        },
      ],
      totalTime,
      maxVelocityReached: Math.max(...customCurve.velocities),
      distance: Math.abs(distance),
      customCurve,
    };

    // Use provided time series data
    profile.timepoints = customCurve.timepoints || [];
    profile.velocities = customCurve.velocities || [];
    profile.positions = customCurve.positions || [];
    profile.accelerations = customCurve.accelerations || [];

    return profile;
  }

  /**
   * Generate time-series data for profile visualization and interpolation
   * @param {Object} profile - Profile to populate with time-series data
   * @param {number} resolution - Time resolution in ms (default: 10ms = 100Hz)
   */
  generateTimeSeriesData(profile, resolution = 10) {
    const dt = resolution / 1000; // Convert to seconds
    const numPoints = Math.ceil(profile.totalTime / dt) + 1;

    profile.timepoints = [];
    profile.velocities = [];
    profile.positions = [];
    profile.accelerations = [];

    for (let i = 0; i < numPoints; i++) {
      const t = i * dt;
      profile.timepoints.push(t);

      // Find which phase we're in
      let currentTime = 0;
      let currentPhase = null;
      let phaseTime = 0;

      for (const phase of profile.phases) {
        if (t >= currentTime && t <= currentTime + phase.duration) {
          currentPhase = phase;
          phaseTime = t - currentTime;
          break;
        }
        currentTime += phase.duration;
      }

      if (!currentPhase) {
        // Past the end of motion
        currentPhase = profile.phases[profile.phases.length - 1];
        phaseTime = currentPhase.duration;
      }

      // Calculate position, velocity, acceleration for this time
      const { position, velocity, acceleration } = this.interpolatePhase(currentPhase, phaseTime);

      profile.positions.push(position);
      profile.velocities.push(velocity);
      profile.accelerations.push(acceleration);
    }
  }

  /**
   * Interpolate within a specific phase
   * @param {Object} phase - Phase to interpolate within
   * @param {number} time - Time within the phase
   * @returns {Object} Interpolated values
   */
  interpolatePhase(phase, time) {
    const { startVel, startPos, acceleration, duration } = phase;

    // Clamp time to phase duration
    const t = Math.min(time, duration);

    // Kinematic equations
    const velocity = startVel + acceleration * t;
    const position = startPos + startVel * t + 0.5 * acceleration * t * t;

    return {
      position,
      velocity,
      acceleration,
    };
  }

  /**
   * Get profile setpoint at specific time
   * @param {Object} profile - Generated profile
   * @param {number} time - Time to get setpoint for
   * @returns {Object} Position, velocity, acceleration setpoint
   */
  getSetpointAtTime(profile, time) {
    if (time >= profile.totalTime) {
      // Motion complete
      return {
        position: profile.distance,
        velocity: 0,
        acceleration: 0,
        phase: 'complete',
      };
    }

    // Find current phase
    let currentTime = 0;
    for (const [index, phase] of profile.phases.entries()) {
      if (time >= currentTime && time < currentTime + phase.duration) {
        const phaseTime = time - currentTime;
        const setpoint = this.interpolatePhase(phase, phaseTime);

        return {
          ...setpoint,
          phase: phase.name,
          phaseIndex: index,
          phaseProgress: phaseTime / phase.duration,
        };
      }
      currentTime += phase.duration;
    }

    // Fallback - return end state
    return {
      position: profile.distance,
      velocity: 0,
      acceleration: 0,
      phase: 'complete',
    };
  }

  /**
   * Validate profile parameters
   * @param {Object} params - Parameters to validate
   * @returns {Object} Validation result
   */
  validateParameters(params) {
    const errors = [];
    const warnings = [];

    if (params.maxVelocity <= 0) {
      errors.push('Maximum velocity must be positive');
    }

    if (params.acceleration <= 0) {
      errors.push('Acceleration must be positive');
    }

    if (params.jerk && params.jerk <= 0) {
      errors.push('Jerk must be positive');
    }

    // Check for reasonable values
    if (params.maxVelocity > 10000) {
      warnings.push('Maximum velocity is very high (>10000 mm/min)');
    }

    if (params.acceleration > 50000) {
      warnings.push('Acceleration is very high (>50000 mm/min²)');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

module.exports = { MotionProfiler };
