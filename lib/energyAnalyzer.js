const { logger } = require('./logger');

/**
 * Energy Analyzer
 * Analyzes energy consumption patterns and provides insights
 */
class EnergyAnalyzer {
  constructor(config = {}) {
    this.config = {
      analysisWindow: config.analysisWindow || 24 * 60 * 60 * 1000, // 24 hours in ms
      patternThreshold: config.patternThreshold || 0.1, // 10% variation threshold
      efficiencyBaseline: config.efficiencyBaseline || 85, // 85% baseline efficiency
      ...config
    };
    
    this.patterns = new Map(); // deviceId -> patterns
    this.recommendations = new Map(); // deviceId -> recommendations
    this.reports = [];
  }

  /**
   * Analyze usage patterns for a device
   */
  analyzeUsagePatterns(deviceId, powerData, timeRange = null) {
    if (!powerData || powerData.length === 0) {
      return null;
    }

    const analysisRange = timeRange || this.config.analysisWindow;
    const cutoffTime = Date.now() - analysisRange;
    
    // Filter data to analysis window
    const filteredData = powerData.filter(reading => reading.timestamp >= cutoffTime);
    
    if (filteredData.length < 10) {
      logger.warn('Insufficient data for pattern analysis', { deviceId, dataPoints: filteredData.length });
      return null;
    }

    const patterns = {
      deviceId,
      analysisTime: Date.now(),
      timeRange: analysisRange,
      dataPoints: filteredData.length,
      
      // Basic statistics
      totalEnergy: this.calculateTotalEnergy(filteredData),
      averagePower: this.calculateAveragePower(filteredData),
      peakPower: this.findPeakPower(filteredData),
      minPower: this.findMinPower(filteredData),
      
      // Pattern identification
      periodicPatterns: this.identifyPeriodicPatterns(filteredData),
      loadPatterns: this.identifyLoadPatterns(filteredData),
      efficiencyTrends: this.analyzeEfficiencyTrends(filteredData),
      
      // Operating characteristics
      operatingModes: this.identifyOperatingModes(filteredData),
      idleTime: this.calculateIdleTime(filteredData),
      activeTime: this.calculateActiveTime(filteredData),
      
      // Efficiency analysis
      efficiency: this.calculateEfficiencyMetrics(filteredData),
      
      // Cost analysis
      costAnalysis: this.analyzeCosts(filteredData),
      
      // Recommendations
      recommendations: this.generateRecommendations(filteredData)
    };

    this.patterns.set(deviceId, patterns);
    logger.info('Usage patterns analyzed', { deviceId, patterns: patterns.periodicPatterns.length });
    
    return patterns;
  }

  /**
   * Calculate total energy consumption
   */
  calculateTotalEnergy(powerData) {
    let totalEnergy = 0;
    
    for (let i = 1; i < powerData.length; i++) {
      const timeDiff = (powerData[i].timestamp - powerData[i-1].timestamp) / (1000 * 60 * 60); // hours
      const avgPower = (powerData[i].power + powerData[i-1].power) / 2;
      totalEnergy += avgPower * timeDiff;
    }
    
    return totalEnergy; // Wh
  }

  /**
   * Calculate average power consumption
   */
  calculateAveragePower(powerData) {
    if (return 0) {
      ;
    }
    
    const sum = powerData.reduce((total, reading) => total + reading.power, 0);
    return sum / powerData.length;
  }

  /**
   * Find peak power consumption
   */
  findPeakPower(powerData) {
    if (return 0) {
      ;
    }
    
    const peak = Math.max(...powerData.map(reading => reading.power));
    const peakReading = powerData.find(reading => reading.power === peak);
    
    return {
      power: peak,
      timestamp: peakReading?.timestamp,
      duration: this.calculatePeakDuration(powerData, peak * 0.9) // 90% of peak
    };
  }

  /**
   * Find minimum power consumption
   */
  findMinPower(powerData) {
    if (return 0) {
      ;
    }
    
    return Math.min(...powerData.map(reading => reading.power));
  }

  /**
   * Identify periodic patterns in power consumption
   */
  identifyPeriodicPatterns(powerData) {
    const patterns = [];
    const timeWindows = [
      { name: 'hourly', window: 60 * 60 * 1000 },
      { name: 'daily', window: 24 * 60 * 60 * 1000 },
      { name: 'weekly', window: 7 * 24 * 60 * 60 * 1000 }
    ];

    for (const timeWindow of timeWindows) {
      const pattern = this.findPeriodicPattern(powerData, timeWindow.window);
      if (pattern.correlation > 0.5) {
        patterns.push({
          type: timeWindow.name,
          ...pattern
        });
      }
    }

    return patterns;
  }

