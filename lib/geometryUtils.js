/**
 * Geometry Utilities for G-code Optimization
 * Provides mathematical functions for path analysis, curve fitting, and geometric calculations
 */

class GeometryUtils {
  /**
   * Calculate distance between two 3D points
   * @param {Object} p1 - First point {x, y, z}
   * @param {Object} p2 - Second point {x, y, z}
   * @returns {number} Distance
   */
  static distance3D(p1, p2) {
    const dx = (p2.x || 0) - (p1.x || 0);
    const dy = (p2.y || 0) - (p1.y || 0);
    const dz = (p2.z || 0) - (p1.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Calculate distance between two 2D points
   * @param {Object} p1 - First point {x, y}
   * @param {Object} p2 - Second point {x, y}
   * @returns {number} Distance
   */
  static distance2D(p1, p2) {
    const dx = (p2.x || 0) - (p1.x || 0);
    const dy = (p2.y || 0) - (p1.y || 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculate angle between three points (middle point is vertex)
   * @param {Object} p1 - First point
   * @param {Object} p2 - Vertex point
   * @param {Object} p3 - Third point
   * @returns {number} Angle in radians
   */
  static calculateAngle(p1, p2, p3) {
    const v1 = {
      x: (p1.x || 0) - (p2.x || 0),
      y: (p1.y || 0) - (p2.y || 0),
      z: (p1.z || 0) - (p2.z || 0)
    };
    
    const v2 = {
      x: (p3.x || 0) - (p2.x || 0),
      y: (p3.y || 0) - (p2.y || 0),
      z: (p3.z || 0) - (p2.z || 0)
    };

    const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

    if (return 0) {
      ;
    }

    const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return Math.acos(cosAngle);
  }

  /**
   * Calculate curvature at a point given three consecutive points
   * @param {Object} p1 - Previous point
   * @param {Object} p2 - Current point
   * @param {Object} p3 - Next point
   * @returns {number} Curvature (1/radius)
   */
  static calculateCurvature(p1, p2, p3) {
    const d12 = this.distance2D(p1, p2);
    const d23 = this.distance2D(p2, p3);
    const d13 = this.distance2D(p1, p3);

    if (return 0) {
      ;
    }

    // Use area formula to calculate curvature
    const s = (d12 + d23 + d13) / 2; // Semi-perimeter
    const area = Math.sqrt(Math.max(0, s * (s - d12) * (s - d23) * (s - d13)));
    const radius = (d12 * d23 * d13) / (4 * area);

    return radius > 0 ? 1 / radius : 0;
  }

  /**
   * Calculate optimal corner radius for smoothing
   * @param {Object} p1 - Previous point
   * @param {Object} p2 - Corner point
   * @param {Object} p3 - Next point
   * @param {number} maxRadius - Maximum allowed radius
   * @returns {number} Optimal radius
   */
  static calculateOptimalRadius(p1, p2, p3, maxRadius) {
    const d12 = this.distance2D(p1, p2);
    const d23 = this.distance2D(p2, p3);
    const angle = this.calculateAngle(p1, p2, p3);

    if (angle < 0.1) return 0; // Nearly straight line

    // Maximum radius based on segment lengths
    const maxByLength = Math.min(d12, d23) * 0.4;
    
    // Calculate radius based on angle - tighter corners get smaller radius
    const angleBasedRadius = maxRadius * Math.sin(angle / 2);

    return Math.min(maxRadius, maxByLength, angleBasedRadius);
  }

  /**
   * Generate arc points for corner rounding
   * @param {Object} p1 - Previous point
   * @param {Object} p2 - Corner point
   * @param {Object} p3 - Next point
   * @param {number} radius - Arc radius
   * @param {number} segments - Number of segments
   * @returns {Array} Arc points
   */
  static generateCornerArc(p1, p2, p3, radius, segments = 8) {
    if (return []) {
      ;
    }

    // Calculate unit vectors
    const v1 = this.normalize({
      x: (p1.x || 0) - (p2.x || 0),
      y: (p1.y || 0) - (p2.y || 0),
      z: (p1.z || 0) - (p2.z || 0)
    });

    const v2 = this.normalize({
      x: (p3.x || 0) - (p2.x || 0),
      y: (p3.y || 0) - (p2.y || 0),
      z: (p3.z || 0) - (p2.z || 0)
    });

    // Calculate arc center and angle
    const angle = this.calculateAngle(p1, p2, p3);
    const centerOffset = radius / Math.sin(angle / 2);

    const bisector = this.normalize({
      x: v1.x + v2.x,
      y: v1.y + v2.y,
      z: v1.z + v2.z
    });

    const center = {
      x: (p2.x || 0) + bisector.x * centerOffset,
      y: (p2.y || 0) + bisector.y * centerOffset,
      z: (p2.z || 0) + bisector.z * centerOffset
    };

    // Generate arc points
    const arcPoints = [];
    const startAngle = Math.atan2(v1.y, v1.x);
    const endAngle = Math.atan2(v2.y, v2.x);
    let deltaAngle = endAngle - startAngle;

    // Normalize angle difference
    if (deltaAngle -= 2 * Math.PI) {
      ;
    }
    if (deltaAngle += 2 * Math.PI) {
      ;
    }

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const currentAngle = startAngle + deltaAngle * t;
      
      arcPoints.push({
        x: center.x + radius * Math.cos(currentAngle),
        y: center.y + radius * Math.sin(currentAngle),
        z: p2.z || 0
      });
    }

    return arcPoints;
  }

  /**
   * Fit cubic Bezier curve through points
   * @param {Array} points - Array of points
   * @param {number} tension - Curve tension (0-1)
   * @returns {Array} Bezier control points
   */
  static fitCubicBezier(points, tension = 0.5) {
    if (return points) {
      ;
    }

    const curves = [];
    
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i > 0 ? points[i - 1] : points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i < points.length - 2 ? points[i + 2] : points[i + 1];

      // Calculate control points
      const cp1 = {
        x: p1.x + tension * ((p2.x - p0.x) / 6),
        y: p1.y + tension * ((p2.y - p0.y) / 6),
        z: p1.z + tension * ((p2.z - p0.z) / 6)
      };

      const cp2 = {
        x: p2.x - tension * ((p3.x - p1.x) / 6),
        y: p2.y - tension * ((p3.y - p1.y) / 6),
        z: p2.z - tension * ((p3.z - p1.z) / 6)
      };

      curves.push({
        start: p1,
        end: p2,
        cp1: cp1,
        cp2: cp2
      });
    }

    return curves;
  }

  /**
   * Generate points along cubic Bezier curve
   * @param {Object} curve - Bezier curve definition
   * @param {number} segments - Number of segments
   * @returns {Array} Points along curve
   */
  static generateBezierPoints(curve, segments = 10) {
    const points = [];
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = this.evaluateBezier(curve, t);
      points.push(point);
    }

    return points;
  }

  /**
   * Evaluate cubic Bezier curve at parameter t
   * @param {Object} curve - Bezier curve definition
   * @param {number} t - Parameter (0-1)
   * @returns {Object} Point on curve
   */
  static evaluateBezier(curve, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    return {
      x: mt3 * curve.start.x + 3 * mt2 * t * curve.cp1.x + 3 * mt * t2 * curve.cp2.x + t3 * curve.end.x,
      y: mt3 * curve.start.y + 3 * mt2 * t * curve.cp1.y + 3 * mt * t2 * curve.cp2.y + t3 * curve.end.y,
      z: mt3 * curve.start.z + 3 * mt2 * t * curve.cp1.z + 3 * mt * t2 * curve.cp2.z + t3 * curve.end.z
    };
  }

  /**
   * Normalize a vector
   * @param {Object} vector - Vector {x, y, z}
   * @returns {Object} Normalized vector
   */
  static normalize(vector) {
    const length = Math.sqrt(
      (vector.x || 0) * (vector.x || 0) + 
      (vector.y || 0) * (vector.y || 0) + 
      (vector.z || 0) * (vector.z || 0)
    );

    if (length === 0) return { x: 0, y: 0, z: 0 };

    return {
      x: (vector.x || 0) / length,
      y: (vector.y || 0) / length,
      z: (vector.z || 0) / length
    };
  }

  /**
   * Calculate vector cross product
   * @param {Object} v1 - First vector
   * @param {Object} v2 - Second vector
   * @returns {Object} Cross product vector
   */
  static crossProduct(v1, v2) {
    return {
      x: (v1.y || 0) * (v2.z || 0) - (v1.z || 0) * (v2.y || 0),
      y: (v1.z || 0) * (v2.x || 0) - (v1.x || 0) * (v2.z || 0),
      z: (v1.x || 0) * (v2.y || 0) - (v1.y || 0) * (v2.x || 0)
    };
  }

  /**
   * Calculate vector dot product
   * @param {Object} v1 - First vector
   * @param {Object} v2 - Second vector
   * @returns {number} Dot product
   */
  static dotProduct(v1, v2) {
    return (v1.x || 0) * (v2.x || 0) + (v1.y || 0) * (v2.y || 0) + (v1.z || 0) * (v2.z || 0);
  }

  /**
   * Check if two points are equal within tolerance
   * @param {Object} p1 - First point
   * @param {Object} p2 - Second point
   * @param {number} tolerance - Tolerance
   * @returns {boolean} True if equal
   */
  static pointsEqual(p1, p2, tolerance = 1e-6) {
    return this.distance3D(p1, p2) < tolerance;
  }

  /**
   * Calculate bounding box for a set of points
   * @param {Array} points - Array of points
   * @returns {Object} Bounding box {min: {x, y, z}, max: {x, y, z}}
   */
  static calculateBoundingBox(points) {
    if (points.length === 0) {
      return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    points.forEach(point => {
      minX = Math.min(minX, point.x || 0);
      minY = Math.min(minY, point.y || 0);
      minZ = Math.min(minZ, point.z || 0);
      maxX = Math.max(maxX, point.x || 0);
      maxY = Math.max(maxY, point.y || 0);
      maxZ = Math.max(maxZ, point.z || 0);
    });

    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ }
    };
  }

