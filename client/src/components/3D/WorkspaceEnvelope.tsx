// React Three Fiber Workspace Envelope component
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ForwardKinematics } from '../../utils/kinematics';

interface WorkspaceEnvelopeProps {
  kinematics: ForwardKinematics;
  config: any;
  visible?: boolean;
  showSafetyZones?: boolean;
  showReachLimits?: boolean;
  wireframe?: boolean;
  opacity?: number;
}

interface WorkspaceBounds {
  min: THREE.Vector3;
  max: THREE.Vector3;
  innerRadius: number;
  outerRadius: number;
  height: number;
  center: THREE.Vector3;
}

const WorkspaceEnvelope: React.FC<WorkspaceEnvelopeProps> = ({
  kinematics,
  config,
  visible = true,
  showSafetyZones = true,
  showReachLimits = true,
  wireframe = false,
  opacity = 0.2
}) => {
  // Calculate workspace bounds
  const workspaceBounds = useMemo<WorkspaceBounds>(() => {
    const bounds = kinematics.getWorkspaceBounds();
    const center = bounds.min.clone().add(bounds.max).multiplyScalar(0.5);
    
    // Calculate cylindrical workspace parameters
    const outerRadius = Math.max(
      Math.abs(bounds.min.x),
      Math.abs(bounds.max.x),
      Math.abs(bounds.min.y),
      Math.abs(bounds.max.y)
    );
    
    const innerRadius = outerRadius * 0.1; // Minimum reach
    const height = Math.max(bounds.max.z - bounds.min.z, 100);

    return {
      min: bounds.min,
      max: bounds.max,
      innerRadius,
      outerRadius,
      height,
      center
    };
  }, [kinematics]);

  // Calculate safety zones based on configuration
  const safetyZones = useMemo(() => {
    const zones = [];
    
    // Primary safety boundary (80% of max reach)
    zones.push({
      radius: workspaceBounds.outerRadius * 0.8,
      height: workspaceBounds.height * 0.8,
      color: '#f39c12',
      name: 'Warning Zone'
    });

    // Critical safety boundary (90% of max reach)  
    zones.push({
      radius: workspaceBounds.outerRadius * 0.9,
      height: workspaceBounds.height * 0.9,
      color: '#e74c3c',
      name: 'Critical Zone'
    });

    return zones;
  }, [workspaceBounds]);

  // Create workspace geometry
  const workspaceGeometry = useMemo(() => {
    return new THREE.CylinderGeometry(
      workspaceBounds.innerRadius,
      workspaceBounds.outerRadius,
      workspaceBounds.height,
      32,
      1,
      true // Open-ended cylinder
    );
  }, [workspaceBounds]);

  // Create bounding box edges
  const boundingBoxEdges = useMemo(() => {
    const { min, max } = workspaceBounds;
    const points = [];

    // Define the 12 edges of the bounding box
    const corners = [
      [min.x, min.y, min.z], [max.x, min.y, min.z],
      [min.x, max.y, min.z], [max.x, max.y, min.z],
      [min.x, min.y, max.z], [max.x, min.y, max.z],
      [min.x, max.y, max.z], [max.x, max.y, max.z]
    ];

    const edges = [
      [0, 1], [1, 3], [3, 2], [2, 0], // Bottom face
      [4, 5], [5, 7], [7, 6], [6, 4], // Top face
      [0, 4], [1, 5], [2, 6], [3, 7]  // Vertical edges
    ];

    for (const edge of edges) {
      points.push(
        new THREE.Vector3(...corners[edge[0]]),
        new THREE.Vector3(...corners[edge[1]])
      );
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return geometry;
  }, [workspaceBounds]);

  return (
    <group visible={visible}>
      {/* Main cylindrical workspace envelope */}
      <mesh
        position={[
          workspaceBounds.center.x,
          workspaceBounds.center.y + workspaceBounds.height / 2,
          workspaceBounds.center.z
        ]}
        geometry={workspaceGeometry}
      >
        <meshBasicMaterial
          color="#3b82f6"
          transparent
          opacity={opacity}
          wireframe={wireframe}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Bounding box edges */}
      {showReachLimits && (
        <lineSegments geometry={boundingBoxEdges}>
          <lineBasicMaterial
            color="#6b7280"
            transparent
            opacity={opacity * 2}
          />
        </lineSegments>
      )}

      {/* Safety zones */}
      {showSafetyZones && safetyZones.map((zone, index) => (
        <SafetyZone
          key={index}
          radius={zone.radius}
          height={zone.height}
          color={zone.color}
          center={workspaceBounds.center}
          opacity={opacity * 0.8}
          wireframe={wireframe}
        />
      ))}

      {/* Work coordinate systems */}
      <WorkCoordinateSystems
        center={workspaceBounds.center}
        config={config}
      />

      {/* Ground plane */}
      <GroundPlane
        center={workspaceBounds.center}
        radius={workspaceBounds.outerRadius * 1.2}
      />

      {/* Workspace information display */}
      <WorkspaceInfo
        bounds={workspaceBounds}
        position={[
          workspaceBounds.max.x + 50,
          workspaceBounds.max.y,
          workspaceBounds.max.z
        ]}
      />
    </group>
  );
};

