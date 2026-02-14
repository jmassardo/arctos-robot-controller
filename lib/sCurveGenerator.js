/**
 * S-Curve Profile Generator
 * Implements jerk-limited motion profiles for smooth acceleration and deceleration
 */

const { logger } = require('./logger');

class SCurveGenerator {
  constructor() {
    this.minJerk = 1000; // Minimum jerk limit (mm/s³)
    this.maxJerk = 1000000; // Maximum jerk limit (mm/s³)
  }

  /**
   * Generate S-curve profile with jerk limiting
   * @param {number} distance - Move distance (mm)
   * @param {number} maxVel - Maximum velocity (mm/s)
   * @param {number} maxAccel - Maximum acceleration (mm/s²)
   * @param {number} jerk - Jerk limit (mm/s³)
   * @returns {Object} S-curve profile
   */
  generateSCurve(distance, maxVel, maxAccel, jerk) {
    // Validate inputs
    if (jerk < this.minJerk || jerk > this.maxJerk) {
      throw new Error(`Jerk must be between ${this.minJerk} and ${this.maxJerk} mm/s³`);
    }

    const absDistance = Math.abs(distance);
    const direction = distance >= 0 ? 1 : -1;

    // Calculate S-curve phases
    const phases = this.calculateSCurvePhases(absDistance, maxVel, maxAccel, jerk);

    // Generate profile structure
    const profile = {
      type: 's_curve',
      phases: this.buildPhaseArray(phases, direction),
      totalTime: phases.totalTime,
      maxVelocityReached: phases.maxVelReached * direction,
      distance: distance,
      jerkLimit: jerk,
      accelerationLimit: maxAccel,
      velocityLimit: maxVel,
    };

    // Generate time-series data
    this.generateTimeSeriesData(profile);

    logger.debug('S-curve profile generated', {
      distance,
      totalTime: profile.totalTime,
      maxVel: profile.maxVelocityReached,
      phases: profile.phases.length,
    });

    return profile;
  }

  /**
   * Calculate the seven phases of S-curve motion
   * @param {number} distance - Absolute move distance
   * @param {number} maxVel - Maximum velocity
   * @param {number} maxAccel - Maximum acceleration
   * @param {number} jerk - Jerk limit
   * @returns {Object} Phase calculations
   */
  calculateSCurvePhases(distance, maxVel, maxAccel, jerk) {
    // Phase 1: Jerk up (acceleration increases from 0 to maxAccel)
    const t1 = Math.min(maxAccel / jerk, Math.sqrt(maxVel / jerk));
    const a1 = jerk * t1;
    const v1 = 0.5 * jerk * t1 * t1;
    const s1 = (1 / 6) * jerk * t1 * t1 * t1;

    // Phase 3: Jerk down (acceleration decreases from maxAccel to 0)
    const t3 = t1; // Symmetric for smooth motion
    const a3 = a1;
    const v3 = v1;
    const s3 = s1;

    // Phase 2: Constant acceleration (if needed)
    let t2 = 0;
    let v2 = v1;
    let s2 = 0;

    const vMaxPossible = v1 + a1 * t2 + v3;

    if (vMaxPossible < maxVel) {
      // Need constant acceleration phase
      t2 = (maxVel - 2 * v1) / a1;
      v2 = maxVel - v3;
      s2 = v1 * t2 + 0.5 * a1 * t2 * t2;
    }

    const vMax = v1 + a1 * t2 + v3;

    // Check if we can reach the planned velocity profile
    const accelDistance = s1 + s2 + s3;
    const decelDistance = accelDistance; // Symmetric

    let t4 = 0; // Constant velocity phase
    let s4 = 0;

    if (2 * accelDistance < distance) {
      // Need constant velocity phase
      s4 = distance - 2 * accelDistance;
      t4 = s4 / vMax;
    } else {
      // Recalculate for shorter move
      return this.calculateShortMoveProfile(distance, maxVel, maxAccel, jerk);
    }

    // Deceleration phases (mirror of acceleration)
    const t5 = t3; // Jerk up (deceleration starts)
    const t6 = t2; // Constant deceleration
    const t7 = t1; // Jerk down (deceleration ends)

    const totalTime = t1 + t2 + t3 + t4 + t5 + t6 + t7;

    return {
      t1,
      t2,
      t3,
      t4,
      t5,
      t6,
      t7,
      s1,
      s2,
      s3,
      s4,
      v1,
      v2: vMax,
      v3: vMax,
      a1,
      a3,
      totalTime,
      maxVelReached: vMax,
      accelDistance,
      decelDistance,
    };
  }

