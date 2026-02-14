const { logger } = require('./logger');

/**
 * Power Optimizer
 * Provides power optimization recommendations and automatic optimization
 */
class PowerOptimizer {
  constructor(powerManager, energyAnalyzer, config = {}) {
    this.powerManager = powerManager;
    this.energyAnalyzer = energyAnalyzer;

    this.config = {
      optimizationInterval: config.optimizationInterval || 300000, // 5 minutes
      powerLimitThreshold: config.powerLimitThreshold || 1000, // Watts
      efficiencyThreshold: config.efficiencyThreshold || 80, // Percentage
      autoOptimization: config.autoOptimization || false,
      aggressiveOptimization: config.aggressiveOptimization || false,
      ...config,
    };

    this.optimizationHistory = [];
    this.currentOptimizations = new Map();
    this.isOptimizing = false;

    // Optimization strategies
    this.strategies = {
      power_limiting: this.powerLimitingStrategy.bind(this),
      efficiency_optimization: this.efficiencyOptimizationStrategy.bind(this),
      load_balancing: this.loadBalancingStrategy.bind(this),
      scheduling_optimization: this.schedulingOptimizationStrategy.bind(this),
      idle_optimization: this.idleOptimizationStrategy.bind(this),
      peak_shaving: this.peakShavingStrategy.bind(this),
    };

    this.optimizationTimer = null;

    // Start automatic optimization if enabled
    if (this.config.autoOptimization) {
      this.startAutoOptimization();
    }

    logger.info('PowerOptimizer initialized', { config: this.config });
  }

  /**
   * Start automatic power optimization
   */
  startAutoOptimization() {
    if (this.optimizationTimer) {
      return;
    }

    this.optimizationTimer = setInterval(async () => {
      await this.runOptimization();
    }, this.config.optimizationInterval);

    logger.info('Automatic power optimization started');
  }

  /**
   * Stop automatic power optimization
   */
  stopAutoOptimization() {
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
      this.optimizationTimer = null;
    }

