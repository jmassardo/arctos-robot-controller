/**
 * Profile Optimizer
 * Automatically selects optimal motion profiles based on move parameters and constraints
 */

const { logger } = require('./logger');
const { MotionProfiler } = require('./motionProfiler');

class ProfileOptimizer {
  constructor() {
    this.profiler = new MotionProfiler();

    // Application-specific presets
    this.applicationPresets = {
      precision: {
        profileType: 's_curve',
        maxVelocity: 500, // mm/min - slower for precision
        acceleration: 2500, // mm/min² - gentle acceleration
        jerk: 25000, // mm/min³ - smooth jerk
        priority: 'accuracy',
      },
      speed: {
        profileType: 'trapezoidal',
        maxVelocity: 2000, // mm/min - fast
        acceleration: 10000, // mm/min² - aggressive acceleration
        jerk: 100000, // mm/min³ - higher jerk acceptable
        priority: 'time',
      },
      smooth: {
        profileType: 's_curve',
        maxVelocity: 1000, // mm/min - moderate speed
        acceleration: 5000, // mm/min² - moderate acceleration
        jerk: 15000, // mm/min³ - very smooth
        priority: 'smoothness',
      },
      energy: {
        profileType: 's_curve',
        maxVelocity: 800, // mm/min - energy efficient speed
        acceleration: 3000, // mm/min² - gentle on motors
        jerk: 20000, // mm/min³ - smooth for efficiency
        priority: 'efficiency',
      },
    };

    // Scoring weights for profile evaluation
    this.scoringWeights = {
      time: 0.3, // Execution time weight
      smoothness: 0.25, // Smoothness weight
      efficiency: 0.2, // Energy efficiency weight
      stress: 0.15, // Mechanical stress weight
      accuracy: 0.1, // Positioning accuracy weight
    };
  }

  /**
   * Select optimal profile for given move parameters
   * @param {number} moveDistance - Distance to move (mm)
   * @param {Object} constraints - Movement constraints
   * @param {string} applicationType - Application type hint
   * @returns {Object} Optimal profile parameters and generated profile
   */
  selectOptimalProfile(moveDistance, constraints = {}, applicationType = 'balanced') {
    logger.info('Selecting optimal profile', {
      moveDistance,
      constraints,
      applicationType,
    });

    try {
      // Get base parameters for application type
      const baseParams = this.getApplicationParams(applicationType);

      // Apply constraints
      const constrainedParams = this.applyConstraints(baseParams, constraints);

      // Evaluate different profile options
      const profileOptions = this.generateProfileOptions(
        moveDistance,
        constrainedParams,
        constraints
      );

      // Score and rank profiles
      const rankedProfiles = this.scoreProfiles(profileOptions, constraints);

      // Select best profile
      const optimalProfile = rankedProfiles[0];

      logger.info('Optimal profile selected', {
        type: optimalProfile.type,
        score: optimalProfile.score,
        totalTime: optimalProfile.profile.totalTime,
      });

      return {
        parameters: optimalProfile.parameters,
        profile: optimalProfile.profile,
        score: optimalProfile.score,
        reasoning: optimalProfile.reasoning,
        alternatives: rankedProfiles.slice(1, 3), // Top 2 alternatives
      };
    } catch (error) {
      logger.error('Profile optimization failed', { error: error.message });

      // Fallback to safe default profile
      const defaultParams = this.applicationPresets.smooth;
      const fallbackProfile = this.profiler.generateProfile(
        moveDistance,
        defaultParams.profileType,
        defaultParams
      );

      return {
        parameters: defaultParams,
        profile: fallbackProfile,
        score: 0.5,
        reasoning: 'Fallback due to optimization error',
        alternatives: [],
      };
    }
  }

  /**
   * Get application-specific parameter starting point
   * @param {string} applicationType - Application type
   * @returns {Object} Base parameters
   */
  getApplicationParams(applicationType) {
    if (this.applicationPresets[applicationType]) {
      return { ...this.applicationPresets[applicationType] };
    }

    // Default balanced parameters
    return {
      profileType: 's_curve',
      maxVelocity: 1000,
      acceleration: 5000,
      jerk: 50000,
      priority: 'balanced',
    };
  }