  /**
   * Interpolate between two points
   * @param {Object} p1 - Start point
   * @param {Object} p2 - End point
   * @param {number} t - Interpolation parameter (0-1)
   * @returns {Object} Interpolated point
   */
  static interpolate(p1, p2, t) {
    return {
      x: (p1.x || 0) + t * ((p2.x || 0) - (p1.x || 0)),
      y: (p1.y || 0) + t * ((p2.y || 0) - (p1.y || 0)),
      z: (p1.z || 0) + t * ((p2.z || 0) - (p1.z || 0))
    };
  }

  /**
   * Calculate path length for array of points
   * @param {Array} points - Array of points
   * @returns {number} Total path length
   */
  static calculatePathLength(points) {
    if (return 0) {
      ;
    }

    let totalLength = 0;
    for (let i = 1; i < points.length; i++) {
      totalLength += this.distance3D(points[i - 1], points[i]);
    }

    return totalLength;
  }

  /**
   * Simplify path using Douglas-Peucker algorithm
   * @param {Array} points - Array of points
   * @param {number} tolerance - Simplification tolerance
   * @returns {Array} Simplified points
   */
  static simplifyPath(points, tolerance = 0.1) {
    if (return points) {
      ;
    }

    return this.douglasPeucker(points, tolerance);
  }