  /**
   * Calculate S-curve for short moves that can't reach full acceleration
   * @param {number} distance - Move distance
   * @param {number} maxVel - Maximum velocity
   * @param {number} maxAccel - Maximum acceleration
   * @param {number} jerk - Jerk limit
   * @returns {Object} Short move profile
   */
  calculateShortMoveProfile(distance, maxVel, maxAccel, jerk) {
    // For short moves, we may not reach maximum acceleration or velocity
    // Calculate reduced profile parameters

    // Try triangle profile first (no constant velocity)
    const tAccel = Math.sqrt(distance / maxAccel);
    const vPeak = maxAccel * tAccel;

    if (vPeak <= maxVel) {
      // Triangle profile fits within velocity limit
      const jerkTime = Math.min(tAccel, maxAccel / jerk);

      if (jerkTime < tAccel) {
        // S-curve with constant acceleration phase
        const t1 = jerkTime;
        const t2 = tAccel - jerkTime;
        const t3 = jerkTime;

        const a1 = jerk * t1;
        const v1 = 0.5 * jerk * t1 * t1;
        const s1 = (1 / 6) * jerk * t1 * t1 * t1;

        const v2 = v1 + a1 * t2;
        const s2 = v1 * t2 + 0.5 * a1 * t2 * t2;

        const s3 = s1; // Symmetric

        return {
          t1,
          t2,
          t3,
          t4: 0,
          t5: t3,
          t6: t2,
          t7: t1,
          s1,
          s2,
          s3,
          s4: 0,
          v1,
          v2,
          v3: v2,
          a1,
          a3: a1,
          totalTime: 2 * (t1 + t2 + t3),
          maxVelReached: v2,
          accelDistance: s1 + s2 + s3,
          decelDistance: s1 + s2 + s3,
        };
      } else {
        // Pure jerk-limited (no constant acceleration)
        const t1 = Math.pow(distance / jerk, 1 / 3);
        const v1 = 0.5 * jerk * t1 * t1;
        const s1 = (1 / 6) * jerk * t1 * t1 * t1;

        return {
          t1,
          t2: 0,
          t3: t1,
          t4: 0,
          t5: t1,
          t6: 0,
          t7: t1,
          s1,
          s2: 0,
          s3: s1,
          s4: 0,
          v1,
          v2: v1,
          v3: v1,
          a1: jerk * t1,
          a3: jerk * t1,
          totalTime: 4 * t1,
          maxVelReached: v1,
          accelDistance: 2 * s1,
          decelDistance: 2 * s1,
        };
      }
    }

    // Fallback to basic calculation
    return this.calculateSCurvePhases(distance, maxVel, maxAccel, jerk);
  }

