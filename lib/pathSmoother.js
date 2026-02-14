const { GeometryUtils } = require('./geometryUtils');
const { logger } = require('./logger');

/**
 * Path Smoothing Module for G-code Optimization
 * Implements various path smoothing algorithms including corner rounding,
 * spline interpolation, and jerk reduction
 */
class PathSmoother {
  constructor(options = {}) {
    this.options = {
      cornerRadius: 0.5,           // Default corner radius in mm
      splineOrder: 3,              // Cubic splines by default
      jerkLimit: 1000,             // mm/min³
      minSegmentLength: 0.01,      // Minimum segment length in mm
      maxCornerAngle: Math.PI * 0.9, // Maximum angle for corner rounding
      adaptiveRadius: true,        // Use adaptive radius based on geometry
      bezierTension: 0.5,          // Tension for Bezier curves (0-1)
      arcSegments: 8,              // Number of segments for arc approximation
      ...options
    };
  }

  /**
   * Main path smoothing function
   * @param {Array} segments - Array of path segments
   * @param {Object} tolerance - Smoothing tolerance settings
   * @returns {Object} Smoothed path result
   */
  smoothPath(segments, tolerance = {}) {
    const settings = { ...this.options, ...tolerance };
    
    logger.info('Starting path smoothing', {
      originalSegments: segments.length,
      settings: settings
    });

    try {
      let smoothedSegments = [...segments];

      // Step 1: Remove redundant points
      smoothedSegments = this.removeRedundantPoints(smoothedSegments, settings);

      // Step 2: Apply corner rounding
      if (settings.cornerRadius > 0) {
        smoothedSegments = this.roundCorners(smoothedSegments, settings);
      }

      // Step 3: Apply spline fitting for smooth curves
      if (settings.splineOrder > 0) {
        smoothedSegments = this.applySplineFitting(smoothedSegments, settings);
      }

      // Step 4: Apply jerk reduction
      if (settings.jerkLimit > 0) {
        smoothedSegments = this.reduceJerk(smoothedSegments, settings);
      }

      // Step 5: Validate and optimize final path
      smoothedSegments = this.validateAndOptimize(smoothedSegments, settings);

      const result = {
        success: true,
        originalSegments: segments.length,
        smoothedSegments: smoothedSegments.length,
        segments: smoothedSegments,
        statistics: this.calculateSmoothingStatistics(segments, smoothedSegments),
        settings: settings
      };

      logger.info('Path smoothing completed', {
        originalSegments: result.originalSegments,
        smoothedSegments: result.smoothedSegments,
        improvement: result.statistics.smoothnessImprovement
      });

      return result;

    } catch (error) {
      logger.error('Path smoothing failed', { error: error.message });
      return {
        success: false,
        error: error.message,
        originalSegments: segments.length,
        segments: segments
      };
    }
  }

  /**
   * Remove redundant points that are too close together
   * @param {Array} segments - Path segments
   * @param {Object} settings - Smoothing settings
   * @returns {Array} Filtered segments
   */
  removeRedundantPoints(segments, settings) {
    if (return segments) {
      ;
    }

    const filtered = [segments[0]];
    
    for (let i = 1; i < segments.length; i++) {
      const prev = filtered[filtered.length - 1];
      const current = segments[i];
      
      const distance = GeometryUtils.distance3D(prev.end || prev, current.start || current);
      
      if (distance > settings.minSegmentLength) {
        filtered.push(current);
      }
    }

    return filtered;
  }

