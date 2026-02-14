// 3D Robot Model component
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ForwardKinematics, JointAngles, Transform } from '../utils/kinematics';
import { GeometryUtils } from '../utils/geometryUtils';

interface Robot3DModelProps {
  scene?: THREE.Scene;
  jointAngles: JointAngles;
  config: any;
  showCoordinateSystem?: boolean;
  showWorkspaceBounds?: boolean;
  visible?: boolean;
}

const Robot3DModel: React.FC<Robot3DModelProps> = ({
  scene,
  jointAngles,
  config,
  showCoordinateSystem = true,
  showWorkspaceBounds = true,
  visible = true
}) => {
  const robotGroupRef = useRef<THREE.Group | null>(null);
  const coordinateSystemRef = useRef<THREE.Group | null>(null);
  const workspaceBoundsRef = useRef<THREE.LineSegments | null>(null);
  const kinematicsRef = useRef<ForwardKinematics | null>(null);

  // Initialize robot geometry
  useEffect(() => {
    if (!scene || !config) return;

    // Initialize kinematics
    kinematicsRef.current = new ForwardKinematics(config);

    // Create robot group
    const robotGroup = new THREE.Group();
    robotGroup.name = 'Robot';
    robotGroupRef.current = robotGroup;

    // Create robot geometry
    createRobotMeshes(robotGroup);

    // Create coordinate system
    if (showCoordinateSystem) {
      const coordinateSystem = GeometryUtils.createCoordinateSystem(100);
      coordinateSystem.name = 'CoordinateSystem';
      coordinateSystemRef.current = coordinateSystem;
      scene.add(coordinateSystem);
    }

    // Create workspace bounds
    if (showWorkspaceBounds && kinematicsRef.current) {
      const bounds = kinematicsRef.current.getWorkspaceBounds();
      const workspaceBounds = GeometryUtils.createWorkspaceBounds(bounds.min, bounds.max);
      workspaceBounds.name = 'WorkspaceBounds';
      workspaceBoundsRef.current = workspaceBounds;
      scene.add(workspaceBounds);
    }

    // Add robot to scene
    scene.add(robotGroup);

    // Initial position update
    updateRobotPosition();

    return () => {
      // Cleanup
      if (robotGroupRef.current) {
        scene.remove(robotGroupRef.current);
        disposeGroup(robotGroupRef.current);
      }
      if (coordinateSystemRef.current) {
        scene.remove(coordinateSystemRef.current);
        disposeGroup(coordinateSystemRef.current);
      }
      if (workspaceBoundsRef.current) {
        scene.remove(workspaceBoundsRef.current);
        workspaceBoundsRef.current.geometry.dispose();
        if (workspaceBoundsRef.current.material instanceof THREE.Material) {
          workspaceBoundsRef.current.material.dispose();
        }
      }
    };
  }, [scene, config, showCoordinateSystem, showWorkspaceBounds]);

  // Update robot position when joint angles change
  useEffect(() => {
    updateRobotPosition();
  }, [jointAngles]);

  // Update visibility
  useEffect(() => {
    if (robotGroupRef.current) {
      robotGroupRef.current.visible = visible;
    }
    if (coordinateSystemRef.current) {
      coordinateSystemRef.current.visible = visible && showCoordinateSystem;
    }
    if (workspaceBoundsRef.current) {
      workspaceBoundsRef.current.visible = visible && showWorkspaceBounds;
    }
  }, [visible, showCoordinateSystem, showWorkspaceBounds]);

  const createRobotMeshes = (robotGroup: THREE.Group) => {
    // Create base
    const baseGeometry = new THREE.CylinderGeometry(30, 40, 50, 16);
    const baseMaterial = GeometryUtils.createMaterial('#2c3e50');
    const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
    baseMesh.name = 'Base';
    baseMesh.position.set(0, 25, 0);
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    robotGroup.add(baseMesh);

    // Create links
    const linkConfigs = [
      { length: 150, radius: 15, color: '#2c3e50', name: 'Link1' },
      { length: 250, radius: 12, color: '#3498db', name: 'Link2' },
      { length: 200, radius: 10, color: '#e74c3c', name: 'Link3' },
      { length: 150, radius: 8, color: '#f39c12', name: 'Link4' },
      { length: 100, radius: 6, color: '#9b59b6', name: 'Link5' },
      { length: 80, radius: 5, color: '#1abc9c', name: 'Link6' }
    ];

    linkConfigs.forEach((linkConfig, index) => {
      // Create link geometry
      const linkGeometry = new THREE.CylinderGeometry(
        linkConfig.radius,
        linkConfig.radius,
        linkConfig.length,
        12
      );
      
      // Rotate to align with X-axis
      linkGeometry.rotateZ(Math.PI / 2);
      linkGeometry.translate(linkConfig.length / 2, 0, 0);

      const linkMaterial = GeometryUtils.createMaterial(linkConfig.color);
      const linkMesh = new THREE.Mesh(linkGeometry, linkMaterial);
      linkMesh.name = linkConfig.name;
      linkMesh.castShadow = true;
      linkMesh.receiveShadow = true;

      robotGroup.add(linkMesh);

      // Create joint
      const jointGeometry = new THREE.CylinderGeometry(
        linkConfig.radius + 2,
        linkConfig.radius + 2,
        15,
        16
      );
      const jointMaterial = GeometryUtils.createMaterial('#34495e');
      const jointMesh = new THREE.Mesh(jointGeometry, jointMaterial);
      jointMesh.name = `Joint${index + 1}`;
      jointMesh.castShadow = true;
      jointMesh.receiveShadow = true;

      robotGroup.add(jointMesh);
    });

    // Create end effector (gripper)
    const endEffectorGroup = new THREE.Group();
    endEffectorGroup.name = 'EndEffector';

    // Main body
    const bodyGeometry = new THREE.BoxGeometry(30, 15, 15);
    const bodyMaterial = GeometryUtils.createMaterial('#34495e');
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    endEffectorGroup.add(bodyMesh);

    // Gripper fingers
    const fingerGeometry = new THREE.BoxGeometry(20, 3, 8);
    const fingerMaterial = GeometryUtils.createMaterial('#7f8c8d');

    const finger1 = new THREE.Mesh(fingerGeometry, fingerMaterial);
    finger1.position.set(25, 6, 0);
    finger1.name = 'Finger1';
    finger1.castShadow = true;
    finger1.receiveShadow = true;
    endEffectorGroup.add(finger1);

    const finger2 = new THREE.Mesh(fingerGeometry, fingerMaterial);
    finger2.position.set(25, -6, 0);
    finger2.name = 'Finger2';
    finger2.castShadow = true;
    finger2.receiveShadow = true;
    endEffectorGroup.add(finger2);

    robotGroup.add(endEffectorGroup);
  };

  const updateRobotPosition = () => {
    if (!robotGroupRef.current || !kinematicsRef.current) return;

    try {
      // Calculate all joint transforms
      const transforms = kinematicsRef.current.calculateAllJointTransforms(jointAngles);
      
      // Update positions of robot components
      const children = robotGroupRef.current.children;
      
      // Update base (always at origin)
      const baseMesh = children.find(child => child.name === 'Base');
      if (baseMesh) {
        baseMesh.position.set(0, 25, 0);
        baseMesh.rotation.set(0, 0, 0);
      }

      // Update links and joints
      for (let i = 0; i < Math.min(transforms.length - 1, 6); i++) {
        const transform = transforms[i + 1];
        
        // Update link
        const linkMesh = children.find(child => child.name === `Link${i + 1}`);
        if (linkMesh && transform) {
          linkMesh.position.copy(transform.position);
          linkMesh.rotation.copy(transform.rotation);
        }

        // Update joint
        const jointMesh = children.find(child => child.name === `Joint${i + 1}`);
        if (jointMesh && transform) {
          jointMesh.position.copy(transform.position);
          jointMesh.rotation.copy(transform.rotation);
        }
      }

      // Update end effector
      const endEffectorGroup = children.find(child => child.name === 'EndEffector') as THREE.Group;
      if (endEffectorGroup && transforms.length > 0) {
        const endTransform = transforms[transforms.length - 1];
        endEffectorGroup.position.copy(endTransform.position);
        endEffectorGroup.rotation.copy(endTransform.rotation);

        // Update gripper finger positions based on manipulator state
        const finger1 = endEffectorGroup.children.find(child => child.name === 'Finger1');
        const finger2 = endEffectorGroup.children.find(child => child.name === 'Finger2');
        
        if (finger1 && finger2) {
          // Get gripper state from joint angles or use default
          const gripperValue = jointAngles.gripper || 0;
          const fingerOffset = 6 + (gripperValue / 100) * 4; // 0-100% gripper value
          
          finger1.position.set(25, fingerOffset, 0);
          finger2.position.set(25, -fingerOffset, 0);
        }
      }

    } catch (error) {
      console.error('Error updating robot position:', error);
    }
  };

  const disposeGroup = (group: THREE.Group) => {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
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

  // This component doesn't render anything directly as it manipulates the Three.js scene
  return null;
};

export default Robot3DModel;