// React Three Fiber Tool Path component
import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { GCodeProgram, PathSegment } from '../../utils/pathCalculation';

interface ToolPathProps {
  program: GCodeProgram;
  progress?: number; // 0-100
  isAnimating?: boolean;
  animationSpeed?: number;
  visible?: boolean;
  showPoints?: boolean;
  showDirections?: boolean;
}

interface PathColors {
  rapid: string;
  linear: string;
  arc: string;
  pause: string;
  current: string;
  completed: string;
  future: string;
}

const ToolPath: React.FC<ToolPathProps> = ({
  program,
  progress = 0,
  isAnimating = false,
  animationSpeed = 1.0,
  visible = true,
  showPoints = true,
  showDirections = false
}) => {
  const progressIndicatorRef = useRef<THREE.Mesh>(null);
  const pathGroupRef = useRef<THREE.Group>(null);

  // Color scheme for different path types
  const colors: PathColors = useMemo(() => ({
    rapid: '#ef4444',      // Red for rapid moves
    linear: '#10b981',     // Green for linear moves
    arc: '#3b82f6',        // Blue for arc moves
    pause: '#f59e0b',      // Orange for pauses
    current: '#ffff00',    // Yellow for current position
    completed: '#22c55e',  // Bright green for completed
    future: '#6b7280'      // Gray for future moves
  }), []);

  // Calculate current position along path based on progress
  const currentPosition = useMemo(() => {
    if (program.segments.length === 0) return null;
    
    return calculatePositionAtProgress(program, progress);
  }, [program, progress]);

  // Animate progress indicator
  useFrame((state) => {
    if (!progressIndicatorRef.current || !isAnimating) return;

    // Pulsing animation
    const time = state.clock.elapsedTime * animationSpeed;
    const scale = 1 + 0.3 * Math.sin(time * 3);
    progressIndicatorRef.current.scale.setScalar(scale);

    // Rotation animation
    progressIndicatorRef.current.rotation.y += 0.02 * animationSpeed;
  });

  // Group path segments by completion status
  const segmentGroups = useMemo(() => {
    const groups = {
      completed: [] as PathSegment[],
      current: null as PathSegment | null,
      future: [] as PathSegment[]
    };

    const totalLength = program.segments.reduce((sum, segment) => 
      sum + calculateSegmentLength(segment), 0
    );

    let currentLength = 0;
    const targetLength = (progress / 100) * totalLength;

    program.segments.forEach(segment => {
      const segmentLength = calculateSegmentLength(segment);
      
      if (currentLength + segmentLength <= targetLength) {
        // Completed segment
        groups.completed.push(segment);
      } else if (currentLength < targetLength) {
        // Current segment (partially completed)
        groups.current = segment;
      } else {
        // Future segment
        groups.future.push(segment);
      }
      
      currentLength += segmentLength;
    });

    return groups;
  }, [program.segments, progress]);

  return (
    <group ref={pathGroupRef} visible={visible}>
      {/* Completed path segments */}
      {segmentGroups.completed.map((segment, index) => (
        <PathSegmentLine
          key={`completed-${index}`}
          segment={segment}
          color={colors.completed}
          opacity={0.8}
          lineWidth={3}
        />
      ))}

      {/* Current path segment */}
      {segmentGroups.current && (
        <PathSegmentLine
          segment={segmentGroups.current}
          color={colors.current}
          opacity={1.0}
          lineWidth={4}
          animated={isAnimating}
        />
      )}

      {/* Future path segments */}
      {segmentGroups.future.map((segment, index) => (
        <PathSegmentLine
          key={`future-${index}`}
          segment={segment}
          color={getSegmentColor(segment, colors)}
          opacity={0.4}
          lineWidth={2}
        />
      ))}

      {/* Path points */}
      {showPoints && program.segments.map((segment, segmentIndex) => 
        segment.points.map((point, pointIndex) => (
          <PathPoint
            key={`point-${segmentIndex}-${pointIndex}`}
            position={point}
            type={segment.start.moveType}
            colors={colors}
            isCompleted={segmentGroups.completed.includes(segment)}
            isCurrent={segmentGroups.current === segment}
          />
        ))
      )}

      {/* Direction indicators */}
      {showDirections && program.segments.map((segment, index) => (
        <DirectionIndicator
          key={`direction-${index}`}
          segment={segment}
          color={getSegmentColor(segment, colors)}
        />
      ))}

      {/* Start marker */}
      {program.segments.length > 0 && (
        <mesh position={program.segments[0].start.position.toArray()}>
          <sphereGeometry args={[8, 12, 12]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
      )}

      {/* End marker */}
      {program.segments.length > 0 && (
        <mesh position={program.segments[program.segments.length - 1].end.position.toArray()}>
          <sphereGeometry args={[8, 12, 12]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>
      )}

      {/* Current position indicator */}
      {currentPosition && (
        <mesh
          ref={progressIndicatorRef}
          position={currentPosition.toArray()}
        >
          <sphereGeometry args={[6, 12, 12]} />
          <meshBasicMaterial 
            color={colors.current} 
            transparent
            opacity={0.9}
          />
        </mesh>
      )}

      {/* Path statistics display */}
      {program.metadata && (
        <PathInfo
          metadata={program.metadata}
          position={[100, 200, 0]}
          progress={progress}
        />
      )}
    </group>
  );
};

// Individual path segment line component
interface PathSegmentLineProps {
  segment: PathSegment;
  color: string;
  opacity: number;
  lineWidth: number;
  animated?: boolean;
}

const PathSegmentLine: React.FC<PathSegmentLineProps> = ({
  segment,
  color,
  opacity,
  lineWidth,
  animated = false
}) => {
  const lineRef = useRef<any>(null);

  useFrame((state) => {
    if (!animated || !lineRef.current) return;

    // Animate line opacity for current segment
    const material = lineRef.current.material as THREE.LineBasicMaterial;
    if (material) {
      const time = state.clock.elapsedTime;
      material.opacity = opacity * (0.7 + 0.3 * Math.sin(time * 4));
    }
  });

  const points = segment.points.map(p => [p.x, p.y, p.z] as [number, number, number]);

  return (
    <Line
      ref={lineRef}
      points={points}
      color={color}
      lineWidth={lineWidth}
      transparent
      opacity={opacity}
    />
  );
};

// Individual path point component
interface PathPointProps {
  position: THREE.Vector3;
  type: string;
  colors: PathColors;
  isCompleted: boolean;
  isCurrent: boolean;
}

const PathPoint: React.FC<PathPointProps> = ({
  position,
  type,
  colors,
  isCompleted,
  isCurrent
}) => {
  const getPointColor = () => {
    if (isCurrent) return colors.current;
    if (isCompleted) return colors.completed;
    
    switch (type) {
      case 'rapid': return colors.rapid;
      case 'linear': return colors.linear;
      case 'arc': return colors.arc;
      case 'pause': return colors.pause;
      default: return colors.future;
    }
  };

  const getPointSize = () => {
    if (isCurrent) return 3;
    if (isCompleted) return 2.5;
    return 2;
  };

  return (
    <mesh position={position.toArray()}>
      <sphereGeometry args={[getPointSize(), 8, 8]} />
      <meshBasicMaterial 
        color={getPointColor()} 
        transparent
        opacity={isCurrent ? 1.0 : 0.7}
      />
    </mesh>
  );
};

// Direction indicator for arc moves
interface DirectionIndicatorProps {
  segment: PathSegment;
  color: string;
}

const DirectionIndicator: React.FC<DirectionIndicatorProps> = ({
  segment,
  color
}) => {
  if (!segment.start.arcCenter || segment.start.clockwise === undefined) {
    return null;
  }

  const direction = segment.end.position.clone().sub(segment.start.position).normalize();
  const position = segment.start.arcCenter;

  return (
    <group position={position.toArray()}>
      <mesh rotation={[0, 0, Math.atan2(direction.y, direction.x)]}>
        <coneGeometry args={[3, 10, 6]} />
        <meshBasicMaterial 
          color={segment.start.clockwise ? '#ef4444' : '#22c55e'}
          transparent
          opacity={0.7}
        />
      </mesh>
    </group>
  );
};

// Path information display
interface PathInfoProps {
  metadata: any;
  position: [number, number, number];
  progress: number;
}

const PathInfo: React.FC<PathInfoProps> = ({ metadata, position, progress }) => {
  return (
    <group position={position}>
      {/* This would be enhanced with proper text rendering in a full implementation */}
      <mesh>
        <planeGeometry args={[200, 100]} />
        <meshBasicMaterial 
          color="#000000" 
          transparent 
          opacity={0.7} 
        />
      </mesh>
    </group>
  );
};

// Utility functions
const calculatePositionAtProgress = (program: GCodeProgram, progress: number): THREE.Vector3 | null => {
  if (program.segments.length === 0) return null;
  
  if (progress <= 0) {
    return program.segments[0].start.position.clone();
  }
  
  if (progress >= 100) {
    const lastSegment = program.segments[program.segments.length - 1];
    return lastSegment.end.position.clone();
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
      
      // Simple linear interpolation
      return segment.start.position.clone().lerp(segment.end.position, segmentProgress);
    }
    
    currentDistance += segmentLength;
  }

  return null;
};

const calculateSegmentLength = (segment: PathSegment): number => {
  let length = 0;
  for (let i = 1; i < segment.points.length; i++) {
    length += segment.points[i - 1].distanceTo(segment.points[i]);
  }
  return length;
};

const getSegmentColor = (segment: PathSegment, colors: PathColors): string => {
  switch (segment.start.moveType) {
    case 'rapid': return colors.rapid;
    case 'linear': return colors.linear;
    case 'arc': return colors.arc;
    default: return colors.future;
  }
};

export default ToolPath;