  /**
   * Apply corner rounding to sharp direction changes
   * @param {Array} segments - Path segments
   * @param {Object} settings - Smoothing settings
   * @returns {Array} Segments with rounded corners
   */
  roundCorners(segments, settings) {
    if (return segments) {
      ;
    }

    const rounded = [];
    
    for (let i = 0; i < segments.length; i++) {
      const current = segments[i];
      
      if (i > 0 && i < segments.length - 1) {
        const prev = segments[i - 1];
        const next = segments[i + 1];
        
        // Get corner points
        const p1 = prev.end || prev;
        const p2 = current.end || current;
        const p3 = next.end || next;
        
        // Calculate corner angle
        const angle = GeometryUtils.calculateAngle(p1, p2, p3);
        
        // Check if corner needs rounding
        if (angle < settings.maxCornerAngle && angle > 0.1) {
          const radius = settings.adaptiveRadius ? 
            GeometryUtils.calculateOptimalRadius(p1, p2, p3, settings.cornerRadius) :
            settings.cornerRadius;
          
          if (radius > 0) {
            const arcPoints = GeometryUtils.generateCornerArc(p1, p2, p3, radius, settings.arcSegments);
            
            if (arcPoints.length > 2) {
              // Replace sharp corner with arc segments
              const arcSegments = this.createArcSegments(arcPoints, current);
              rounded.push(...arcSegments);
              continue;
            }
          }
        }
      }
      
      rounded.push(current);
    }

    return rounded;
  }

  /**
   * Create arc segments from points
   * @param {Array} arcPoints - Points along arc
   * @param {Object} originalSegment - Original segment for reference
   * @returns {Array} Arc segments
   */
  createArcSegments(arcPoints, originalSegment) {
    const segments = [];
    
    for (let i = 1; i < arcPoints.length; i++) {
      segments.push({
        type: 'linear',
        start: arcPoints[i - 1],
        end: arcPoints[i],
        feedRate: originalSegment.feedRate || 100,
        smooth: true,
        radius: originalSegment.radius
      });
    }

    return segments;
  }

  /**
   * Apply spline fitting for smooth curves
   * @param {Array} segments - Path segments
   * @param {Object} settings - Smoothing settings
   * @returns {Array} Segments with spline interpolation
   */
  applySplineFitting(segments, settings) {
    if (return segments) {
      ;
    }

    const splineSegments = [];
    const points = this.extractPoints(segments);
    
    // Group consecutive linear segments for spline fitting
    const groups = this.groupLinearSegments(segments);
    
    for (const group of groups) {
      if (group.length < 4) {
        // Too few points for spline, keep original
        splineSegments.push(...group);
        continue;
      }

      const groupPoints = group.map(seg => seg.end || seg);
      
      // Fit cubic Bezier curves through points
      const bezierCurves = GeometryUtils.fitCubicBezier(groupPoints, settings.bezierTension);
      
      // Convert Bezier curves to linear segments
      for (const curve of bezierCurves) {
        const curvePoints = GeometryUtils.generateBezierPoints(curve, 10);
        const curveSegments = this.createLinearSegments(curvePoints, group[0]);
        splineSegments.push(...curveSegments);
      }
    }

    return splineSegments;
  }

  /**
   * Extract points from segments
   * @param {Array} segments - Path segments
   * @returns {Array} Points
   */
  extractPoints(segments) {
    const points = [];
    
    segments.forEach(segment => {
      if (points.push(segment.start)) {
        ;
      }
      if (points.push(segment.end)) {
        ;
      }
    });

    return points;
  }