// Safety zone component
interface SafetyZoneProps {
  radius: number;
  height: number;
  color: string;
  center: THREE.Vector3;
  opacity: number;
  wireframe: boolean;
}

const SafetyZone: React.FC<SafetyZoneProps> = ({
  radius,
  height,
  color,
  center,
  opacity,
  wireframe
}) => {
  const geometry = useMemo(() => 
    new THREE.CylinderGeometry(radius * 0.1, radius, height, 16, 1, true),
    [radius, height]
  );

  return (
    <mesh
      position={[center.x, center.y + height / 2, center.z]}
      geometry={geometry}
    >
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        wireframe={wireframe}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

// Work coordinate systems component
interface WorkCoordinateSystemsProps {
  center: THREE.Vector3;
  config: any;
}

const WorkCoordinateSystems: React.FC<WorkCoordinateSystemsProps> = ({
  center,
  config
}) => {
  // Define work coordinate systems from config
  const coordinateSystems = useMemo(() => {
    const systems = [];
    
    // World coordinate system (at origin)
    systems.push({
      position: [0, 0, 0],
      name: 'World',
      size: 50,
      colors: ['#ff0000', '#00ff00', '#0000ff'] // RGB for XYZ
    });

    // Work coordinate systems (if defined in config)
    if (config?.workCoordinateSystems) {
      config.workCoordinateSystems.forEach((wcs: any, index: number) => {
        systems.push({
          position: [wcs.x || 0, wcs.y || 0, wcs.z || 0],
          name: `WCS${index + 1}`,
          size: 30,
          colors: ['#ff6666', '#66ff66', '#6666ff'] // Lighter RGB
        });
      });
    }

    return systems;
  }, [config]);

  return (
    <group>
      {coordinateSystems.map((system, index) => (
        <CoordinateSystem
          key={index}
          position={system.position as [number, number, number]}
          size={system.size}
          colors={system.colors}
          name={system.name}
        />
      ))}
    </group>
  );
};

// Individual coordinate system component
interface CoordinateSystemProps {
  position: [number, number, number];
  size: number;
  colors: string[];
  name: string;
}

const CoordinateSystem: React.FC<CoordinateSystemProps> = ({
  position,
  size,
  colors,
  name
}) => {
  return (
    <group position={position}>
      {/* X-axis (red) */}
      <mesh position={[size / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[1, 1, size, 8]} />
        <meshBasicMaterial color={colors[0]} />
      </mesh>
      
      {/* Y-axis (green) */}
      <mesh position={[0, size / 2, 0]}>
        <cylinderGeometry args={[1, 1, size, 8]} />
        <meshBasicMaterial color={colors[1]} />
      </mesh>
      
      {/* Z-axis (blue) */}
      <mesh position={[0, 0, size / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1, 1, size, 8]} />
        <meshBasicMaterial color={colors[2]} />
      </mesh>

      {/* Origin marker */}
      <mesh>
        <sphereGeometry args={[3, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
};

// Ground plane component
interface GroundPlaneProps {
  center: THREE.Vector3;
  radius: number;
}

const GroundPlane: React.FC<GroundPlaneProps> = ({ center, radius }) => {
  const gridGeometry = useMemo(() => {
    const size = radius * 2;
    const divisions = Math.floor(size / 50);
    const points = [];

    // Create grid lines
    const step = size / divisions;
    const halfSize = size / 2;

    // Horizontal lines
    for (let i = 0; i <= divisions; i++) {
      const y = -halfSize + i * step;
      points.push(
        new THREE.Vector3(-halfSize, 0, y),
        new THREE.Vector3(halfSize, 0, y)
      );
    }

    // Vertical lines
    for (let i = 0; i <= divisions; i++) {
      const x = -halfSize + i * step;
      points.push(
        new THREE.Vector3(x, 0, -halfSize),
        new THREE.Vector3(x, 0, halfSize)
      );
    }

    return new THREE.BufferGeometry().setFromPoints(points);
  }, [radius]);

  return (
    <group position={[center.x, 0, center.z]}>
      {/* Grid lines */}
      <lineSegments geometry={gridGeometry}>
        <lineBasicMaterial
          color="#333333"
          transparent
          opacity={0.3}
        />
      </lineSegments>
      
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[radius * 2, radius * 2]} />
        <meshBasicMaterial
          color="#2a2a2a"
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
};

// Workspace information display
interface WorkspaceInfoProps {
  bounds: WorkspaceBounds;
  position: [number, number, number];
}

const WorkspaceInfo: React.FC<WorkspaceInfoProps> = ({ bounds, position }) => {
  // In a full implementation, this would render actual text
  // For now, we'll create placeholder geometry
  
  return (
    <group position={position}>
      {/* Info panel background */}
      <mesh>
        <planeGeometry args={[150, 100]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.7}
        />
      </mesh>
      
      {/* Info markers */}
      <mesh position={[0, 30, 1]}>
        <sphereGeometry args={[2, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 10, 1]}>
        <sphereGeometry args={[2, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, -10, 1]}>
        <sphereGeometry args={[2, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, -30, 1]}>
        <sphereGeometry args={[2, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
};

export default WorkspaceEnvelope;