  /**
   * Apply movement constraints to base parameters
   * @param {Object} baseParams - Base parameters
   * @param {Object} constraints - Movement constraints
   * @returns {Object} Constrained parameters
   */
  applyConstraints(baseParams, constraints) {
    const params = { ...baseParams };

    // Apply velocity constraints
    if (constraints.maxVelocity) {
      params.maxVelocity = Math.min(params.maxVelocity, constraints.maxVelocity);
    }

    if (constraints.minVelocity) {
      params.maxVelocity = Math.max(params.maxVelocity, constraints.minVelocity);
    }

    // Apply acceleration constraints
    if (constraints.maxAcceleration) {
      params.acceleration = Math.min(params.acceleration, constraints.maxAcceleration);
    }

    if (constraints.minAcceleration) {
      params.acceleration = Math.max(params.acceleration, constraints.minAcceleration);
    }

    // Apply jerk constraints
    if (constraints.maxJerk) {
      params.jerk = Math.min(params.jerk, constraints.maxJerk);
    }

    // Force profile type if specified
    if (constraints.profileType) {
      params.profileType = constraints.profileType;
    }

    // Apply time constraints
    if (constraints.maxTime || constraints.minTime) {
      params = this.optimizeForTimeConstraints(params, constraints);
    }

    return params;
  }

  /**
   * Optimize parameters for time constraints
   * @param {Object} params - Current parameters
   * @param {Object} constraints - Time constraints
   * @returns {Object} Time-optimized parameters
   */
  optimizeForTimeConstraints(params, constraints) {
    const optimized = { ...params };

    // If maximum time constraint, may need to increase velocity/acceleration
    if (constraints.maxTime) {
      // Estimate required velocity for time constraint
      const estimatedVel = Math.abs(constraints.distance) / (constraints.maxTime * 0.6); // Rough estimate
      optimized.maxVelocity = Math.min(optimized.maxVelocity * 1.5, estimatedVel * 60); // Convert to mm/min
      optimized.acceleration = Math.min(optimized.acceleration * 1.3, optimized.maxVelocity * 10);
    }

    // If minimum time constraint, may need to limit velocity/acceleration
    if (constraints.minTime) {
      const maxAllowedVel = Math.abs(constraints.distance) / (constraints.minTime * 0.8);
      optimized.maxVelocity = Math.min(optimized.maxVelocity, maxAllowedVel * 60);
    }

    return optimized;
  }