  /**
   * Find periodic pattern within a time window
   */
  findPeriodicPattern(powerData, windowSize) {
    // Simplified pattern detection - look for recurring power levels
    const buckets = new Map();
    const bucketSize = windowSize / 100; // Divide window into 100 buckets
    
    powerData.forEach(reading => {
      const bucket = Math.floor((reading.timestamp % windowSize) / bucketSize);
      if (!buckets.has(bucket)) {
        buckets.set(bucket, []);
      }
      buckets.get(bucket).push(reading.power);
    });

    // Calculate correlation between pattern repetitions
    let correlation = 0;
    if (buckets.size > 10) {
      const avgPattern = [];
      for (let i = 0; i < 100; i++) {
        const bucketData = buckets.get(i) || [];
        avgPattern.push(bucketData.length > 0 ? 
          bucketData.reduce((sum, val) => sum + val, 0) / bucketData.length : 0);
      }
      
      // Simple correlation measure (variance from mean)
      const mean = avgPattern.reduce((sum, val) => sum + val, 0) / avgPattern.length;
      const variance = avgPattern.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / avgPattern.length;
      correlation = variance > 0 ? 1 / (1 + variance / mean) : 0;
    }

    return {
      correlation,
      windowSize,
      confidence: Math.min(correlation * powerData.length / 100, 1.0)
    };
  }

  /**
   * Identify load patterns (idle, normal, peak operation)
   */
  identifyLoadPatterns(powerData) {
    if (return []) {
      ;
    }

    const powers = powerData.map(reading => reading.power).sort((a, b) => a - b);
    const total = powers.length;
    
    // Define thresholds based on percentiles
    const idleThreshold = powers[Math.floor(total * 0.25)]; // 25th percentile
    const normalThreshold = powers[Math.floor(total * 0.75)]; // 75th percentile
    
    const patterns = [];
    let currentPattern = null;
    
    for (const reading of powerData) {
      let mode;
      if (reading.power <= idleThreshold) {
        mode = 'idle';
      } else if (reading.power <= normalThreshold) {
        mode = 'normal';
      } else {
        mode = 'peak';
      }

      if (!currentPattern || currentPattern.mode !== mode) {
        if (currentPattern) {
          currentPattern.endTime = reading.timestamp;
          currentPattern.duration = currentPattern.endTime - currentPattern.startTime;
          patterns.push(currentPattern);
        }
        
        currentPattern = {
          mode,
          startTime: reading.timestamp,
          startPower: reading.power,
          minPower: reading.power,
          maxPower: reading.power,
          totalEnergy: 0
        };
      } else {
        currentPattern.minPower = Math.min(currentPattern.minPower, reading.power);
        currentPattern.maxPower = Math.max(currentPattern.maxPower, reading.power);
      }
    }

    // Close final pattern
    if (currentPattern) {
      const lastReading = powerData[powerData.length - 1];
      currentPattern.endTime = lastReading.timestamp;
      currentPattern.duration = currentPattern.endTime - currentPattern.startTime;
      patterns.push(currentPattern);
    }

    return patterns;
  }

