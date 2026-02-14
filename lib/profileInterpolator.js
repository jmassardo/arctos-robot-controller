/**
 * Profile Interpolator
 * Provides real-time interpolation of motion profiles for smooth execution
 */

const { logger } = require('./logger');

class ProfileInterpolator {
  constructor(profile, updateRate = 100) {
    this.profile = profile;
    this.updateRate = updateRate; // Hz
    this.updateInterval = 1000 / updateRate; // ms
    this.currentTime = 0;
    this.currentPhase = 0;
    this.isActive = false;
    this.startTime = null;
    this.callbacks = {
      onUpdate: null,
      onPhaseChange: null,
      onComplete: null,
      onError: null,
    };

    // Performance monitoring
    this.stats = {
      updateCount: 0,
      avgUpdateTime: 0,
      maxUpdateTime: 0,
      missedUpdates: 0,
    };

    this.intervalHandle = null;

    logger.info('Profile interpolator initialized', {
      profileType: profile.type,
      totalTime: profile.totalTime,
      updateRate: updateRate,
    });
  }

  /**
   * Start real-time profile execution
   * @param {Object} callbacks - Event callbacks
   */
  start(callbacks = {}) {
    if (this.isActive) {
      logger.warn('Interpolator already active');
      return false;
    }

    this.callbacks = { ...this.callbacks, ...callbacks };
    this.isActive = true;
    this.startTime = Date.now();
    this.currentTime = 0;
    this.currentPhase = 0;

    // Reset statistics
    this.stats = {
      updateCount: 0,
      avgUpdateTime: 0,
      maxUpdateTime: 0,
      missedUpdates: 0,
    };

    // Start interpolation timer
    this.intervalHandle = setInterval(() => {
      this.update();
    }, this.updateInterval);

    logger.info('Profile interpolation started');
    return true;
  }

  /**
   * Stop profile execution
   */
  stop() {
    if (!this.isActive) {
      return false;
    }

    this.isActive = false;

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    logger.info('Profile interpolation stopped', {
      stats: this.stats,
    });

    return true;
  }