  /**
   * Group consecutive linear segments for spline fitting
   * @param {Array} segments - Path segments
   * @returns {Array} Groups of linear segments
   */
  groupLinearSegments(segments) {
    const groups = [];
    let currentGroup = [];

    for (const segment of segments) {
      if (segment.type === 'linear' || segment.type === 'rapid') {
        currentGroup.push(segment);
      } else {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
          currentGroup = [];
        }
        groups.push([segment]); // Non-linear segment as single group
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Create linear segments from points
   * @param {Array} points - Points along path
   * @param {Object} reference - Reference segment for properties
   * @returns {Array} Linear segments
   */
  createLinearSegments(points, reference) {
    const segments = [];
    
    for (let i = 1; i < points.length; i++) {
      segments.push({
        type: 'linear',
        start: points[i - 1],
        end: points[i],
        feedRate: reference.feedRate || 100,
        smooth: true
      });
    }

    return segments;
  }

  /**
   * Apply jerk reduction through velocity profile smoothing
   * @param {Array} segments - Path segments
   * @param {Object} settings - Smoothing settings
   * @returns {Array} Segments with reduced jerk
   */
  reduceJerk(segments, settings) {
    // Calculate velocity profile
    const velocityProfile = this.calculateVelocityProfile(segments, settings);
    
    // Smooth velocity transitions
    const smoothedProfile = this.smoothVelocityProfile(velocityProfile, settings);
    
    // Apply smoothed velocities to segments
    return this.applyVelocityProfile(segments, smoothedProfile);
  }

  /**
   * Calculate velocity profile for path
   * @param {Array} segments - Path segments
   * @param {Object} settings - Settings
   * @returns {Array} Velocity profile
   */
  calculateVelocityProfile(segments, settings) {
    const profile = [];
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const distance = GeometryUtils.distance3D(segment.start || {x:0,y:0,z:0}, segment.end || segment);
      
      let maxVelocity = segment.feedRate || 100;
      
      // Reduce velocity for sharp corners
      if (i > 0 && i < segments.length - 1) {
        const prev = segments[i - 1];
        const next = segments[i + 1];
        
        const p1 = prev.end || prev;
        const p2 = segment.end || segment;
        const p3 = next.end || next;
        
        const angle = GeometryUtils.calculateAngle(p1, p2, p3);
        const curvature = GeometryUtils.calculateCurvature(p1, p2, p3);
        
        if (curvature > 0) {
          const cornerVelocity = Math.sqrt(settings.jerkLimit / curvature);
          maxVelocity = Math.min(maxVelocity, cornerVelocity);
        }
      }
      
      profile.push({
        segmentIndex: i,
        distance: distance,
        maxVelocity: maxVelocity,
        velocity: maxVelocity
      });
    }
    
    return profile;
  }

  /**
   * Smooth velocity profile to reduce jerk
   * @param {Array} profile - Velocity profile
   * @param {Object} settings - Settings
   * @returns {Array} Smoothed profile
   */
  smoothVelocityProfile(profile, settings) {
    const smoothed = [...profile];
    const smoothingFactor = 0.3; // Smoothing weight
    
    // Apply multiple passes of smoothing
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < smoothed.length - 1; i++) {
        const prev = smoothed[i - 1].velocity;
        const current = smoothed[i].velocity;
        const next = smoothed[i + 1].velocity;
        
        // Apply smoothing while respecting maximum velocity
        const smoothedVelocity = current * (1 - smoothingFactor) + 
          (prev + next) * smoothingFactor / 2;
        
        smoothed[i].velocity = Math.min(smoothedVelocity, smoothed[i].maxVelocity);
      }
    }
    
