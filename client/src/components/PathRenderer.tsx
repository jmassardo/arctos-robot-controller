// 3D Path Renderer component for G-code visualization
import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { PathCalculator, GCodeProgram, PathSegment } from '../utils/pathCalculation';
import { GeometryUtils } from '../utils/geometryUtils';

interface PathRendererProps {
  scene?: THREE.Scene;
  gcodeText?: string;
  visible?: boolean;
  showProgress?: boolean;
  currentProgress?: number; // 0-100
  animationSpeed?: number; // multiplier for animation speed
  onPathCalculated?: (program: GCodeProgram) => void;
}

const PathRenderer: React.FC<PathRendererProps> = ({
  scene,
  gcodeText,
  visible = true,
  showProgress = false,
  currentProgress = 0,
  animationSpeed = 1,
  onPathCalculated
}) => {
  const pathGroupRef = useRef<THREE.Group | null>(null);
  const progressIndicatorRef = useRef<THREE.Mesh | null>(null);
  const pathCalculatorRef = useRef<PathCalculator>(new PathCalculator());
  const currentProgramRef = useRef<GCodeProgram | null>(null);

  // Initialize path rendering
  useEffect(() => {
    if (!scene) return;

    // Create path group
    const pathGroup = new THREE.Group();
    pathGroup.name = 'GCodePath';
    pathGroupRef.current = pathGroup;
    scene.add(pathGroup);

    // Create progress indicator
    if (showProgress) {
      const progressIndicator = GeometryUtils.createProgressIndicator(8);
      progressIndicator.name = 'ProgressIndicator';
      progressIndicator.visible = false;
      progressIndicatorRef.current = progressIndicator;
      scene.add(progressIndicator);
    }

    return () => {
      // Cleanup
      if (pathGroupRef.current) {
        scene.remove(pathGroupRef.current);
        disposePathGroup(pathGroupRef.current);
      }
      if (progressIndicatorRef.current) {
        scene.remove(progressIndicatorRef.current);
        disposeProgressIndicator(progressIndicatorRef.current);
      }
    };
  }, [scene, showProgress]);

  // Update path when G-code changes
  useEffect(() => {
    if (gcodeText && pathGroupRef.current) {
      updatePath(gcodeText);
    } else if (pathGroupRef.current) {
      clearPath();
    }
  }, [gcodeText]);

  // Update visibility
  useEffect(() => {
    if (pathGroupRef.current) {
      pathGroupRef.current.visible = visible;
    }
    if (progressIndicatorRef.current) {
      progressIndicatorRef.current.visible = visible && showProgress;
    }
  }, [visible, showProgress]);

  // Update progress indicator
  useEffect(() => {
    updateProgressIndicator();
  }, [currentProgress, showProgress]);

  const updatePath = useCallback((gcode: string) => {
    if (!pathGroupRef.current) return;

    try {
      // Clear existing path
      clearPath();

      // Parse G-code into path
      const program = pathCalculatorRef.current.parseGCode(gcode);
      currentProgramRef.current = program;

      // Create path visualization
      createPathVisualization(program);

      // Notify parent component
      if (onPathCalculated) {
        onPathCalculated(program);
      }

    } catch (error) {
      console.error('Error updating path:', error);
    }
  }, [onPathCalculated]);

  const createPathVisualization = (program: GCodeProgram) => {
    if (!pathGroupRef.current) return;

    const pathGroup = pathGroupRef.current;

    // Create path segments
    program.segments.forEach((segment, segmentIndex) => {
      const pathMesh = createSegmentMesh(segment, segmentIndex);
      if (pathMesh) {
        pathGroup.add(pathMesh);
      }
    });

    // Add start and end markers
    if (program.segments.length > 0) {
      addPathMarkers(program);
    }

    console.log(`Rendered ${program.segments.length} path segments`);
  };

  const createSegmentMesh = (segment: PathSegment, segmentIndex: number): THREE.Object3D | null => {
    if (segment.points.length < 2) return null;

    const segmentGroup = new THREE.Group();
    segmentGroup.name = `Segment_${segmentIndex}`;

    // Create path line
    const pathGeometry = GeometryUtils.createToolPath(segment.points, segment.color);
    const pathMaterial = new THREE.LineBasicMaterial({ 
      color: segment.color,
      linewidth: 2,
      transparent: true,
      opacity: 0.8
    });
    
    const pathLine = new THREE.Line(pathGeometry, pathMaterial);
    pathLine.name = `Path_${segmentIndex}`;
    segmentGroup.add(pathLine);

    // Add direction indicators for arc moves
    if (segment.start.moveType === 'arc') {
      const directionIndicator = createDirectionIndicator(segment);
      if (directionIndicator) {
        segmentGroup.add(directionIndicator);
      }
    }

    // Add segment info to userData for later reference
    segmentGroup.userData = {
      segmentIndex,
      lineNumber: segment.lineNumber,
      moveType: segment.start.moveType,
      length: calculateSegmentLength(segment),
      startPoint: segment.start.position.clone(),
      endPoint: segment.end.position.clone()
    };

    return segmentGroup;
  };

  const createDirectionIndicator = (segment: PathSegment): THREE.Object3D | null => {
    if (!segment.start.arcCenter || !segment.start.clockwise !== undefined) return null;

    const indicatorGeometry = new THREE.ConeGeometry(3, 10, 6);
    const indicatorMaterial = new THREE.MeshBasicMaterial({ 
      color: segment.start.clockwise ? '#ff6b6b' : '#4ecdc4',
      transparent: true,
      opacity: 0.7
    });
    
    const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    
    // Position at arc center
    indicator.position.copy(segment.start.arcCenter);
    
    // Point in direction of arc
    const direction = segment.end.position.clone().sub(segment.start.position).normalize();
    indicator.lookAt(indicator.position.clone().add(direction));
    
    return indicator;
  };

  const addPathMarkers = (program: GCodeProgram) => {
    if (!pathGroupRef.current || program.segments.length === 0) return;

    const pathGroup = pathGroupRef.current;

    // Start marker (green)
    const startGeometry = new THREE.SphereGeometry(6, 12, 12);
    const startMaterial = new THREE.MeshBasicMaterial({ color: '#2ecc71' });
    const startMarker = new THREE.Mesh(startGeometry, startMaterial);
    startMarker.name = 'StartMarker';
    startMarker.position.copy(program.segments[0].start.position);
    pathGroup.add(startMarker);

    // End marker (red)
    const endGeometry = new THREE.SphereGeometry(6, 12, 12);
    const endMaterial = new THREE.MeshBasicMaterial({ color: '#e74c3c' });
    const endMarker = new THREE.Mesh(endGeometry, endMaterial);
    endMarker.name = 'EndMarker';
    const lastSegment = program.segments[program.segments.length - 1];
    endMarker.position.copy(lastSegment.end.position);
    pathGroup.add(endMarker);
  };

  const updateProgressIndicator = () => {
    if (!progressIndicatorRef.current || !currentProgramRef.current || !showProgress) return;

    const program = currentProgramRef.current;
    const progressIndicator = progressIndicatorRef.current;

    if (program.segments.length === 0) {
      progressIndicator.visible = false;
      return;
    }

    // Calculate position along path based on progress
    const targetProgress = Math.max(0, Math.min(100, currentProgress));
    const position = calculatePositionAtProgress(program, targetProgress);
    
    if (position) {
      progressIndicator.position.copy(position);
      progressIndicator.visible = true;

      // Add pulsing animation
      const time = Date.now() * 0.005 * animationSpeed;
      const scale = 1 + 0.2 * Math.sin(time);
      progressIndicator.scale.setScalar(scale);
    } else {
      progressIndicator.visible = false;
    }
  };

  const calculatePositionAtProgress = (program: GCodeProgram, progress: number): THREE.Vector3 | null => {
    if (progress <= 0) {
      return program.segments[0]?.start.position.clone() || null;
    }
    
    if (progress >= 100) {
      const lastSegment = program.segments[program.segments.length - 1];
      return lastSegment?.end.position.clone() || null;
    }

    // Calculate total path length
    let totalLength = 0;
    const segmentLengths: number[] = [];
    
    program.segments.forEach(segment => {
      const length = calculateSegmentLength(segment);
      segmentLengths.push(length);
      totalLength += length;
    });

    // Find target distance along path
    const targetDistance = (progress / 100) * totalLength;
    
    // Find which segment contains the target distance
    let currentDistance = 0;
    for (let i = 0; i < program.segments.length; i++) {
      const segmentLength = segmentLengths[i];
      
      if (currentDistance + segmentLength >= targetDistance) {
        // Target is in this segment
        const segmentProgress = (targetDistance - currentDistance) / segmentLength;
        const segment = program.segments[i];
        
        // Interpolate along segment
        return interpolateAlongSegment(segment, segmentProgress);
      }
      
      currentDistance += segmentLength;
    }

    return null;
  };

  const interpolateAlongSegment = (segment: PathSegment, progress: number): THREE.Vector3 => {
    if (progress <= 0) return segment.start.position.clone();
    if (progress >= 1) return segment.end.position.clone();

    // For now, use simple linear interpolation
    // This could be enhanced for proper arc interpolation
    return segment.start.position.clone().lerp(segment.end.position, progress);
  };

  const calculateSegmentLength = (segment: PathSegment): number => {
    let length = 0;
    for (let i = 1; i < segment.points.length; i++) {
      length += segment.points[i - 1].distanceTo(segment.points[i]);
    }
    return length;
  };

  const clearPath = () => {
    if (!pathGroupRef.current) return;

    // Remove all children and dispose of resources
    const children = [...pathGroupRef.current.children];
    children.forEach(child => {
      pathGroupRef.current!.remove(child);
      
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(material => material.dispose());
          } else {
            child.material.dispose();
          }
        }
      } else if (child instanceof THREE.Line) {
        if (child.geometry) child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });

    currentProgramRef.current = null;
  };

  const disposePathGroup = (group: THREE.Group) => {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(material => material.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  };

  const disposeProgressIndicator = (indicator: THREE.Mesh) => {
    if (indicator.geometry) indicator.geometry.dispose();
    if (indicator.material instanceof THREE.Material) {
      indicator.material.dispose();
    }
  };

  // This component doesn't render anything directly as it manipulates the Three.js scene
  return null;
};

export default PathRenderer;