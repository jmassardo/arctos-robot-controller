// React Three Fiber Robot Model component
import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ForwardKinematics, JointAngles, Transform } from '../../utils/kinematics';

interface RobotModelProps {
  position: JointAngles;
  config: any;
  wireframe?: boolean;
  kinematics: ForwardKinematics | null;
  visible?: boolean;
}

interface LinkConfig {
  length: number;
  radius: number;
  color: string;
  name: string;
}

const RobotModel: React.FC<RobotModelProps> = ({
  position,
  config,
  wireframe = false,
  kinematics,
  visible = true
}) => {
  const robotGroupRef = useRef<THREE.Group>(null);
  const jointMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const linkMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const endEffectorRef = useRef<THREE.Group>(null);

  // Robot link configurations
  const linkConfigs: LinkConfig[] = useMemo(() => [
    { length: 150, radius: 15, color: '#2c3e50', name: 'Link1' },
    { length: 250, radius: 12, color: '#3498db', name: 'Link2' },
    { length: 200, radius: 10, color: '#e74c3c', name: 'Link3' },
    { length: 150, radius: 8, color: '#f39c12', name: 'Link4' },
    { length: 100, radius: 6, color: '#9b59b6', name: 'Link5' },
    { length: 80, radius: 5, color: '#1abc9c', name: 'Link6' }
  ], []);

  // Update robot pose when position or kinematics changes
  useFrame(() => {
    if (!kinematics || !robotGroupRef.current) return;

    try {
      // Calculate all joint transforms
      const transforms = kinematics.calculateAllJointTransforms(position);
      updateRobotVisualization(transforms);
    } catch (error) {
      console.error('Error updating robot pose:', error);
    }
  });

  const updateRobotVisualization = (transforms: Transform[]) => {
    // Update base (always at origin)
    const baseMesh = robotGroupRef.current?.getObjectByName('Base') as THREE.Mesh;
    if (baseMesh) {
      baseMesh.position.set(0, 25, 0);
      baseMesh.rotation.set(0, 0, 0);
    }

    // Update links and joints
    transforms.forEach((transform, index) => {
      if (index === 0) return; // Skip base transform

      const linkIndex = index - 1;
      
      // Update link
      const linkMesh = robotGroupRef.current?.getObjectByName(`Link${linkIndex + 1}`) as THREE.Mesh;
      if (linkMesh && linkIndex < linkConfigs.length) {
        linkMesh.position.copy(transform.position);
        linkMesh.rotation.copy(transform.rotation);
      }

      // Update joint
      const jointMesh = robotGroupRef.current?.getObjectByName(`Joint${linkIndex + 1}`) as THREE.Mesh;
      if (jointMesh && linkIndex < linkConfigs.length) {
        jointMesh.position.copy(transform.position);
        jointMesh.rotation.copy(transform.rotation);
      }
    });

    // Update end effector
    if (endEffectorRef.current && transforms.length > 0) {
      const endTransform = transforms[transforms.length - 1];
      endEffectorRef.current.position.copy(endTransform.position);
      endEffectorRef.current.rotation.copy(endTransform.rotation);

      // Update gripper fingers based on gripper value
      updateGripperFingers();
    }
  };

  const updateGripperFingers = () => {
    if (!endEffectorRef.current) return;

    const finger1 = endEffectorRef.current.getObjectByName('Finger1') as THREE.Mesh;
    const finger2 = endEffectorRef.current.getObjectByName('Finger2') as THREE.Mesh;
    
    if (finger1 && finger2) {
      const gripperValue = position.gripper || 0;
      const fingerOffset = 6 + (gripperValue / 100) * 4; // 0-100% gripper value
      
      finger1.position.set(25, fingerOffset, 0);
      finger2.position.set(25, -fingerOffset, 0);
    }
  };

  // Memoized geometries for performance
  const geometries = useMemo(() => ({
    base: new THREE.CylinderGeometry(30, 40, 50, 16),
    links: linkConfigs.map(config => {
      const geometry = new THREE.CylinderGeometry(config.radius, config.radius, config.length, 12);
      geometry.rotateZ(Math.PI / 2);
      geometry.translate(config.length / 2, 0, 0);
      return geometry;
    }),
    joints: linkConfigs.map((config, index) => 
      new THREE.CylinderGeometry(config.radius + 2, config.radius + 2, 15, 16)
    ),
    endEffectorBody: new THREE.BoxGeometry(30, 15, 15),
    finger: new THREE.BoxGeometry(20, 3, 8)
  }), [linkConfigs]);

  // Memoized materials
  const materials = useMemo(() => ({
    base: new THREE.MeshStandardMaterial({ 
      color: '#2c3e50', 
      wireframe,
      metalness: 0.2,
      roughness: 0.8
    }),
    links: linkConfigs.map(config => new THREE.MeshStandardMaterial({ 
      color: config.color, 
      wireframe,
      metalness: 0.2,
      roughness: 0.8
    })),
    joint: new THREE.MeshStandardMaterial({ 
      color: '#34495e', 
      wireframe,
      metalness: 0.3,
      roughness: 0.7
    }),
    endEffectorBody: new THREE.MeshStandardMaterial({ 
      color: '#34495e', 
      wireframe,
      metalness: 0.3,
      roughness: 0.7
    }),
    finger: new THREE.MeshStandardMaterial({ 
      color: '#7f8c8d', 
      wireframe,
      metalness: 0.4,
      roughness: 0.6
    })
  }), [linkConfigs, wireframe]);

  return (
    <group ref={robotGroupRef} visible={visible}>
      {/* Robot Base */}
      <mesh
        name="Base"
        position={[0, 25, 0]}
        geometry={geometries.base}
        material={materials.base}
        castShadow
        receiveShadow
      />

      {/* Robot Links */}
      {linkConfigs.map((linkConfig, index) => (
        <group key={`link-group-${index}`}>
          {/* Link */}
          <mesh
            ref={el => { linkMeshRefs.current[index] = el; }}
            name={linkConfig.name}
            geometry={geometries.links[index]}
            material={materials.links[index]}
            castShadow
            receiveShadow
          />

          {/* Joint */}
          <mesh
            ref={el => { jointMeshRefs.current[index] = el; }}
            name={`Joint${index + 1}`}
            geometry={geometries.joints[index]}
            material={materials.joint}
            castShadow
            receiveShadow
          />
        </group>
      ))}

      {/* End Effector (Gripper) */}
      <group ref={endEffectorRef} name="EndEffector">
        {/* Main body */}
        <mesh
          geometry={geometries.endEffectorBody}
          material={materials.endEffectorBody}
          castShadow
          receiveShadow
        />

        {/* Gripper Fingers */}
        <mesh
          name="Finger1"
          position={[25, 6, 0]}
          geometry={geometries.finger}
          material={materials.finger}
          castShadow
          receiveShadow
        />
        <mesh
          name="Finger2"
          position={[25, -6, 0]}
          geometry={geometries.finger}
          material={materials.finger}
          castShadow
          receiveShadow
        />
      </group>

      {/* Joint Coordinate Frames (for debugging) */}
      {config?.debug?.showJointFrames && (
        <>
          {linkConfigs.map((_, index) => (
            <group key={`frame-${index}`} name={`Frame${index + 1}`}>
              {/* X-axis */}
              <mesh position={[10, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.5, 0.5, 20]} />
                <meshBasicMaterial color="#ff0000" />
              </mesh>
              {/* Y-axis */}
              <mesh position={[0, 10, 0]}>
                <cylinderGeometry args={[0.5, 0.5, 20]} />
                <meshBasicMaterial color="#00ff00" />
              </mesh>
              {/* Z-axis */}
              <mesh position={[0, 0, 10]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.5, 0.5, 20]} />
                <meshBasicMaterial color="#0000ff" />
              </mesh>
            </group>
          ))}
        </>
      )}
    </group>
  );
};

export default RobotModel;