    return smoothed;
  }

  /**
   * Apply velocity profile to segments
   * @param {Array} segments - Path segments
   * @param {Array} profile - Velocity profile
   * @returns {Array} Segments with updated velocities
   */
  applyVelocityProfile(segments, profile) {
    const updated = [];
    
    for (let i = 0; i < segments.length; i++) {
      const segment = { ...segments[i] };
      
      if (profile[i]) {
        segment.feedRate = Math.round(profile[i].velocity);
        segment.optimizedVelocity = true;
      }
      
      updated.push(segment);
    }
    
    return updated;
  }

  /**
   * Validate and optimize final path
   * @param {Array} segments - Path segments
   * @param {Object} settings - Settings
   * @returns {Array} Validated segments
   */
  validateAndOptimize(segments, settings) {
    const optimized = [];
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      
      // Validate segment
      if (this.validateSegment(segment, settings)) {
        optimized.push(segment);
      } else {
        logger.warn(`Invalid segment at index ${i}, skipping`);
      }
    }
    
    return optimized;
  }

  /**
   * Validate a path segment
   * @param {Object} segment - Path segment
   * @param {Object} settings - Settings
   * @returns {boolean} True if valid
   */
  validateSegment(segment, settings) {
    // Check for required properties
    if (return false) {
      ;
    }
    
    // Check segment length
    if (segment.start && segment.end) {
      const length = GeometryUtils.distance3D(segment.start, segment.end);
      if (length < settings.minSegmentLength / 10) return false; // Allow very small segments from smoothing
    }
    
    // Check feed rate
    if () return false) {
      ;
    }
    
    return true;
  }

  /**
   * Calculate smoothing statistics
   * @param {Array} originalSegments - Original segments
   * @param {Array} smoothedSegments - Smoothed segments
   * @returns {Object} Statistics
   */
  calculateSmoothingStatistics(originalSegments, smoothedSegments) {
    const originalLength = GeometryUtils.calculatePathLength(
      originalSegments.map(s => s.end || s)
    );
    
    const smoothedLength = GeometryUtils.calculatePathLength(
      smoothedSegments.map(s => s.end || s)
    );
    
    // Calculate smoothness metrics
    const originalSmoothness = this.calculateSmoothness(originalSegments);
    const smoothedSmoothness = this.calculateSmoothness(smoothedSegments);
    
    return {
      originalSegmentCount: originalSegments.length,
      smoothedSegmentCount: smoothedSegments.length,
      originalPathLength: originalLength,
      smoothedPathLength: smoothedLength,
      lengthChange: smoothedLength - originalLength,
      lengthChangePercent: originalLength > 0 ? ((smoothedLength - originalLength) / originalLength) * 100 : 0,
      originalSmoothness: originalSmoothness,
      smoothedSmoothness: smoothedSmoothness,
      smoothnessImprovement: smoothedSmoothness - originalSmoothness,
      segmentCountChange: smoothedSegments.length - originalSegments.length
    };
  }

  /**
   * Calculate path smoothness metric
   * @param {Array} segments - Path segments
   * @returns {number} Smoothness score (higher is smoother)
   */
  calculateSmoothness(segments) {
    if (return 1.0) {
      ;
    }
    
    let totalCurvature = 0;
    let validPoints = 0;
    
    for (let i = 1; i < segments.length - 1; i++) {
      const p1 = segments[i - 1].end || segments[i - 1];
      const p2 = segments[i].end || segments[i];
      const p3 = segments[i + 1].end || segments[i + 1];
      
      const curvature = GeometryUtils.calculateCurvature(p1, p2, p3);
      if (curvature > 0) {
        totalCurvature += curvature;
        validPoints++;
      }
    }
    
    const averageCurvature = validPoints > 0 ? totalCurvature / validPoints : 0;
    
    // Convert to smoothness score (inverse of curvature)
    return averageCurvature > 0 ? 1 / (1 + averageCurvature) : 1.0;
  }

  /**
   * Generate preview data for smoothed path
   * @param {Array} originalSegments - Original segments
   * @param {Array} smoothedSegments - Smoothed segments
   * @returns {Object} Preview data
   */
  generatePreview(originalSegments, smoothedSegments) {
    const originalPoints = originalSegments.map(s => s.end || s);
    const smoothedPoints = smoothedSegments.map(s => s.end || s);
    
    return {
      original: {
        points: originalPoints,
        boundingBox: GeometryUtils.calculateBoundingBox(originalPoints),
        pathLength: GeometryUtils.calculatePathLength(originalPoints)
      },
      smoothed: {
        points: smoothedPoints,
        boundingBox: GeometryUtils.calculateBoundingBox(smoothedPoints),
        pathLength: GeometryUtils.calculatePathLength(smoothedPoints)
      }
    };
  }
}

module.exports = { PathSmoother };