  /**
   * Build array of phase objects for the profile
   * @param {Object} phases - Calculated phase parameters
   * @param {number} direction - Movement direction (+1 or -1)
   * @returns {Array} Array of phase objects
   */
  buildPhaseArray(phases, direction) {
    const phaseArray = [];
    let currentPos = 0;
    let currentVel = 0;
    let currentAccel = 0;

    // Phase 1: Jerk up (acceleration ramp)
    if (phases.t1 > 0) {
      phaseArray.push({
        name: 'jerk_up_accel',
        duration: phases.t1,
        startPos: currentPos * direction,
        endPos: (currentPos + phases.s1) * direction,
        startVel: currentVel * direction,
        endVel: phases.v1 * direction,
        startAccel: currentAccel * direction,
        endAccel: phases.a1 * direction,
        jerk: (phases.a1 / phases.t1) * direction,
      });
      currentPos += phases.s1;
      currentVel = phases.v1;
      currentAccel = phases.a1;
    }

    // Phase 2: Constant acceleration
    if (phases.t2 > 0) {
      phaseArray.push({
        name: 'constant_accel',
        duration: phases.t2,
        startPos: currentPos * direction,
        endPos: (currentPos + phases.s2) * direction,
        startVel: currentVel * direction,
        endVel: phases.v2 * direction,
        startAccel: currentAccel * direction,
        endAccel: currentAccel * direction,
        jerk: 0,
      });
      currentPos += phases.s2;
      currentVel = phases.v2;
    }

    // Phase 3: Jerk down (acceleration end)
    if (phases.t3 > 0) {
      phaseArray.push({
        name: 'jerk_down_accel',
        duration: phases.t3,
        startPos: currentPos * direction,
        endPos: (currentPos + phases.s3) * direction,
        startVel: currentVel * direction,
        endVel: phases.v3 * direction,
        startAccel: currentAccel * direction,
        endAccel: 0 * direction,
        jerk: (-phases.a1 / phases.t3) * direction,
      });
      currentPos += phases.s3;
      currentVel = phases.v3;
      currentAccel = 0;
    }

    // Phase 4: Constant velocity
    if (phases.t4 > 0) {
      phaseArray.push({
        name: 'constant_velocity',
        duration: phases.t4,
        startPos: currentPos * direction,
        endPos: (currentPos + phases.s4) * direction,
        startVel: currentVel * direction,
        endVel: currentVel * direction,
        startAccel: 0,
        endAccel: 0,
        jerk: 0,
      });
      currentPos += phases.s4;
    }

    // Phase 5: Jerk up (deceleration start)
    if (phases.t5 > 0) {
      phaseArray.push({
        name: 'jerk_up_decel',
        duration: phases.t5,
        startPos: currentPos * direction,
        endPos: (currentPos + phases.s3) * direction,
        startVel: currentVel * direction,
        endVel: phases.v1 * direction,
        startAccel: 0,
        endAccel: -phases.a1 * direction,
        jerk: (-phases.a1 / phases.t5) * direction,
      });
      currentPos += phases.s3;
      currentVel = phases.v1;
      currentAccel = -phases.a1;
    }

    // Phase 6: Constant deceleration
    if (phases.t6 > 0) {
      phaseArray.push({
        name: 'constant_decel',
        duration: phases.t6,
        startPos: currentPos * direction,
        endPos: (currentPos + phases.s2) * direction,
        startVel: currentVel * direction,
        endVel: phases.v1 * direction,
        startAccel: currentAccel * direction,
        endAccel: currentAccel * direction,
        jerk: 0,
      });
      currentPos += phases.s2;
      currentVel = phases.v1;
    }

    // Phase 7: Jerk down (deceleration end)
    if (phases.t7 > 0) {
      phaseArray.push({
        name: 'jerk_down_decel',
        duration: phases.t7,
        startPos: currentPos * direction,
        endPos: (currentPos + phases.s1) * direction,
        startVel: currentVel * direction,
        endVel: 0,
        startAccel: currentAccel * direction,
        endAccel: 0,
        jerk: (phases.a1 / phases.t7) * direction,
      });
    }

    return phaseArray;
  }