  /**
   * Generate multiple profile options to evaluate
   * @param {number} distance - Move distance
   * @param {Object} baseParams - Base parameters
   * @param {Object} constraints - Constraints
   * @returns {Array} Array of profile options
   */
  generateProfileOptions(distance, baseParams, constraints) {
    const options = [];

    // Option 1: Base parameters as-is
    try {
      const profile1 = this.profiler.generateProfile(distance, baseParams.profileType, baseParams);
      options.push({
        type: `${baseParams.profileType}_base`,
        parameters: baseParams,
        profile: profile1,
      });
    } catch (error) {
      logger.warn('Failed to generate base profile option', { error: error.message });
    }

    // Option 2: Speed-optimized (if not already speed preset)
    if (baseParams.priority !== 'time') {
      try {
        const speedParams = {
          ...baseParams,
          profileType: 'trapezoidal',
          maxVelocity: Math.min(baseParams.maxVelocity * 1.5, constraints.maxVelocity || Infinity),
          acceleration: Math.min(
            baseParams.acceleration * 1.3,
            constraints.maxAcceleration || Infinity
          ),
        };
        const profile2 = this.profiler.generateProfile(
          distance,
          speedParams.profileType,
          speedParams
        );
        options.push({
          type: 'speed_optimized',
          parameters: speedParams,
          profile: profile2,
        });
      } catch (error) {
        logger.debug('Failed to generate speed-optimized option', { error: error.message });
      }
    }

    // Option 3: Smoothness-optimized
    if (baseParams.priority !== 'smoothness') {
      try {
        const smoothParams = {
          ...baseParams,
          profileType: 's_curve',
          maxVelocity: baseParams.maxVelocity * 0.8,
          acceleration: baseParams.acceleration * 0.8,
          jerk: baseParams.jerk * 0.5,
        };
        const profile3 = this.profiler.generateProfile(
          distance,
          smoothParams.profileType,
          smoothParams
        );
        options.push({
          type: 'smooth_optimized',
          parameters: smoothParams,
          profile: profile3,
        });
      } catch (error) {
        logger.debug('Failed to generate smooth-optimized option', { error: error.message });
      }
    }

    // Option 4: Energy-efficient
    if (baseParams.priority !== 'efficiency') {
      try {
        const efficientParams = {
          ...baseParams,
          profileType: 's_curve',
          maxVelocity: baseParams.maxVelocity * 0.7,
          acceleration: baseParams.acceleration * 0.6,
          jerk: baseParams.jerk * 0.7,
        };
        const profile4 = this.profiler.generateProfile(
          distance,
          efficientParams.profileType,
          efficientParams
        );
        options.push({
          type: 'energy_optimized',
          parameters: efficientParams,
          profile: profile4,
        });
      } catch (error) {
        logger.debug('Failed to generate energy-optimized option', { error: error.message });
      }
    }

    return options;
  }