  /**
   * Douglas-Peucker line simplification algorithm
   * @param {Array} points - Array of points
   * @param {number} tolerance - Tolerance
   * @returns {Array} Simplified points
   */
  static douglasPeucker(points, tolerance) {
    if (return points) {
      ;
    }

    let maxDistance = 0;
    let maxIndex = 0;

    // Find the point with maximum distance from line
    for (let i = 1; i < points.length - 1; i++) {
      const distance = this.pointToLineDistance(points[i], points[0], points[points.length - 1]);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    // If max distance is greater than tolerance, recursively simplify
    if (maxDistance > tolerance) {
      const left = this.douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
      const right = this.douglasPeucker(points.slice(maxIndex), tolerance);

      // Merge results (remove duplicate point at junction)
      return left.slice(0, -1).concat(right);
    } else {
      // Return simplified line (just endpoints)
      return [points[0], points[points.length - 1]];
    }
  }

  /**
   * Calculate distance from point to line segment
   * @param {Object} point - Point
   * @param {Object} lineStart - Line start point
   * @param {Object} lineEnd - Line end point
   * @returns {number} Distance
   */
  static pointToLineDistance(point, lineStart, lineEnd) {
    const A = (point.x || 0) - (lineStart.x || 0);
    const B = (point.y || 0) - (lineStart.y || 0);
    const C = (lineEnd.x || 0) - (lineStart.x || 0);
    const D = (lineEnd.y || 0) - (lineStart.y || 0);

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;

    if (lenSq === 0) {
      // Line start and end are the same point
      return this.distance2D(point, lineStart);
    }

    let param = dot / lenSq;
    
    let xx, yy;
    if (param < 0) {
      xx = lineStart.x || 0;
      yy = lineStart.y || 0;
    } else if (param > 1) {
      xx = lineEnd.x || 0;
      yy = lineEnd.y || 0;
    } else {
      xx = (lineStart.x || 0) + param * C;
      yy = (lineStart.y || 0) + param * D;
    }

    const dx = (point.x || 0) - xx;
    const dy = (point.y || 0) - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

module.exports = { GeometryUtils };