  /**
   * Generate time-series data for S-curve profile
   * @param {Object} profile - Profile to populate
   * @param {number} resolution - Time resolution in ms
   */
  generateTimeSeriesData(profile, resolution = 10) {
    const dt = resolution / 1000; // Convert to seconds
    const numPoints = Math.ceil(profile.totalTime / dt) + 1;

    profile.timepoints = [];
    profile.velocities = [];
    profile.positions = [];
    profile.accelerations = [];
    profile.jerks = [];

    for (let i = 0; i < numPoints; i++) {
      const t = Math.min(i * dt, profile.totalTime);
      profile.timepoints.push(t);

      const state = this.getStateAtTime(profile, t);
      profile.positions.push(state.position);
      profile.velocities.push(state.velocity);
      profile.accelerations.push(state.acceleration);
      profile.jerks.push(state.jerk);
    }
  }

  /**
   * Get motion state at specific time
   * @param {Object} profile - S-curve profile
   * @param {number} time - Time to evaluate
   * @returns {Object} Motion state
   */
  getStateAtTime(profile, time) {
    if (time >= profile.totalTime) {
      return {
        position: profile.distance,
        velocity: 0,
        acceleration: 0,
        jerk: 0,
        phase: 'complete',
      };
    }

    // Find current phase
    let currentTime = 0;
    for (const [index, phase] of profile.phases.entries()) {
      if (time >= currentTime && time < currentTime + phase.duration) {
        const phaseTime = time - currentTime;
        return this.interpolateSCurvePhase(phase, phaseTime, index);
      }
      currentTime += phase.duration;
    }

    // Fallback
    return {
      position: profile.distance,
      velocity: 0,
      acceleration: 0,
      jerk: 0,
      phase: 'complete',
    };
  }

  /**
   * Interpolate within an S-curve phase
   * @param {Object} phase - Phase to interpolate
   * @param {number} time - Time within phase
   * @param {number} phaseIndex - Phase index for identification
   * @returns {Object} Interpolated state
   */
  interpolateSCurvePhase(phase, time, phaseIndex) {
    const t = Math.min(time, phase.duration);
    const { startPos, startVel, startAccel, jerk } = phase;

    // S-curve kinematic equations
    const position =
      startPos + startVel * t + 0.5 * startAccel * t * t + (1 / 6) * jerk * t * t * t;
    const velocity = startVel + startAccel * t + 0.5 * jerk * t * t;
    const acceleration = startAccel + jerk * t;

    return {
      position,
      velocity,
      acceleration,
      jerk,
      phase: phase.name,
      phaseIndex,
      phaseProgress: t / phase.duration,
    };
  }

  /**
   * Optimize S-curve parameters for specific requirements
   * @param {number} distance - Move distance
   * @param {number} timeLimit - Maximum time allowed
   * @param {number} accelerationLimit - Maximum acceleration
   * @param {Object} constraints - Additional constraints
   * @returns {Object} Optimized parameters
   */
  optimizeSCurveParameters(distance, timeLimit, accelerationLimit, constraints = {}) {
    const maxVelLimit = constraints.maxVelocity || distance / (timeLimit * 0.5);
    const jerkLimit = constraints.jerk || (accelerationLimit * accelerationLimit) / maxVelLimit;

    // Binary search for optimal velocity
    let minVel = 0;
    let maxVel = maxVelLimit;
    let optimalParams = null;

    for (let iteration = 0; iteration < 20; iteration++) {
      const testVel = (minVel + maxVel) / 2;

      try {
        const profile = this.generateSCurve(distance, testVel, accelerationLimit, jerkLimit);

        if (profile.totalTime <= timeLimit) {
          optimalParams = {
            maxVelocity: testVel,
            acceleration: accelerationLimit,
            jerk: jerkLimit,
            totalTime: profile.totalTime,
          };
          minVel = testVel;
        } else {
          maxVel = testVel;
        }
      } catch (error) {
        maxVel = testVel;
      }
    }

    return (
      optimalParams || {
        maxVelocity: minVel,
        acceleration: accelerationLimit,
        jerk: jerkLimit,
        totalTime: timeLimit,
      }
    );
  }
}

module.exports = { SCurveGenerator };
