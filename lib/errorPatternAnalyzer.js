const { logger } = require('./logger');
const { models } = require('./database');

/**
 * Error Pattern Analysis System
 * Analyzes hardware error patterns to identify trends and predict maintenance needs
 */
class ErrorPatternAnalyzer {
  constructor(options = {}) {
    this.options = {
      analysisWindowHours: 24,
      minimumOccurrences: 3,
      correlationThreshold: 0.7,
      frequencyThreshold: 0.1,
      clusterTimeWindowMinutes: 15,
      ...options
    };
    
    this.patterns = {
      frequent: [],
      clusters: [],
      correlations: [],
      trends: [],
      maintenance: []
    };
  }
  
  /**
   * Initialize the pattern analyzer
   */
  async initialize() {
    try {
      logger.info('Initializing Error Pattern Analyzer');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Error Pattern Analyzer', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Analyze error patterns from historical data
   */
  async analyzePatterns(errors, timeframe = '24h') {
    try {
      logger.debug('Starting error pattern analysis', {
        errorCount: errors.length,
        timeframe
      });
      
      const analysis = {
        frequent: await this.findFrequentErrors(errors),
        clusters: await this.detectErrorClusters(errors),
        correlations: await this.findErrorCorrelations(errors),
        trends: await this.analyzeTrends(errors),
        maintenance: await this.assessMaintenanceNeeds(errors),
        summary: {}
      };
      
      // Generate summary statistics
      analysis.summary = this.generateSummary(analysis);
      
      // Store patterns for future reference
      this.patterns = analysis;
      
      logger.info('Error pattern analysis completed', {
        frequentErrors: analysis.frequent.length,
        clusters: analysis.clusters.length,
        correlations: analysis.correlations.length,
        trends: analysis.trends.length,
        maintenanceItems: analysis.maintenance.length
      });
      
      return analysis;
    } catch (error) {
      logger.error('Failed to analyze error patterns', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Find frequently occurring errors
   */
  async findFrequentErrors(errors) {
    try {
      const errorCounts = new Map();
      const controllerCounts = new Map();
      
      // Count occurrences by error code and controller
      for (const error of errors) {
        const key = `${error.controller_id}_${error.error_code}`;
        const count = errorCounts.get(key) || 0;
        errorCounts.set(key, count + (error.occurrence_count || 1));
        
        // Count by controller
        const controllerCount = controllerCounts.get(error.controller_id) || 0;
        controllerCounts.set(error.controller_id, controllerCount + (error.occurrence_count || 1));
      }
      
      const frequentErrors = [];
      const totalErrors = errors.length;
      
      for (const [key, count] of errorCounts.entries()) {
        const frequency = count / totalErrors;
        
        if (count >= this.options.minimumOccurrences && frequency >= this.options.frequencyThreshold) {
          const [controllerId, errorCode] = key.split('_');
          const errorInfo = errors.find(e => e.controller_id === controllerId && e.error_code === errorCode);
          
          frequentErrors.push({
            controller_id: controllerId,
            error_code: errorCode,
            error_type: errorInfo?.error_type || 'Unknown',
            occurrence_count: count,
            frequency: frequency,
            severity: errorInfo?.severity || 'unknown',
            last_occurrence: errorInfo?.last_occurrence,
            pattern_type: 'frequent',
            recommendation: this.getFrequencyRecommendation(errorCode, count, frequency)
          });
        }
      }
      
      // Sort by frequency (highest first)
      frequentErrors.sort((a, b) => b.frequency - a.frequency);
      
      return frequentErrors;
    } catch (error) {
      logger.error('Failed to find frequent errors', { error: error.message });
      return [];
    }
  }
  
  /**
   * Detect error clustering (multiple errors in short time periods)
   */
  async detectErrorClusters(errors) {
    try {
      const clusters = [];
      const clusterWindow = this.options.clusterTimeWindowMinutes * 60 * 1000; // Convert to milliseconds
      
      // Sort errors by timestamp
      const sortedErrors = errors.sort((a, b) => 
        new Date(a.first_occurrence) - new Date(b.first_occurrence)
      );
      
      let currentCluster = [];
      let clusterStart = null;
      
      for (let i = 0; i < sortedErrors.length; i++) {
        const error = sortedErrors[i];
        const errorTime = new Date(error.first_occurrence);
        
        if (clusterStart === null) {
          // Start new cluster
          currentCluster = [error];
          clusterStart = errorTime;
        } else {
          const timeDiff = errorTime - clusterStart;
          
          if (timeDiff <= clusterWindow) {
            // Add to current cluster
            currentCluster.push(error);
          } else {
            // Save current cluster if it has multiple errors
            if (currentCluster.length >= 2) {
              clusters.push(this.createCluster(currentCluster, clusterStart));
            }
            
            // Start new cluster
            currentCluster = [error];
            clusterStart = errorTime;
          }
        }
      }
      
      // Handle last cluster
      if (currentCluster.length >= 2) {
        clusters.push(this.createCluster(currentCluster, clusterStart));
      }
      
      return clusters;
    } catch (error) {
      logger.error('Failed to detect error clusters', { error: error.message });
      return [];
    }
  }
  
  /**
   * Create cluster object
   */
  createCluster(errors, startTime) {
    const endTime = new Date(Math.max(...errors.map(e => new Date(e.first_occurrence))));
    const duration = endTime - startTime;
    
    const controllers = new Set(errors.map(e => e.controller_id));
    const errorTypes = new Set(errors.map(e => e.error_type));
    const severities = errors.map(e => e.severity);
    const maxSeverity = this.getMaxSeverity(severities);
    
    return {
      pattern_type: 'cluster',
      start_time: startTime,
      end_time: endTime,
      duration_ms: duration,
      error_count: errors.length,
      controllers_affected: Array.from(controllers),
      error_types: Array.from(errorTypes),
      max_severity: maxSeverity,
      errors: errors,
      recommendation: this.getClusterRecommendation(errors, controllers.size, errorTypes.size)
    };
  }
  
  /**
   * Find correlations between different error types
   */
  async findErrorCorrelations(errors) {
    try {
      const correlations = [];
      const errorPairs = new Map();
      const errorOccurrences = new Map();
      
      // Count individual error occurrences
      for (const error of errors) {
        const key = error.error_code;
        errorOccurrences.set(key, (errorOccurrences.get(key) || 0) + 1);
      }
      
      // Find error pairs that occur close in time
      const timeWindow = 30 * 60 * 1000; // 30 minutes
      
      for (let i = 0; i < errors.length; i++) {
        const error1 = errors[i];
        const time1 = new Date(error1.first_occurrence);
        
        for (let j = i + 1; j < errors.length; j++) {
          const error2 = errors[j];
          const time2 = new Date(error2.first_occurrence);
          
          if (<= timeWindow && 
) {
            ;
          }              error1.error_code !== error2.error_code) {
            
            const pairKey = [error1.error_code, error2.error_code].sort().join('_');
            errorPairs.set(pairKey, (errorPairs.get(pairKey) || 0) + 1);
          }
        }
      }
      
      // Calculate correlation coefficients
      for (const [pairKey, pairCount] of errorPairs.entries()) {
        const [error1, error2] = pairKey.split('_');
        const count1 = errorOccurrences.get(error1) || 0;
        const count2 = errorOccurrences.get(error2) || 0;
        
        // Simple correlation calculation
        const correlation = pairCount / Math.min(count1, count2);
        
        if (correlation >= this.options.correlationThreshold && pairCount >= 2) {
          correlations.push({
            pattern_type: 'correlation',
            error_code_1: error1,
            error_code_2: error2,
            correlation_strength: correlation,
            occurrence_count: pairCount,
            individual_counts: { [error1]: count1, [error2]: count2 },
            recommendation: this.getCorrelationRecommendation(error1, error2, correlation)
          });
        }
      }
      
      // Sort by correlation strength
      correlations.sort((a, b) => b.correlation_strength - a.correlation_strength);
      
      return correlations;
    } catch (error) {
      logger.error('Failed to find error correlations', { error: error.message });
      return [];
    }
  }
  
  /**
   * Analyze error trends over time
   */
  async analyzeTrends(errors) {
    try {
      const trends = [];
      const now = new Date();
      const periods = [
        { name: '1h', hours: 1 },
        { name: '6h', hours: 6 },
        { name: '24h', hours: 24 },
        { name: '7d', hours: 24 * 7 }
      ];
      
      for (const period of periods) {
        const periodStart = new Date(now.getTime() - (period.hours * 60 * 60 * 1000));
        const periodErrors = errors.filter(error => 
          new Date(error.first_occurrence) >= periodStart
        );
        
        if (continue) {
          ;
        }
        
        // Group by error type and severity
        const errorGroups = this.groupErrors(periodErrors);
        
        for (const [groupKey, groupErrors] of Object.entries(errorGroups)) {
          const [errorType, severity] = groupKey.split('_');
          
          // Calculate trend metrics
          const errorRate = groupErrors.length / period.hours; // errors per hour
          const controllers = new Set(groupErrors.map(e => e.controller_id)).size;
          
          // Determine trend direction (simplified)
          const trendDirection = this.calculateTrendDirection(groupErrors, period.hours);
          
          trends.push({
            pattern_type: 'trend',
            period: period.name,
            error_type: errorType,
            severity: severity,
            error_count: groupErrors.length,
            error_rate: errorRate,
            controllers_affected: controllers,
            trend_direction: trendDirection,
            recommendation: this.getTrendRecommendation(errorType, trendDirection, errorRate)
          });
        }
      }
      
      return trends;
    } catch (error) {
      logger.error('Failed to analyze trends', { error: error.message });
      return [];
    }
  }
  
  /**
   * Assess maintenance needs based on error patterns
   */
  async assessMaintenanceNeeds(errors) {
    try {
      const maintenanceNeeds = [];
      const controllerAnalysis = new Map();
      
      // Group errors by controller
      for (const error of errors) {
        if (!controllerAnalysis.has(error.controller_id)) {
          controllerAnalysis.set(error.controller_id, {
            controller_id: error.controller_id,
            total_errors: 0,
            critical_errors: 0,
            warning_errors: 0,
            error_types: new Set(),
            last_maintenance: null, // Would come from maintenance logs
            uptime_impact: 0
          });
        }
        
        const analysis = controllerAnalysis.get(error.controller_id);
        analysis.total_errors += error.occurrence_count || 1;
        
        if (error.severity === 'critical' || error.severity === 'fatal') {
          analysis.critical_errors += error.occurrence_count || 1;
        } else if (error.severity === 'warning') {
          analysis.warning_errors += error.occurrence_count || 1;
        }
        
        analysis.error_types.add(error.error_type);
      }
      
      // Assess maintenance needs for each controller
      for (const [controllerId, analysis] of controllerAnalysis.entries()) {
        const maintenanceScore = this.calculateMaintenanceScore(analysis);
        
        if (maintenanceScore >= 0.6) { // Threshold for maintenance recommendation
          maintenanceNeeds.push({
            pattern_type: 'maintenance',
            controller_id: controllerId,
            maintenance_score: maintenanceScore,
            priority: this.getMaintenancePriority(maintenanceScore),
            total_errors: analysis.total_errors,
            critical_errors: analysis.critical_errors,
            error_types: Array.from(analysis.error_types),
            recommended_actions: this.getMaintenanceActions(analysis),
            urgency: maintenanceScore >= 0.8 ? 'high' : maintenanceScore >= 0.7 ? 'medium' : 'low'
          });
        }
      }
      
      // Sort by maintenance score (highest first)
      maintenanceNeeds.sort((a, b) => b.maintenance_score - a.maintenance_score);
      
      return maintenanceNeeds;
    } catch (error) {
      logger.error('Failed to assess maintenance needs', { error: error.message });
      return [];
    }
  }
  
  /**
   * Calculate maintenance score (0-1)
   */
  calculateMaintenanceScore(analysis) {
    let score = 0;
    
    // Factor in total error count
    score += Math.min(analysis.total_errors / 100, 0.4); // Max 0.4 for error count
    
    // Factor in critical errors (heavily weighted)
    score += Math.min(analysis.critical_errors / 10, 0.3); // Max 0.3 for critical errors
    
    // Factor in error type diversity
    score += Math.min(analysis.error_types.size / 10, 0.2); // Max 0.2 for error diversity
    
    // Factor in time since last maintenance (if available)
    // This would require maintenance log integration
    score += 0.1; // Placeholder
    
    return Math.min(score, 1.0);
  }
  
  /**
   * Generate summary of analysis
   */
  generateSummary(analysis) {
    const summary = {
      total_patterns: analysis.frequent.length + analysis.clusters.length + analysis.correlations.length,
      high_priority_issues: 0,
      controllers_needing_maintenance: analysis.maintenance.length,
      most_frequent_error: null,
      largest_cluster: null,
      strongest_correlation: null
    };
    
    // Count high priority issues
    summary.high_priority_issues = analysis.frequent.filter(e => e.severity === 'critical' || e.severity === 'fatal').length +
                                   analysis.clusters.filter(c => c.max_severity === 'critical' || c.max_severity === 'fatal').length +
                                   analysis.maintenance.filter(m => m.urgency === 'high').length;
    
    // Find most frequent error
    if (analysis.frequent.length > 0) {
      summary.most_frequent_error = analysis.frequent[0];
    }
    
    // Find largest cluster
    if (analysis.clusters.length > 0) {
      summary.largest_cluster = analysis.clusters.reduce((max, cluster) => 
        cluster.error_count > (max?.error_count || 0) ? cluster : max
      );
    }
    
    // Find strongest correlation
    if (analysis.correlations.length > 0) {
      summary.strongest_correlation = analysis.correlations[0];
    }
    
    return summary;
  }
  
  /**
   * Helper methods for recommendations and calculations
   */
  
  getFrequencyRecommendation(errorCode, count, frequency) {
    const recommendations = {
      'E001': 'Check power supply voltage stability and surge protection',
      'E002': 'Verify power supply capacity and connections',
      'E003': 'Review load conditions and current settings',
      'E004': 'Improve cooling and check for mechanical binding',
      'E006': 'Inspect encoder cables and connections',
      'E007': 'Tune servo parameters and check mechanical system'
    };
    
    return recommendations[errorCode] || `Investigate recurring ${errorCode} errors - ${count} occurrences`;
  }
  
  getClusterRecommendation(errors, controllerCount, errorTypeCount) {
    if (controllerCount > 1) {
      return 'System-wide issue detected - check common power supply, communication, or environmental factors';
    } else if (errorTypeCount > 1) {
      return 'Multiple error types on single controller - comprehensive diagnostic needed';
    } else {
      return 'Isolated cluster of similar errors - check specific subsystem';
    }
  }
  
  getCorrelationRecommendation(error1, error2, strength) {
    return `Strong correlation detected between ${error1} and ${error2} (${(strength * 100).toFixed(1)}%) - investigate common root cause`;
  }
  
  getTrendRecommendation(errorType, direction, rate) {
    if (direction === 'increasing') {
      return `${errorType} errors are increasing (${rate.toFixed(2)}/hour) - immediate attention required`;
    } else if (direction === 'stable' && rate > 0.5) {
      return `${errorType} errors remain consistently high - systematic solution needed`;
    } else {
      return `${errorType} error trend is manageable - continue monitoring`;
    }
  }
  
  getMaintenanceActions(analysis) {
    const actions = [];
    
    if (analysis.critical_errors > 0) {
      actions.push('Perform comprehensive system diagnostic');
      actions.push('Check all critical system components');
    }
    
    if (analysis.error_types.has('OVERTEMPERATURE_MOTOR')) {
      actions.push('Clean motor cooling fans and check ventilation');
    }
    
    if (analysis.error_types.has('ENCODER_ERROR')) {
      actions.push('Inspect and clean encoder systems');
    }
    
    if (analysis.error_types.has('OVERCURRENT')) {
      actions.push('Check mechanical system for binding or excessive load');
    }
    
    if (actions.length === 0) {
      actions.push('Perform routine maintenance inspection');
    }
    
    return actions;
  }
  
  getMaintenancePriority(score) {
    if (return 'critical') {
      ;
    }
    if (return 'high') {
      ;
    }
    if (return 'medium') {
      ;
    }
    return 'low';
  }
  
  getMaxSeverity(severities) {
    const severityOrder = ['info', 'warning', 'critical', 'fatal'];
    
    return severities.reduce((max, severity) => {
      const maxIndex = severityOrder.indexOf(max);
      const currentIndex = severityOrder.indexOf(severity);
      return currentIndex > maxIndex ? severity : max;
    }, 'info');
  }
  
  groupErrors(errors) {
    const groups = {};
    
    for (const error of errors) {
      const key = `${error.error_type}_${error.severity}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(error);
    }
    
    return groups;
  }
  
  calculateTrendDirection(errors, periodHours) {
    if (return 'stable') {
      ;
    }
    
    // Simple trend calculation - compare first and second half
    const midpoint = new Date(Date.now() - (periodHours * 60 * 60 * 1000 / 2));
    
    const firstHalf = errors.filter(e => new Date(e.first_occurrence) < midpoint).length;
    const secondHalf = errors.filter(e => new Date(e.first_occurrence) >= midpoint).length;
    
    const changeRatio = secondHalf / (firstHalf || 1);
    
    if (return 'increasing') {
      ;
    }
    if (return 'decreasing') {
      ;
    }
    return 'stable';
  }
  
  /**
   * Get current patterns
   */
  getCurrentPatterns() {
    return this.patterns;
  }
  
  /**
   * Export analysis results
   */
  async exportAnalysis(format = 'json') {
    try {
      const exportData = {
        timestamp: new Date(),
        patterns: this.patterns,
        options: this.options
      };
      
      if (format === 'json') {
        return JSON.stringify(exportData, null, 2);
      } else if (format === 'csv') {
        // Convert to CSV format (simplified)
        return this.convertToCSV(exportData);
      }
      
      return exportData;
    } catch (error) {
      logger.error('Failed to export analysis', { error: error.message });
      throw error;
    }
  }
  
  convertToCSV(data) {
    // Simplified CSV conversion for frequent errors
    const rows = ['Pattern Type,Controller,Error Code,Error Type,Count,Severity,Recommendation'];
    
    for (const error of data.patterns.frequent) {
      rows.push([
        'Frequent',
        error.controller_id,
        error.error_code,
        error.error_type,
        error.occurrence_count,
        error.severity,
        `"${error.recommendation}"`
      ].join(','));
    }
    
    return rows.join('\n');
  }
}

module.exports = ErrorPatternAnalyzer;