// G-code parsing and 3D path calculation utilities
import * as THREE from 'three';

export interface GCodeLine {
  lineNumber: number;
  command: string;
  parameters: { [key: string]: number };
  comment?: string;
}

export interface PathPoint {
  position: THREE.Vector3;
  feedRate?: number;
  moveType: 'rapid' | 'linear' | 'arc';
  arcCenter?: THREE.Vector3;
  arcRadius?: number;
  clockwise?: boolean;
}

export interface PathSegment {
  start: PathPoint;
  end: PathPoint;
  points: THREE.Vector3[];
  color: string;
  lineNumber: number;
}

export interface GCodeProgram {
  segments: PathSegment[];
  bounds: {
    min: THREE.Vector3;
    max: THREE.Vector3;
  };
  totalLength: number;
  metadata?: {
    totalLines: number;
    totalTime?: number;
    boundingBox?: {
      width: number;
      height: number;
      depth: number;
    };
  };
}

export class PathCalculator {
  private currentPosition: THREE.Vector3;
  private currentFeedRate: number;
  private isAbsoluteMode: boolean;
  private currentPlane: 'XY' | 'XZ' | 'YZ';
  private coordinateOffset: THREE.Vector3;

  constructor() {
    this.currentPosition = new THREE.Vector3(0, 0, 0);
    this.currentFeedRate = 1000; // mm/min
    this.isAbsoluteMode = true;
    this.currentPlane = 'XY';
    this.coordinateOffset = new THREE.Vector3(0, 0, 0);
  }

  /**
   * Parse G-code string into 3D path
   */
  parseGCode(gcodeText: string): GCodeProgram {
    const lines = this.parseGCodeLines(gcodeText);
    const segments: PathSegment[] = [];
    let bounds = {
      min: new THREE.Vector3(Infinity, Infinity, Infinity),
      max: new THREE.Vector3(-Infinity, -Infinity, -Infinity)
    };
    let totalLength = 0;

    // Reset state
    this.currentPosition = new THREE.Vector3(0, 0, 0);
    this.currentFeedRate = 1000;
    this.isAbsoluteMode = true;
    this.currentPlane = 'XY';
    this.coordinateOffset = new THREE.Vector3(0, 0, 0);

    for (const line of lines) {
      const segment = this.processGCodeLine(line);
      if (segment) {
        segments.push(segment);
        totalLength += this.calculateSegmentLength(segment);
        this.updateBounds(segment, bounds);
      }
    }

    return {
      segments,
      bounds,
      totalLength
    };
  }