    logger.info('Automatic power optimization stopped');
  }

  /**
   * Run comprehensive power optimization
   */
  async runOptimization() {
    if (this.isOptimizing) {
      logger.warn('Optimization already in progress, skipping');
      return;
    }

    this.isOptimizing = true;
    const optimizationStart = Date.now();

    try {
      logger.info('Starting power optimization cycle');

      // Get current system metrics
      const systemMetrics = this.powerManager.getSystemMetrics();
      const devices = this.powerManager.getRegisteredDevices();

      // Analyze each device
      const optimizationResults = [];

      for (const device of devices) {
        const powerHistory = this.powerManager.getPowerHistory(device.deviceId, 100);

        if (powerHistory.length > 10) {
          // Analyze patterns for this device
          const patterns = this.energyAnalyzer.analyzeUsagePatterns(
            device.deviceId,
            powerHistory,
            this.config.optimizationInterval * 2
          );

          if (patterns) {
            // Generate optimization recommendations
            const recommendations = await this.generateOptimizationRecommendations(
              device,
              patterns,
              systemMetrics
            );

            if (recommendations.length > 0) {
              optimizationResults.push({
                deviceId: device.deviceId,
                patterns,
                recommendations,
                applied: [],
              });

              // Apply automatic optimizations if enabled
              if (this.config.autoOptimization) {
                const applied = await this.applyOptimizations(device.deviceId, recommendations);
                optimizationResults[optimizationResults.length - 1].applied = applied;
              }
            }
          }
        }
      }

      // System-wide optimizations
      const systemOptimizations = await this.generateSystemOptimizations(
        systemMetrics,
        devices,
        optimizationResults
      );

      const optimizationSummary = {
        timestamp: Date.now(),
        duration: Date.now() - optimizationStart,
        systemMetrics,
        deviceOptimizations: optimizationResults,
        systemOptimizations,
        totalRecommendations:
          optimizationResults.reduce((sum, result) => sum + result.recommendations.length, 0) +
          systemOptimizations.length,
        appliedOptimizations: optimizationResults.reduce(
          (sum, result) => sum + result.applied.length,
          0
        ),
      };

      this.optimizationHistory.push(optimizationSummary);

      // Keep only last 100 optimization cycles
      if (this.optimizationHistory.length > 100) {
        this.optimizationHistory.shift();
      }

      logger.info('Power optimization cycle completed', {
        duration: optimizationSummary.duration,
        totalRecommendations: optimizationSummary.totalRecommendations,
        appliedOptimizations: optimizationSummary.appliedOptimizations,
      });

      return optimizationSummary;
    } catch (error) {
      logger.error('Power optimization failed', { error: error.message });
      return null;
    } finally {
      this.isOptimizing = false;
    }
  }

  /**
   * Generate optimization recommendations for a device
   */
  async generateOptimizationRecommendations(device, patterns, systemMetrics) {
    const recommendations = [];

    // Power limiting recommendations
    if (device.currentPower > this.config.powerLimitThreshold) {
      recommendations.push({
        strategy: 'power_limiting',
        priority: 'high',
        description: `Device power (${device.currentPower}W) exceeds threshold (${this.config.powerLimitThreshold}W)`,
        action: 'limit_power',
        parameters: {
          currentPower: device.currentPower,
          targetPower: this.config.powerLimitThreshold * 0.9,
          method: 'speed_reduction',
        },
        estimatedSavings: {
          power: device.currentPower - this.config.powerLimitThreshold * 0.9,
          energy: 0, // Will be calculated based on duration
          cost: 0,
        },
      });
    }

    // Efficiency optimization
    if (patterns.efficiency.average < this.config.efficiencyThreshold) {
      recommendations.push({
        strategy: 'efficiency_optimization',
        priority: 'medium',
        description: `Device efficiency (${patterns.efficiency.average.toFixed(1)}%) below threshold (${this.config.efficiencyThreshold}%)`,
        action: 'optimize_efficiency',
        parameters: {
          currentEfficiency: patterns.efficiency.average,
          targetEfficiency: this.config.efficiencyThreshold,
          methods: ['temperature_control', 'load_optimization', 'maintenance_check'],
        },
        estimatedSavings: this.calculateEfficiencySavings(patterns),
      });
    }

    // Idle optimization
    if (patterns.idleTime > 30) {
      recommendations.push({
        strategy: 'idle_optimization',
        priority: 'medium',
        description: `High idle time detected (${patterns.idleTime.toFixed(1)}%)`,
        action: 'reduce_idle_power',
        parameters: {
          idleTime: patterns.idleTime,
          currentIdlePower: patterns.minPower,
          targetIdlePower: patterns.minPower * 0.5,
          method: 'power_down_mode',
        },
        estimatedSavings: this.calculateIdleSavings(patterns),
      });
    }

    // Peak shaving
    if (patterns.peakPower.power > patterns.averagePower * 2) {
      recommendations.push({
        strategy: 'peak_shaving',
        priority: 'low',
        description: `High peak power usage (${patterns.peakPower.power.toFixed(1)}W vs ${patterns.averagePower.toFixed(1)}W average)`,
        action: 'smooth_power_profile',
        parameters: {
          peakPower: patterns.peakPower.power,
          averagePower: patterns.averagePower,
          targetPeak: patterns.averagePower * 1.5,
          method: 'motion_profile_optimization',
        },
        estimatedSavings: this.calculatePeakSavings(patterns),
      });
    }

    return recommendations;
  }

  /**
   * Generate system-wide optimization recommendations
   */
  async generateSystemOptimizations(systemMetrics, devices, deviceResults) {
    const recommendations = [];

    // Load balancing
    const powerImbalance = this.calculatePowerImbalance(devices);
    if (powerImbalance.variance > systemMetrics.averagePower * 0.3) {
      recommendations.push({
        strategy: 'load_balancing',
        priority: 'medium',
        description: `Power imbalance detected (variance: ${powerImbalance.variance.toFixed(1)}W)`,
        action: 'balance_loads',
        parameters: {
          devices: powerImbalance.devices,
          targetVariance: systemMetrics.averagePower * 0.2,
          method: 'sequential_operation',
        },
        estimatedSavings: this.calculateLoadBalancingSavings(powerImbalance, systemMetrics),
      });
    }

    // Peak demand management
    if (systemMetrics.peakPower > systemMetrics.averagePower * 2.5) {
      recommendations.push({
        strategy: 'peak_demand_management',
        priority: 'high',
        description: `High system peak power (${systemMetrics.peakPower}W vs ${systemMetrics.averagePower.toFixed(1)}W average)`,
        action: 'implement_demand_control',
        parameters: {
          currentPeak: systemMetrics.peakPower,
          targetPeak: systemMetrics.averagePower * 2.0,
          method: 'staged_operations',
        },
        estimatedSavings: this.calculateDemandControlSavings(systemMetrics),
      });
    }

    // Scheduling optimization
    const totalCost = systemMetrics.costToDate;
    if (totalCost > 5) {
      // Arbitrary threshold
      recommendations.push({
        strategy: 'scheduling_optimization',
        priority: 'low',
        description: 'Consider time-of-use optimization for cost savings',
        action: 'optimize_schedule',
        parameters: {
          currentCost: totalCost,
          potentialSavings: totalCost * 0.2,
          method: 'off_peak_scheduling',
        },
        estimatedSavings: {
          cost: totalCost * 0.2,
          energy: 0,
          power: 0,
        },
      });
    }

    return recommendations;
  }

  /**
   * Apply optimization recommendations
   */
  async applyOptimizations(deviceId, recommendations) {
    const applied = [];

    for (const recommendation of recommendations) {
      try {
        if (this.shouldApplyOptimization(recommendation)) {
          const result = await this.applyOptimization(deviceId, recommendation);
          if (result.success) {
            applied.push({
              ...recommendation,
              appliedAt: Date.now(),
              result: result,
            });

            // Track current optimization
            this.currentOptimizations.set(`${deviceId}_${recommendation.strategy}`, {
              deviceId,
              recommendation,
              appliedAt: Date.now(),
              result,
            });

            logger.info('Optimization applied', {
              deviceId,
              strategy: recommendation.strategy,
              action: recommendation.action,
            });
          }
        }
      } catch (error) {
        logger.error('Failed to apply optimization', {
          deviceId,
          strategy: recommendation.strategy,
          error: error.message,
        });
      }
    }

    return applied;
  }

  /**
   * Check if optimization should be applied
   */
  shouldApplyOptimization(recommendation) {
    // Only apply high priority optimizations in non-aggressive mode
    if (!this.config.aggressiveOptimization && recommendation.priority !== 'high') {
      return false;
    }

    // Don't apply if potential savings are too low
    if (recommendation.estimatedSavings.power < 5) {
      // Less than 5W savings
      return false;
    }

    return true;
  }

  /**
   * Apply a specific optimization
   */
  async applyOptimization(deviceId, recommendation) {
    const strategy = this.strategies[recommendation.strategy];
    if (!strategy) {
      throw new Error(`Unknown optimization strategy: ${recommendation.strategy}`);
    }

    return await strategy(deviceId, recommendation);
  }

  /**
   * Power limiting optimization strategy
   */
  async powerLimitingStrategy(deviceId, recommendation) {
    const { targetPower, method } = recommendation.parameters;

    // This would integrate with the motor controller to limit power
    // For now, we'll simulate the optimization
    logger.info('Applying power limiting', {
      deviceId,
      targetPower,
      method,
    });

    return {
      success: true,
      method: 'simulation',
      oldPower: recommendation.parameters.currentPower,
      newPower: targetPower,
      savings: recommendation.estimatedSavings,
    };
  }

  /**
   * Efficiency optimization strategy
   */
  async efficiencyOptimizationStrategy(deviceId, recommendation) {
    const { methods, targetEfficiency } = recommendation.parameters;

    logger.info('Applying efficiency optimization', {
      deviceId,
      methods,
      targetEfficiency,
    });

    // Simulate efficiency improvements
    return {
      success: true,
      method: 'simulation',
      appliedMethods: methods,
      oldEfficiency: recommendation.parameters.currentEfficiency,
      newEfficiency: targetEfficiency,
      savings: recommendation.estimatedSavings,
    };
  }

  /**
   * Load balancing optimization strategy
   */
  async loadBalancingStrategy(deviceId, recommendation) {
    const { method } = recommendation.parameters;

    logger.info('Applying load balancing', {
      deviceId,
      method,
    });

    return {
      success: true,
      method: 'simulation',
      balancingMethod: method,
      savings: recommendation.estimatedSavings,
    };
  }

  /**
   * Scheduling optimization strategy
   */
  async schedulingOptimizationStrategy(deviceId, recommendation) {
    const { method } = recommendation.parameters;

    logger.info('Applying scheduling optimization', {
      deviceId,
      method,
    });

    return {
      success: true,
      method: 'simulation',
      schedulingMethod: method,
      savings: recommendation.estimatedSavings,
    };
  }

  /**
   * Idle optimization strategy
   */
  async idleOptimizationStrategy(deviceId, recommendation) {
    const { method, targetIdlePower } = recommendation.parameters;

    logger.info('Applying idle optimization', {
      deviceId,
      method,
      targetIdlePower,
    });

    return {
      success: true,
      method: 'simulation',
      idleMethod: method,
      oldIdlePower: recommendation.parameters.currentIdlePower,
      newIdlePower: targetIdlePower,
      savings: recommendation.estimatedSavings,
    };
  }

  /**
   * Peak shaving strategy
   */
  async peakShavingStrategy(deviceId, recommendation) {
    const { method, targetPeak } = recommendation.parameters;

    logger.info('Applying peak shaving', {
      deviceId,
      method,
      targetPeak,
    });

    return {
      success: true,
      method: 'simulation',
      peakShavingMethod: method,
      oldPeak: recommendation.parameters.peakPower,
      newPeak: targetPeak,
      savings: recommendation.estimatedSavings,
    };
  }

  /**
   * Calculate power imbalance across devices
   */
  calculatePowerImbalance(devices) {
    if (devices.length === 0) {
      return { variance: 0, devices: [] };
    }

    const powers = devices.map(d => d.currentPower);
    const average = powers.reduce((sum, p) => sum + p, 0) / powers.length;
    const variance = powers.reduce((sum, p) => sum + Math.pow(p - average, 2), 0) / powers.length;

    return {
      variance: Math.sqrt(variance),
      average,
      devices: devices
        .map(d => ({
          deviceId: d.deviceId,
          currentPower: d.currentPower,
          deviation: Math.abs(d.currentPower - average),
        }))
        .sort((a, b) => b.deviation - a.deviation),
    };
  }

  /**
   * Calculate efficiency improvement savings
   */
  calculateEfficiencySavings(patterns) {
    const currentEfficiency = patterns.efficiency.average / 100;
    const targetEfficiency = this.config.efficiencyThreshold / 100;

    const energySavings = patterns.totalEnergy * (1 / currentEfficiency - 1 / targetEfficiency);
    const electricityRate = 0.12; // Default rate

    return {
      energy: energySavings,
      cost: (energySavings / 1000) * electricityRate,
      power: (patterns.averagePower * (targetEfficiency - currentEfficiency)) / currentEfficiency,
    };
  }

  /**
   * Calculate idle time savings
   */
  calculateIdleSavings(patterns) {
    const idlePowerReduction = patterns.minPower * 0.5;
    const idleTimeHours = 24 * (patterns.idleTime / 100);
    const energySavings = idlePowerReduction * idleTimeHours;
    const electricityRate = 0.12;

    return {
      energy: energySavings,
      cost: (energySavings / 1000) * electricityRate,
      power: idlePowerReduction,
    };
  }

  /**
   * Calculate peak shaving savings
   */
  calculatePeakSavings(patterns) {
    const peakReduction = patterns.peakPower.power - patterns.averagePower * 1.5;
    const peakDuration = patterns.peakPower.duration || 3600000; // 1 hour
    const energySavings = peakReduction * (peakDuration / (1000 * 60 * 60));
    const electricityRate = 0.12;

    return {
      energy: Math.max(0, energySavings),
      cost: Math.max(0, (energySavings / 1000) * electricityRate),
      power: Math.max(0, peakReduction),
    };
  }

  /**
   * Calculate load balancing savings
   */
  calculateLoadBalancingSavings(imbalance, systemMetrics) {
    // Estimate 5% efficiency improvement from better load balancing
    const efficiencyGain = 0.05;
    const energySavings = systemMetrics.totalEnergy * efficiencyGain;
    const electricityRate = 0.12;

    return {
      energy: energySavings,
      cost: (energySavings / 1000) * electricityRate,
      power: systemMetrics.instantPower * efficiencyGain,
    };
  }

  /**
   * Calculate demand control savings
   */
  calculateDemandControlSavings(systemMetrics) {
    // Estimate savings from peak demand reduction
    const peakReduction = systemMetrics.peakPower - systemMetrics.averagePower * 2.0;
    const demandCharge = 15; // $/kW per month
    const monthlySavings = (peakReduction / 1000) * demandCharge;

    return {
      energy: 0, // Demand charges are about peak power, not energy
      cost: monthlySavings,
      power: peakReduction,
    };
  }

  /**
   * Get optimization history
   */
  getOptimizationHistory(limit = 50) {
    return this.optimizationHistory.slice(-limit);
  }

  /**
   * Get current active optimizations
   */
  getCurrentOptimizations() {
    return Array.from(this.currentOptimizations.values());
  }

  /**
   * Remove an optimization
   */
  removeOptimization(deviceId, strategy) {
    const key = `${deviceId}_${strategy}`;
    const optimization = this.currentOptimizations.get(key);

    if (optimization) {
      this.currentOptimizations.delete(key);
      logger.info('Optimization removed', { deviceId, strategy });
      return true;
    }

    return false;
  }

  /**
   * Update optimizer configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };

    // Restart auto optimization if the setting changed
    if (newConfig.autoOptimization !== undefined) {
      if (newConfig.autoOptimization) {
        this.startAutoOptimization();
      } else {
        this.stopAutoOptimization();
      }
    }

    logger.info('Power optimizer config updated', { config: this.config });
  }

  /**
   * Get optimizer status
   */
  getStatus() {
    return {
      isOptimizing: this.isOptimizing,
      autoOptimizationEnabled: !!this.optimizationTimer,
      currentOptimizations: this.currentOptimizations.size,
      optimizationHistory: this.optimizationHistory.length,
      lastOptimization:
        this.optimizationHistory.length > 0
          ? this.optimizationHistory[this.optimizationHistory.length - 1].timestamp
          : null,
      config: this.config,
    };
  }

  /**
   * Cleanup optimizer resources
   */
  cleanup() {
    this.stopAutoOptimization();
    this.currentOptimizations.clear();
    this.optimizationHistory.length = 0;
    logger.info('Power optimizer cleanup completed');
  }
}

module.exports = PowerOptimizer;