  /**
   * Pause profile execution
   */
  pause() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    logger.info('Profile interpolation paused', { currentTime: this.currentTime });
  }

  /**
   * Resume profile execution
   */
  resume() {
    if (this.isActive && !this.intervalHandle) {
      this.startTime = Date.now() - this.currentTime * 1000;

      this.intervalHandle = setInterval(() => {
        this.update();
      }, this.updateInterval);

      logger.info('Profile interpolation resumed');
    }
  }

  /**
   * Main update loop - called at specified rate
   */
  update() {
    const updateStart = Date.now();

    try {
      // Calculate current time
      const elapsed = (Date.now() - this.startTime) / 1000; // Convert to seconds
      this.currentTime = elapsed;

      // Get current setpoint
      const setpoint = this.getSetpoint(this.currentTime);

      // Check for phase changes
      if (setpoint.phaseIndex !== undefined && setpoint.phaseIndex !== this.currentPhase) {
        const oldPhase = this.currentPhase;
        this.currentPhase = setpoint.phaseIndex;

        if (this.callbacks.onPhaseChange) {
          this.callbacks.onPhaseChange(this.currentPhase, oldPhase, setpoint);
        }
      }

      // Call update callback
      if (this.callbacks.onUpdate) {
        this.callbacks.onUpdate(setpoint, this.currentTime);
      }

      // Check if motion is complete
      if (this.currentTime >= this.profile.totalTime || setpoint.phase === 'complete') {
        this.complete();
      }

      // Update performance statistics
      this.updateStats(updateStart);
    } catch (error) {
      logger.error('Profile interpolation error', { error: error.message });

      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }

      this.stop();
    }
  }

  /**
   * Get interpolated setpoint at specific time
   * @param {number} time - Time to get setpoint for (seconds)
   * @returns {Object} Position, velocity, acceleration setpoint
   */
  getSetpoint(time) {
    if (time >= this.profile.totalTime) {
      return {
        position: this.profile.distance,
        velocity: 0,
        acceleration: 0,
        jerk: 0,
        phase: 'complete',
        phaseIndex: this.profile.phases.length,
        phaseProgress: 1.0,
        timeRemaining: 0,
      };
    }

    if (time <= 0) {
      return {
        position: 0,
        velocity: 0,
        acceleration: 0,
        jerk: 0,
        phase: 'start',
        phaseIndex: 0,
        phaseProgress: 0,
        timeRemaining: this.profile.totalTime,
      };
    }

    // Use profile-specific interpolation method
    let setpoint;

    if (this.profile.type === 's_curve') {
      setpoint = this.interpolateSCurve(time);
    } else {
      setpoint = this.interpolateStandard(time);
    }

    // Add common properties
    setpoint.timeRemaining = this.profile.totalTime - time;
    setpoint.progress = time / this.profile.totalTime;

    return setpoint;
  }

  /**
   * Interpolate standard profiles (trapezoidal, triangle)
   * @param {number} time - Current time
   * @returns {Object} Interpolated state
   */
  interpolateStandard(time) {
    // Find current phase
    let currentTime = 0;

    for (const [index, phase] of this.profile.phases.entries()) {
      if (time >= currentTime && time < currentTime + phase.duration) {
        const phaseTime = time - currentTime;
        const setpoint = this.interpolatePhase(phase, phaseTime);

        return {
          ...setpoint,
          phase: phase.name,
          phaseIndex: index,
          phaseProgress: phaseTime / phase.duration,
          jerk: 0, // Standard profiles don't have explicit jerk
        };
      }
      currentTime += phase.duration;
    }

    // Fallback - should not reach here
    return {
      position: this.profile.distance,
      velocity: 0,
      acceleration: 0,
      jerk: 0,
      phase: 'complete',
      phaseIndex: this.profile.phases.length,
      phaseProgress: 1.0,
    };
  }

  /**
   * Interpolate S-curve profiles with jerk
   * @param {number} time - Current time
   * @returns {Object} Interpolated state
   */
  interpolateSCurve(time) {
    // Find current phase
    let currentTime = 0;

    for (const [index, phase] of this.profile.phases.entries()) {
      if (time >= currentTime && time < currentTime + phase.duration) {
        const phaseTime = time - currentTime;
        const t = Math.min(phaseTime, phase.duration);

        // S-curve kinematic equations
        const { startPos, startVel, startAccel, jerk } = phase;

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
          phaseIndex: index,
          phaseProgress: t / phase.duration,
        };
      }
      currentTime += phase.duration;
    }

    // Fallback
    return {
      position: this.profile.distance,
      velocity: 0,
      acceleration: 0,
      jerk: 0,
      phase: 'complete',
      phaseIndex: this.profile.phases.length,
      phaseProgress: 1.0,
    };
  }

  /**
   * Interpolate within a standard profile phase
   * @param {Object} phase - Phase to interpolate within
   * @param {number} time - Time within the phase
   * @returns {Object} Interpolated values
   */
  interpolatePhase(phase, time) {
    const { startPos, startVel, acceleration, duration } = phase;

    // Clamp time to phase duration
    const t = Math.min(time, duration);

    // Standard kinematic equations
    const velocity = startVel + acceleration * t;
    const position = startPos + startVel * t + 0.5 * acceleration * t * t;

    return {
      position,
      velocity,
      acceleration,
    };
  }

  /**
   * Handle motion completion
   */
  complete() {
    this.stop();

    logger.info('Profile interpolation completed', {
      totalTime: this.currentTime,
      plannedTime: this.profile.totalTime,
      stats: this.stats,
    });

    if (this.callbacks.onComplete) {
      this.callbacks.onComplete({
        actualTime: this.currentTime,
        plannedTime: this.profile.totalTime,
        stats: this.stats,
      });
    }
  }

  /**
   * Update performance statistics
   * @param {number} updateStart - Start time of update
   */
  updateStats(updateStart) {
    const updateTime = Date.now() - updateStart;

    this.stats.updateCount++;
    this.stats.maxUpdateTime = Math.max(this.stats.maxUpdateTime, updateTime);

    // Calculate rolling average
    const alpha = 0.1; // Smoothing factor
    this.stats.avgUpdateTime = alpha * updateTime + (1 - alpha) * this.stats.avgUpdateTime;

    // Check for missed updates (updates taking longer than update interval)
    if (updateTime > this.updateInterval * 1.5) {
      this.stats.missedUpdates++;

      if (this.stats.missedUpdates % 10 === 0) {
        logger.warn('Profile interpolation performance warning', {
          updateTime,
          targetInterval: this.updateInterval,
          missedUpdates: this.stats.missedUpdates,
        });
      }
    }
  }

  /**
   * Modify profile parameters during execution
   * @param {Object} newParams - New profile parameters
   * @returns {boolean} Success status
   */
  modifyProfile(newParams) {
    if (!this.isActive) {
      logger.warn('Cannot modify profile when not active');
      return false;
    }

    try {
      // Get current state
      const currentState = this.getSetpoint(this.currentTime);

      // Calculate remaining distance
      const remainingDistance = this.profile.distance - currentState.position;

      if (Math.abs(remainingDistance) < 0.001) {
        // Motion nearly complete, no need to modify
        return true;
      }

      // Generate new profile for remaining motion
      const { MotionProfiler } = require('./motionProfiler');
      const profiler = new MotionProfiler();

      const newProfile = profiler.generateProfile(
        remainingDistance,
        newParams.type || this.profile.type,
        newParams
      );

      // Blend current state with new profile
      this.blendToNewProfile(currentState, newProfile);

      logger.info('Profile modified during execution', {
        currentTime: this.currentTime,
        remainingDistance,
        newParams,
      });

      return true;
    } catch (error) {
      logger.error('Failed to modify profile', { error: error.message });
      return false;
    }
  }

  /**
   * Blend current state to new profile smoothly
   * @param {Object} currentState - Current motion state
   * @param {Object} newProfile - New profile to blend to
   */
  blendToNewProfile(currentState, newProfile) {
    // Adjust new profile to start from current state
    const positionOffset = currentState.position;
    const velocityOffset = currentState.velocity;

    // Offset all positions in the new profile
    newProfile.phases.forEach(phase => {
      phase.startPos += positionOffset;
      phase.endPos += positionOffset;
    });

    // Adjust first phase to match current velocity
    if (newProfile.phases.length > 0) {
      newProfile.phases[0].startVel = velocityOffset;
    }

    // Update interpolator profile
    this.profile = newProfile;

    // Reset timing to start new profile from current time
    this.startTime = Date.now() - this.currentTime * 1000;
    this.currentTime = 0;
    this.currentPhase = 0;
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance stats
   */
  getStats() {
    return {
      ...this.stats,
      currentTime: this.currentTime,
      isActive: this.isActive,
      updateRate: this.updateRate,
      efficiency:
        this.stats.updateCount > 0
          ? (this.stats.updateCount - this.stats.missedUpdates) / this.stats.updateCount
          : 0,
    };
  }

  /**
   * Generate preview data for visualization
   * @param {number} resolution - Time resolution in ms
   * @returns {Object} Preview data
   */
  generatePreview(resolution = 10) {
    const dt = resolution / 1000;
    const numPoints = Math.ceil(this.profile.totalTime / dt) + 1;

    const preview = {
      timepoints: [],
      positions: [],
      velocities: [],
      accelerations: [],
      jerks: [],
      phases: [],
    };

    for (let i = 0; i < numPoints; i++) {
      const t = Math.min(i * dt, this.profile.totalTime);
      const setpoint = this.getSetpoint(t);

      preview.timepoints.push(t);
      preview.positions.push(setpoint.position);
      preview.velocities.push(setpoint.velocity);
      preview.accelerations.push(setpoint.acceleration);
      preview.jerks.push(setpoint.jerk || 0);
      preview.phases.push(setpoint.phase);
    }

    return preview;
  }
}