  /**
   * Score and rank profile options
   * @param {Array} options - Profile options to score
   * @param {Object} constraints - Constraints for scoring
   * @returns {Array} Ranked profile options
   */
  scoreProfiles(options, constraints) {
    const scoredOptions = options.map(option => {
      const scores = this.calculateProfileScores(option.profile, option.parameters, constraints);
      const totalScore = this.calculateWeightedScore(scores, constraints);

      return {
        ...option,
        scores,
        score: totalScore,
        reasoning: this.generateReasoning(scores, option.type),
      };
    });

    // Sort by total score (descending)
    return scoredOptions.sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate individual scores for a profile
   * @param {Object} profile - Generated profile
   * @param {Object} parameters - Profile parameters
   * @param {Object} constraints - Scoring constraints
   * @returns {Object} Individual scores
   */
  calculateProfileScores(profile, parameters, constraints) {
    const scores = {};

    // Time score (lower time = higher score)
    const maxReasonableTime = Math.abs(profile.distance) / 100; // 100 mm/s baseline
    scores.time = Math.max(0, 1 - profile.totalTime / maxReasonableTime);

    // Smoothness score (S-curve with lower jerk = higher score)
    if (profile.type === 's_curve') {
      scores.smoothness = 1 - parameters.jerk / 200000; // Normalize against high jerk
    } else {
      scores.smoothness = 0.6; // Trapezoidal is moderately smooth
    }
    scores.smoothness = Math.max(0, Math.min(1, scores.smoothness));

    // Efficiency score (lower acceleration and velocity = higher efficiency)
    const velRatio = parameters.maxVelocity / 3000; // Normalize against 3000 mm/min
    const accelRatio = parameters.acceleration / 15000; // Normalize against 15000 mm/min²
    scores.efficiency = Math.max(0, 1 - (velRatio + accelRatio) / 2);

    // Mechanical stress score (inverse of peak acceleration and jerk)
    const peakAccel = parameters.acceleration;
    const peakJerk = parameters.jerk || peakAccel * 10; // Estimate for non-S-curve
    const stressRatio = peakAccel / 20000 + peakJerk / 500000;
    scores.stress = Math.max(0, 1 - stressRatio);

    // Accuracy score (S-curve generally more accurate)
    scores.accuracy = profile.type === 's_curve' ? 0.9 : 0.7;

    return scores;
  }

  /**
   * Calculate weighted total score
   * @param {Object} scores - Individual scores
   * @param {Object} constraints - Constraints that may affect weights
   * @returns {number} Weighted total score
   */
  calculateWeightedScore(scores, constraints) {
    let weights = { ...this.scoringWeights };

    // Adjust weights based on constraints or priorities
    if (constraints.priority === 'time') {
      weights.time *= 2;
      weights.efficiency *= 0.5;
    } else if (constraints.priority === 'smoothness') {
      weights.smoothness *= 2;
      weights.time *= 0.5;
    } else if (constraints.priority === 'efficiency') {
      weights.efficiency *= 2;
      weights.time *= 0.7;
    } else if (constraints.priority === 'accuracy') {
      weights.accuracy *= 2;
      weights.time *= 0.7;
    }

    // Normalize weights
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    Object.keys(weights).forEach(key => {
      weights[key] /= totalWeight;
    });

    // Calculate weighted score
    let totalScore = 0;
    Object.keys(scores).forEach(key => {
      if (weights[key]) {
        totalScore += scores[key] * weights[key];
      }
    });

    return totalScore;
  }

  /**
   * Generate human-readable reasoning for profile selection
   * @param {Object} scores - Individual scores
   * @param {string} profileType - Type of profile
   * @returns {string} Reasoning text
   */
  generateReasoning(scores, profileType) {
    const strengths = [];
    const weaknesses = [];

    Object.entries(scores).forEach(([category, score]) => {
      if (score > 0.8) {
        strengths.push(category);
      } else if (score < 0.4) {
        weaknesses.push(category);
      }
    });

    let reasoning = `${profileType} profile selected`;

    if (strengths.length > 0) {
      reasoning += ` for excellent ${strengths.join(' and ')}`;
    }

    if (weaknesses.length > 0) {
      reasoning += `, with trade-offs in ${weaknesses.join(' and ')}`;
    }

    return reasoning;
  }

  /**
   * Optimize profile for multi-axis coordinated motion
   * @param {Object} axisConstraints - Constraints for each axis
   * @param {Object} coordinationRequirements - Multi-axis coordination requirements
   * @returns {Object} Optimized multi-axis profiles
   */
  optimizeMultiAxisProfile(axisConstraints, coordinationRequirements = {}) {
    const profiles = {};
    const axisIds = Object.keys(axisConstraints);

    logger.info('Optimizing multi-axis profile', {
      axes: axisIds.length,
      coordination: coordinationRequirements.type || 'synchronized',
    });

    try {
      if (coordinationRequirements.type === 'synchronized') {
        // All axes finish at the same time
        profiles = this.optimizeSynchronizedAxes(axisConstraints, coordinationRequirements);
      } else if (coordinationRequirements.type === 'sequential') {
        // Axes move in sequence
        profiles = this.optimizeSequentialAxes(axisConstraints, coordinationRequirements);
      } else {
        // Independent optimization for each axis
        for (const [axisId, constraints] of Object.entries(axisConstraints)) {
          const result = this.selectOptimalProfile(
            constraints.distance,
            constraints,
            constraints.applicationType || 'balanced'
          );
          profiles[axisId] = result;
        }
      }

      return {
        profiles,
        coordinationType: coordinationRequirements.type || 'independent',
        totalTime: this.calculateMultiAxisTime(profiles),
        success: true,
      };
    } catch (error) {
      logger.error('Multi-axis optimization failed', { error: error.message });

      // Fallback to independent axis optimization
      const fallbackProfiles = {};
      for (const [axisId, constraints] of Object.entries(axisConstraints)) {
        try {
          const result = this.selectOptimalProfile(constraints.distance, constraints, 'smooth');
          fallbackProfiles[axisId] = result;
        } catch (axisError) {
          logger.error(`Fallback optimization failed for axis ${axisId}`, {
            error: axisError.message,
          });
        }
      }

      return {
        profiles: fallbackProfiles,
        coordinationType: 'independent_fallback',
        totalTime: this.calculateMultiAxisTime(fallbackProfiles),
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Optimize synchronized multi-axis motion (all axes finish together)
   * @param {Object} axisConstraints - Constraints for each axis
   * @param {Object} coordinationRequirements - Coordination requirements
   * @returns {Object} Synchronized profiles
   */
  optimizeSynchronizedAxes(axisConstraints, coordinationRequirements) {
    const profiles = {};

    // First, calculate optimal time for the most constraining axis
    let maxTime = 0;
    let criticalAxis = null;

    for (const [axisId, constraints] of Object.entries(axisConstraints)) {
      const testResult = this.selectOptimalProfile(
        constraints.distance,
        constraints,
        constraints.applicationType || 'balanced'
      );

      if (testResult.profile.totalTime > maxTime) {
        maxTime = testResult.profile.totalTime;
        criticalAxis = axisId;
      }
    }

    // Now optimize all axes for the same total time
    for (const [axisId, constraints] of Object.entries(axisConstraints)) {
      if (axisId === criticalAxis) {
        // Use the critical axis profile as-is
        profiles[axisId] = this.selectOptimalProfile(
          constraints.distance,
          constraints,
          constraints.applicationType || 'balanced'
        );
      } else {
        // Optimize other axes for the target time
        const syncConstraints = {
          ...constraints,
          maxTime: maxTime * 1.05, // Allow 5% tolerance
          minTime: maxTime * 0.95,
          priority: 'time',
        };

        profiles[axisId] = this.selectOptimalProfile(
          constraints.distance,
          syncConstraints,
          'smooth'
        );
      }
    }

    return profiles;
  }

  /**
   * Optimize sequential multi-axis motion
   * @param {Object} axisConstraints - Constraints for each axis
   * @param {Object} coordinationRequirements - Coordination requirements
   * @returns {Object} Sequential profiles
   */
  optimizeSequentialAxes(axisConstraints, coordinationRequirements) {
    const profiles = {};
    const sequence = coordinationRequirements.sequence || Object.keys(axisConstraints);

    for (const axisId of sequence) {
      const constraints = axisConstraints[axisId];
      profiles[axisId] = this.selectOptimalProfile(
        constraints.distance,
        constraints,
        constraints.applicationType || 'speed' // Sequential often prioritizes speed
      );
    }

    return profiles;
  }

  /**
   * Calculate total time for multi-axis motion
   * @param {Object} profiles - Axis profiles
   * @returns {number} Total time
   */
  calculateMultiAxisTime(profiles) {
    let totalTime = 0;

    for (const [axisId, result] of Object.entries(profiles)) {
      if (result && result.profile) {
        totalTime = Math.max(totalTime, result.profile.totalTime);
      }
    }

    return totalTime;
  }

  /**
   * Get performance metrics for profile comparison
   * @param {Object} profile - Profile to analyze
   * @returns {Object} Performance metrics
   */
  getProfileMetrics(profile) {
    const metrics = {
      executionTime: profile.totalTime,
      maxVelocity: profile.maxVelocityReached,
      avgVelocity: profile.distance / profile.totalTime,
      peakAcceleration: 0,
      peakJerk: 0,
      smoothnessIndex: 0,
      energyIndex: 0,
    };

    // Calculate peak values from phases
    for (const phase of profile.phases) {
      if (Math.abs(phase.acceleration || 0) > Math.abs(metrics.peakAcceleration)) {
        metrics.peakAcceleration = phase.acceleration || 0;
      }

      if (Math.abs(phase.jerk || 0) > Math.abs(metrics.peakJerk)) {
        metrics.peakJerk = phase.jerk || 0;
      }
    }

    // Calculate smoothness index (lower jerk = smoother)
    metrics.smoothnessIndex = Math.max(0, 1 - Math.abs(metrics.peakJerk) / 100000);

    // Calculate energy index (lower acceleration and velocity = more efficient)
    const velRatio = Math.abs(metrics.maxVelocity) / 2000; // Normalize to 2000 mm/min
    const accelRatio = Math.abs(metrics.peakAcceleration) / 10000; // Normalize to 10000 mm/min²
    metrics.energyIndex = Math.max(0, 1 - (velRatio + accelRatio) / 2);

    return metrics;
  }
}

module.exports = { ProfileOptimizer };