  /**
   * Analyze efficiency trends over time
   */
  analyzeEfficiencyTrends(powerData) {
    const efficiencyReadings = powerData.filter(reading => reading.efficiency);
    
    if (efficiencyReadings.length < 5) {
      return { trend: 'insufficient_data', confidence: 0 };
    }

    // Calculate trend using simple linear regression
    const n = efficiencyReadings.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    efficiencyReadings.forEach((reading, index) => {
      const x = index;
      const y = reading.efficiency;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate correlation coefficient
    const avgY = sumY / n;
    const avgX = sumX / n;
    let numerator = 0, denomX = 0, denomY = 0;
    
    efficiencyReadings.forEach((reading, index) => {
      const x = index;
      const y = reading.efficiency;
      numerator += (x - avgX) * (y - avgY);
      denomX += (x - avgX) * (x - avgX);
      denomY += (y - avgY) * (y - avgY);
    });
    
    const correlation = numerator / Math.sqrt(denomX * denomY);
    
    let trend;
    if (Math.abs(slope) < 0.1) {
      trend = 'stable';
    } else if (slope > 0) {
      trend = 'improving';
    } else {
      trend = 'declining';
    }

    return {
      trend,
      slope,
      correlation: Math.abs(correlation),
      confidence: Math.abs(correlation),
      currentEfficiency: efficiencyReadings[efficiencyReadings.length - 1].efficiency,
      baselineEfficiency: this.config.efficiencyBaseline,
      efficiency_vs_baseline: efficiencyReadings[efficiencyReadings.length - 1].efficiency - this.config.efficiencyBaseline
    };
  }

  /**
   * Identify operating modes
   */
  identifyOperatingModes(powerData) {
    // Use k-means clustering to identify distinct operating modes
    const powers = powerData.map(reading => reading.power);
    const clusters = this.kMeansClustering(powers, 3); // Assume 3 modes: idle, normal, peak
    
    return clusters.map((cluster, index) => ({
      mode: index === 0 ? 'idle' : index === 1 ? 'normal' : 'peak',
      averagePower: cluster.centroid,
      dataPoints: cluster.points.length,
      percentage: (cluster.points.length / powerData.length) * 100,
      powerRange: {
        min: Math.min(...cluster.points),
        max: Math.max(...cluster.points)
      }
    }));
  }

  /**
   * Simple k-means clustering implementation
   */
  kMeansClustering(data, k) {
    if (return []) {
      ;
    }

    // Initialize centroids
    const min = Math.min(...data);
    const max = Math.max(...data);
    let centroids = [];
    for (let i = 0; i < k; i++) {
      centroids.push(min + (max - min) * i / (k - 1));
    }

    let clusters = [];
    let previousCentroids = [];
    
    // Iterate until convergence
    for (let iteration = 0; iteration < 100; iteration++) {
      clusters = centroids.map(() => ({ points: [], centroid: 0 }));
      
      // Assign points to clusters
      data.forEach(point => {
        let minDistance = Infinity;
        let closestCluster = 0;
        
        centroids.forEach((centroid, index) => {
          const distance = Math.abs(point - centroid);
          if (distance < minDistance) {
            minDistance = distance;
            closestCluster = index;
          }
        });
        
        clusters[closestCluster].points.push(point);
      });
      
      // Update centroids
      centroids = clusters.map(cluster => {
        if (return 0) {
          ;
        }
        return cluster.points.reduce((sum, point) => sum + point, 0) / cluster.points.length;
      });
      
      // Check for convergence
      if (JSON.stringify(centroids) === JSON.stringify(previousCentroids)) {
        break;
      }
      previousCentroids = [...centroids];
    }

    // Update cluster centroids
    clusters.forEach((cluster, index) => {
      cluster.centroid = centroids[index];
    });

    return clusters;
  }

  /**
   * Calculate idle time percentage
   */
  calculateIdleTime(powerData) {
    if (return 0) {
      ;
    }
    
    const idleThreshold = this.findMinPower(powerData) * 1.1; // 10% above minimum
    const idleReadings = powerData.filter(reading => reading.power <= idleThreshold);
    
    return (idleReadings.length / powerData.length) * 100;
  }

  /**
   * Calculate active time percentage  
   */
  calculateActiveTime(powerData) {
    return 100 - this.calculateIdleTime(powerData);
  }

  /**
   * Calculate efficiency metrics
   */
  calculateEfficiencyMetrics(powerData) {
    const efficiencyReadings = powerData.filter(reading => reading.efficiency);
    
    if (efficiencyReadings.length === 0) {
      return {
        average: this.config.efficiencyBaseline,
        trend: 'unknown',
        vs_baseline: 0
      };
    }

    const average = efficiencyReadings.reduce((sum, reading) => sum + reading.efficiency, 0) / efficiencyReadings.length;
    const trend = this.analyzeEfficiencyTrends(powerData);
    
    return {
      average,
      min: Math.min(...efficiencyReadings.map(r => r.efficiency)),
      max: Math.max(...efficiencyReadings.map(r => r.efficiency)),
      trend: trend.trend,
      vs_baseline: average - this.config.efficiencyBaseline
    };
  }

  /**
   * Analyze costs
   */
  analyzeCosts(powerData) {
    const totalEnergyWh = this.calculateTotalEnergy(powerData);
    const totalEnergyKWh = totalEnergyWh / 1000;
    
    // Assume default rate if not configured
    const electricityRate = this.config.electricityRate || 0.12; // $/kWh
    const totalCost = totalEnergyKWh * electricityRate;
    
    const timeSpanHours = (powerData[powerData.length - 1].timestamp - powerData[0].timestamp) / (1000 * 60 * 60);
    const averagePowerKW = this.calculateAveragePower(powerData) / 1000;
    
    return {
      totalEnergy: totalEnergyWh,
      totalEnergyKWh,
      totalCost,
      electricityRate,
      costPerHour: totalCost / timeSpanHours,
      costPerKWh: electricityRate,
      averagePowerCost: averagePowerKW * electricityRate, // $/hour at average power
    };
  }

  /**
   * Generate optimization recommendations
   */
  generateRecommendations(powerData) {
    const recommendations = [];
    
    // Efficiency recommendations
    const efficiency = this.calculateEfficiencyMetrics(powerData);
    if (efficiency.average < this.config.efficiencyBaseline) {
      recommendations.push({
        type: 'efficiency',
        priority: 'high',
        message: `Motor efficiency (${efficiency.average.toFixed(1)}%) is below baseline (${this.config.efficiencyBaseline}%)`,
        suggestion: 'Check motor temperature, lubrication, and load alignment',
        potential_savings: this.calculateEfficiencySavings(powerData, efficiency)
      });
    }

    // Idle time recommendations
    const idleTime = this.calculateIdleTime(powerData);
    if (idleTime > 50) {
      recommendations.push({
        type: 'idle_optimization',
        priority: 'medium',
        message: `High idle time detected (${idleTime.toFixed(1)}%)`,
        suggestion: 'Consider implementing power-down modes during idle periods',
        potential_savings: this.calculateIdleSavings(powerData, idleTime)
      });
    }

    // Peak power recommendations
    const peak = this.findPeakPower(powerData);
    const average = this.calculateAveragePower(powerData);
    if (peak.power > average * 3) {
      recommendations.push({
        type: 'peak_optimization',
        priority: 'medium',
        message: `High peak power usage detected (${peak.power.toFixed(1)}W vs ${average.toFixed(1)}W average)`,
        suggestion: 'Consider load balancing or motion profile optimization',
        potential_savings: this.calculatePeakSavings(powerData, peak, average)
      });
    }

    // Operating schedule recommendations
    const costAnalysis = this.analyzeCosts(powerData);
    if (costAnalysis.totalCost > 10) { // Arbitrary threshold
      recommendations.push({
        type: 'scheduling',
        priority: 'low',
        message: 'Consider optimizing operation schedule for off-peak electricity rates',
        suggestion: 'Schedule high-power operations during off-peak hours',
        potential_savings: costAnalysis.totalCost * 0.3 // Assume 30% potential savings
      });
    }

    return recommendations;
  }

  /**
   * Calculate potential efficiency savings
   */
  calculateEfficiencySavings(powerData, efficiency) {
    const totalEnergy = this.calculateTotalEnergy(powerData);
    const currentEfficiency = efficiency.average / 100;
    const targetEfficiency = this.config.efficiencyBaseline / 100;
    
    const potentialEnergySavings = totalEnergy * (1/currentEfficiency - 1/targetEfficiency);
    const electricityRate = this.config.electricityRate || 0.12;
    
    return {
      energySavings: potentialEnergySavings, // Wh
      costSavings: (potentialEnergySavings / 1000) * electricityRate, // $
      percentageSavings: ((targetEfficiency - currentEfficiency) / currentEfficiency) * 100
    };
  }

  /**
   * Calculate potential idle time savings
   */
  calculateIdleSavings(powerData, idleTime) {
    const minPower = this.findMinPower(powerData);
    const totalTime = (powerData[powerData.length - 1].timestamp - powerData[0].timestamp) / (1000 * 60 * 60);
    const idleHours = totalTime * (idleTime / 100);
    
    // Assume we can reduce idle power by 80%
    const idlePowerSavings = minPower * 0.8;
    const energySavings = idlePowerSavings * idleHours;
    const electricityRate = this.config.electricityRate || 0.12;
    
    return {
      energySavings,
      costSavings: (energySavings / 1000) * electricityRate,
      percentageSavings: 80 // 80% of idle power
    };
  }

  /**
   * Calculate potential peak power savings
   */
  calculatePeakSavings(powerData, peak, average) {
    // Assume we can reduce peak power by 20% through optimization
    const peakReduction = peak.power * 0.2;
    const peakDuration = peak.duration || 3600000; // 1 hour default
    const energySavings = peakReduction * (peakDuration / (1000 * 60 * 60));
    const electricityRate = this.config.electricityRate || 0.12;
    
    return {
      energySavings,
      costSavings: (energySavings / 1000) * electricityRate,
      percentageSavings: 20
    };
  }

  /**
   * Calculate peak duration
   */
  calculatePeakDuration(powerData, threshold) {
    let duration = 0;
    let inPeak = false;
    let peakStart = 0;
    
    for (let i = 0; i < powerData.length; i++) {
      if (powerData[i].power >= threshold && !inPeak) {
        inPeak = true;
        peakStart = powerData[i].timestamp;
      } else if (powerData[i].power < threshold && inPeak) {
        inPeak = false;
        duration += powerData[i].timestamp - peakStart;
      }
    }
    
    // If still in peak at end
    if (inPeak) {
      duration += powerData[powerData.length - 1].timestamp - peakStart;
    }
    
    return duration;
  }

  /**
   * Generate comprehensive energy report
   */
  generateEnergyReport(deviceIds, timeRange = null) {
    const report = {
      reportId: `report_${Date.now()}`,
      generatedAt: Date.now(),
      timeRange: timeRange || this.config.analysisWindow,
      devices: [],
      summary: {
        totalDevices: deviceIds.length,
        totalEnergy: 0,
        totalCost: 0,
        averageEfficiency: 0,
        recommendations: []
      }
    };

    // Analyze each device
    for (const deviceId of deviceIds) {
      const pattern = this.patterns.get(deviceId);
      if (pattern) {
        report.devices.push({
          deviceId,
          analysis: pattern,
          contribution: {
            energyPercent: 0, // Will be calculated below
            costPercent: 0
          }
        });
        
        report.summary.totalEnergy += pattern.totalEnergy;
        report.summary.totalCost += pattern.costAnalysis.totalCost;
        report.summary.recommendations.push(...pattern.recommendations);
      }
    }

    // Calculate contributions
    report.devices.forEach(device => {
      device.contribution.energyPercent = report.summary.totalEnergy > 0 ? 
        (device.analysis.totalEnergy / report.summary.totalEnergy) * 100 : 0;
      device.contribution.costPercent = report.summary.totalCost > 0 ?
        (device.analysis.costAnalysis.totalCost / report.summary.totalCost) * 100 : 0;
    });

    // Calculate average efficiency
    const efficiencySum = report.devices.reduce((sum, device) => 
      sum + (device.analysis.efficiency?.average || this.config.efficiencyBaseline), 0);
    report.summary.averageEfficiency = report.devices.length > 0 ? 
      efficiencySum / report.devices.length : this.config.efficiencyBaseline;

    // Deduplicate and prioritize recommendations
    report.summary.recommendations = this.prioritizeRecommendations(
      report.summary.recommendations
    );

    this.reports.push(report);
    
    logger.info('Energy report generated', { 
      reportId: report.reportId, 
      devices: deviceIds.length,
      totalEnergy: report.summary.totalEnergy,
      totalCost: report.summary.totalCost
    });

    return report;
  }

  /**
   * Prioritize and deduplicate recommendations
   */
  prioritizeRecommendations(recommendations) {
    // Group by type
    const grouped = new Map();
    recommendations.forEach(rec => {
      if (!grouped.has(rec.type)) {
        grouped.set(rec.type, []);
      }
      grouped.get(rec.type).push(rec);
    });

    // Merge similar recommendations and prioritize
    const prioritized = [];
    const priorityOrder = ['high', 'medium', 'low'];
    
    for (const priority of priorityOrder) {
      for (const [type, recs] of grouped) {
        const highestPriority = recs.filter(r => r.priority === priority);
        if (highestPriority.length > 0) {
          // Take the recommendation with highest potential savings
          const best = highestPriority.reduce((best, current) => {
            const currentSavings = current.potential_savings?.costSavings || 0;
            const bestSavings = best.potential_savings?.costSavings || 0;
            return currentSavings > bestSavings ? current : best;
          });
          
          // Add count if multiple devices have the same recommendation
          if (highestPriority.length > 1) {
            best.deviceCount = highestPriority.length;
            best.message += ` (affects ${highestPriority.length} devices)`;
          }
          
          prioritized.push(best);
        }
      }
    }

    return prioritized;
  }

  /**
   * Get latest analysis for a device
   */
  getAnalysis(deviceId) {
    return this.patterns.get(deviceId);
  }

  /**
   * Get all reports
   */
  getReports() {
    return [...this.reports];
  }

  /**
   * Clear analysis data
   */
  clearAnalysis() {
    this.patterns.clear();
    this.recommendations.clear();
    this.reports.length = 0;
    logger.info('Energy analysis data cleared');
  }
}

module.exports = EnergyAnalyzer;