/**
 * Multi-axis profile interpolator for coordinated motion
 */
class MultiAxisInterpolator {
  constructor(profiles, updateRate = 100) {
    this.axes = {};
    this.updateRate = updateRate;
    this.isActive = false;
    this.startTime = null;
    this.callbacks = {};

    // Create interpolator for each axis
    for (const [axisId, profile] of Object.entries(profiles)) {
      this.axes[axisId] = new ProfileInterpolator(profile, updateRate);
    }

    this.intervalHandle = null;
  }

  /**
   * Start coordinated multi-axis motion
   * @param {Object} callbacks - Event callbacks
   */
  start(callbacks = {}) {
    this.callbacks = callbacks;
    this.isActive = true;
    this.startTime = Date.now();

    // Start interpolation timer
    this.intervalHandle = setInterval(() => {
      this.updateAllAxes();
    }, 1000 / this.updateRate);

    logger.info('Multi-axis interpolation started', {
      axes: Object.keys(this.axes).length,
    });

    return true;
  }

  /**
   * Stop all axes
   */
  stop() {
    this.isActive = false;

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    // Stop all individual interpolators
    Object.values(this.axes).forEach(interpolator => {
      interpolator.stop();
    });

    logger.info('Multi-axis interpolation stopped');
  }

  /**
   * Update all axes simultaneously
   */
  updateAllAxes() {
    const currentTime = (Date.now() - this.startTime) / 1000;
    const setpoints = {};
    let allComplete = true;

    // Get setpoints for all axes
    for (const [axisId, interpolator] of Object.entries(this.axes)) {
      const setpoint = interpolator.getSetpoint(currentTime);
      setpoints[axisId] = setpoint;

      if (setpoint.phase !== 'complete') {
        allComplete = false;
      }
    }

    // Call update callback
    if (this.callbacks.onUpdate) {
      this.callbacks.onUpdate(setpoints, currentTime);
    }

    // Check if all axes complete
    if (allComplete) {
      this.stop();

      if (this.callbacks.onComplete) {
        this.callbacks.onComplete(setpoints);
      }
    }
  }

  /**
   * Get current setpoints for all axes
   * @param {number} time - Time to evaluate (optional, uses current time if not provided)
   * @returns {Object} Setpoints for all axes
   */
  getSetpoints(time) {
    const evalTime = time !== undefined ? time : (Date.now() - this.startTime) / 1000;
    const setpoints = {};

    for (const [axisId, interpolator] of Object.entries(this.axes)) {
      setpoints[axisId] = interpolator.getSetpoint(evalTime);
    }

    return setpoints;
  }
}

module.exports = {
  ProfileInterpolator,
  MultiAxisInterpolator,
};