  /**
   * Parse G-code text into individual command lines
   */
  private parseGCodeLines(gcodeText: string): GCodeLine[] {
    const lines: GCodeLine[] = [];
    const textLines = gcodeText.split('\n');

    textLines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (trimmedLine === '' || trimmedLine.startsWith(';')) {
        return; // Skip empty lines and comments
      }

      const parsed = this.parseGCodeLine(trimmedLine, index + 1);
      if (parsed) {
        lines.push(parsed);
      }
    });

    return lines;
  }

  /**
   * Parse individual G-code line
   */
  private parseGCodeLine(line: string, lineNumber: number): GCodeLine | null {
    // Remove comments
    const commentIndex = line.indexOf(';');
    const comment = commentIndex >= 0 ? line.substring(commentIndex + 1).trim() : undefined;
    const commandPart = commentIndex >= 0 ? line.substring(0, commentIndex).trim() : line.trim();

    if (commandPart === '') return null;

    // Extract command and parameters
    const parts = commandPart.split(/\s+/);
    const command = parts[0].toUpperCase();
    const parameters: { [key: string]: number } = {};

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const letter = part.charAt(0).toUpperCase();
      const value = parseFloat(part.substring(1));
      if (!isNaN(value)) {
        parameters[letter] = value;
      }
    }

    return {
      lineNumber,
      command,
      parameters,
      comment
    };
  }

  /**
   * Process individual G-code command into path segment
   */
  private processGCodeLine(line: GCodeLine): PathSegment | null {
    const { command, parameters } = line;
    const startPosition = this.currentPosition.clone();

    switch (command) {
      case 'G0': // Rapid positioning
        return this.processLinearMove(line, 'rapid', startPosition);
      
      case 'G1': // Linear interpolation
        return this.processLinearMove(line, 'linear', startPosition);
      
      case 'G2': // Clockwise circular interpolation
        return this.processArcMove(line, true, startPosition);
      
      case 'G3': // Counter-clockwise circular interpolation
        return this.processArcMove(line, false, startPosition);
      
      case 'G17': // XY plane selection
        this.currentPlane = 'XY';
        break;
      
      case 'G18': // XZ plane selection
        this.currentPlane = 'XZ';
        break;
      
      case 'G19': // YZ plane selection
        this.currentPlane = 'YZ';
        break;
      
      case 'G90': // Absolute positioning
        this.isAbsoluteMode = true;
        break;
      
      case 'G91': // Relative positioning
        this.isAbsoluteMode = false;
        break;
      
      case 'G54':
      case 'G55':
      case 'G56':
      case 'G57':
      case 'G58':
      case 'G59':
        // Work coordinate system - apply offset (simplified)
        const systemNumber = parseInt(command.substring(1)) - 54;
        this.coordinateOffset = new THREE.Vector3(systemNumber * 50, systemNumber * 50, 0);
        break;
      
      default:
        // Handle other commands (feed rate, etc.)
        if (parameters.F) {
          this.currentFeedRate = parameters.F;
        }
        break;
    }

    return null;
  }

  /**
   * Process linear movement (G0, G1)
   */
  private processLinearMove(line: GCodeLine, moveType: 'rapid' | 'linear', startPosition: THREE.Vector3): PathSegment {
    const { parameters } = line;
    const endPosition = this.calculateEndPosition(parameters);
    
    if (parameters.F) {
      this.currentFeedRate = parameters.F;
    }

    const segment: PathSegment = {
      start: {
        position: startPosition.clone(),
        moveType,
        feedRate: this.currentFeedRate
      },
      end: {
        position: endPosition.clone(),
        moveType,
        feedRate: this.currentFeedRate
      },
      points: [startPosition.clone(), endPosition.clone()],
      color: moveType === 'rapid' ? '#ff6b6b' : '#4ecdc4',
      lineNumber: line.lineNumber
    };

    this.currentPosition = endPosition;
    return segment;
  }

  /**
   * Process arc movement (G2, G3)
   */
  private processArcMove(line: GCodeLine, clockwise: boolean, startPosition: THREE.Vector3): PathSegment {
    const { parameters } = line;
    const endPosition = this.calculateEndPosition(parameters);
    
    // Calculate arc center
    let arcCenter: THREE.Vector3;
    let radius: number;

    if (parameters.R !== undefined) {
      // Arc defined by radius
      radius = Math.abs(parameters.R);
      arcCenter = this.calculateArcCenterFromRadius(startPosition, endPosition, radius, clockwise);
    } else {
      // Arc defined by center offsets (I, J, K)
      const centerOffset = new THREE.Vector3(
        parameters.I || 0,
        parameters.J || 0,
        parameters.K || 0
      );
      arcCenter = startPosition.clone().add(centerOffset);
      radius = startPosition.distanceTo(arcCenter);
    }

    // Generate arc points
    const arcPoints = this.generateArcPoints(startPosition, endPosition, arcCenter, clockwise, 20);

    const segment: PathSegment = {
      start: {
        position: startPosition.clone(),
        moveType: 'arc',
        feedRate: this.currentFeedRate,
        arcCenter,
        arcRadius: radius,
        clockwise
      },
      end: {
        position: endPosition.clone(),
        moveType: 'arc',
        feedRate: this.currentFeedRate
      },
      points: arcPoints,
      color: '#95a5a6',
      lineNumber: line.lineNumber
    };

    this.currentPosition = endPosition;
    return segment;
  }

  /**
   * Calculate end position based on parameters and positioning mode
   */
  private calculateEndPosition(parameters: { [key: string]: number }): THREE.Vector3 {
    const newPosition = this.currentPosition.clone();

    if (this.isAbsoluteMode) {
      if (parameters.X !== undefined) newPosition.x = parameters.X + this.coordinateOffset.x;
      if (parameters.Y !== undefined) newPosition.y = parameters.Y + this.coordinateOffset.y;
      if (parameters.Z !== undefined) newPosition.z = parameters.Z + this.coordinateOffset.z;
    } else {
      if (parameters.X !== undefined) newPosition.x += parameters.X;
      if (parameters.Y !== undefined) newPosition.y += parameters.Y;
      if (parameters.Z !== undefined) newPosition.z += parameters.Z;
    }

    return newPosition;
  }

  /**
   * Calculate arc center from radius (simplified implementation)
   */
  private calculateArcCenterFromRadius(start: THREE.Vector3, end: THREE.Vector3, radius: number, clockwise: boolean): THREE.Vector3 {
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    const chordLength = start.distanceTo(end);
    const sagitta = Math.sqrt(radius * radius - (chordLength / 2) * (chordLength / 2));
    
    // Calculate perpendicular direction
    const direction = end.clone().sub(start).normalize();
    const perpendicular = new THREE.Vector3(-direction.y, direction.x, direction.z);
    
    if (!clockwise) {
      perpendicular.multiplyScalar(-1);
    }
    
    return midpoint.add(perpendicular.multiplyScalar(sagitta));
  }

  /**
   * Generate points along an arc
   */
  private generateArcPoints(start: THREE.Vector3, end: THREE.Vector3, center: THREE.Vector3, clockwise: boolean, segments: number): THREE.Vector3[] {
    const points: THREE.Vector3[] = [start.clone()];
    
    // Calculate start and end angles
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
    const radius = start.distanceTo(center);
    
    let totalAngle = endAngle - startAngle;
    if (clockwise && totalAngle > 0) totalAngle -= 2 * Math.PI;
    if (!clockwise && totalAngle < 0) totalAngle += 2 * Math.PI;
    
    for (let i = 1; i < segments; i++) {
      const ratio = i / segments;
      const angle = startAngle + totalAngle * ratio;
      const point = new THREE.Vector3(
        center.x + radius * Math.cos(angle),
        center.y + radius * Math.sin(angle),
        start.z + (end.z - start.z) * ratio // Linear interpolation for Z
      );
      points.push(point);
    }
    
    points.push(end.clone());
    return points;
  }

  /**
   * Calculate segment length
   */
  private calculateSegmentLength(segment: PathSegment): number {
    let length = 0;
    for (let i = 1; i < segment.points.length; i++) {
      length += segment.points[i - 1].distanceTo(segment.points[i]);
    }
    return length;
  }

  /**
   * Update bounds with segment points
   */
  private updateBounds(segment: PathSegment, bounds: { min: THREE.Vector3; max: THREE.Vector3 }): void {
    segment.points.forEach(point => {
      bounds.min.x = Math.min(bounds.min.x, point.x);
      bounds.min.y = Math.min(bounds.min.y, point.y);
      bounds.min.z = Math.min(bounds.min.z, point.z);
      bounds.max.x = Math.max(bounds.max.x, point.x);
      bounds.max.y = Math.max(bounds.max.y, point.y);
      bounds.max.z = Math.max(bounds.max.z, point.z);
    });
  }
}