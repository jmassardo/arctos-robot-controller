// Forward kinematics calculations for robotic arm
import * as THREE from 'three';

export interface JointAngles {
  [key: string]: number;
}

export interface RobotConfiguration {
  axes: {
    count: number;
    limits: { [key: string]: { min: number; max: number } };
  };
}

export interface Transform {
  position: THREE.Vector3;
  rotation: THREE.Euler;
}

export class ForwardKinematics {
  private config: RobotConfiguration;
  private linkLengths: number[];
  private jointOffsets: number[];

  constructor(config: RobotConfiguration) {
    this.config = config;
    // Default link lengths for a 6-axis robot (in mm)
    this.linkLengths = [150, 250, 200, 150, 100, 80];
    // Joint offsets in radians
    this.jointOffsets = [0, -Math.PI/2, 0, 0, 0, 0];
  }

  /**
   * Calculate forward kinematics for given joint angles
   */
  calculatePose(jointAngles: JointAngles): Transform {
    const angles = this.extractAnglesArray(jointAngles);
    const transforms: THREE.Matrix4[] = [];

    // Calculate transformation matrices for each joint
    for (let i = 0; i < Math.min(angles.length, this.linkLengths.length); i++) {
      const angle = angles[i] + this.jointOffsets[i];
      const transform = this.createJointTransform(i, angle);
      transforms.push(transform);
    }

    // Multiply all transformation matrices
    let finalTransform = new THREE.Matrix4().identity();
    for (const transform of transforms) {
      finalTransform.multiply(transform);
    }

    // Extract position and rotation from final transform
    const position = new THREE.Vector3();
    const rotation = new THREE.Euler();
    const scale = new THREE.Vector3();

    finalTransform.decompose(position, new THREE.Quaternion().setFromEuler(rotation), scale);

    return {
      position,
      rotation
    };
  }

  /**
   * Calculate transforms for all joints (for visualization)
   */
  calculateAllJointTransforms(jointAngles: JointAngles): Transform[] {
    const angles = this.extractAnglesArray(jointAngles);
    const transforms: Transform[] = [];
    let cumulativeTransform = new THREE.Matrix4().identity();

    // Base transform
    transforms.push({
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0)
    });

    for (let i = 0; i < Math.min(angles.length, this.linkLengths.length); i++) {
      const angle = angles[i] + this.jointOffsets[i];
      const jointTransform = this.createJointTransform(i, angle);
      cumulativeTransform.multiply(jointTransform);

      const position = new THREE.Vector3();
      const rotation = new THREE.Euler();
      const scale = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();

      cumulativeTransform.decompose(position, quaternion, scale);
      rotation.setFromQuaternion(quaternion);

      transforms.push({
        position: position.clone(),
        rotation: rotation.clone()
      });
    }

    return transforms;
  }

  /**
   * Create transformation matrix for a single joint
   */
  private createJointTransform(jointIndex: number, angle: number): THREE.Matrix4 {
    const transform = new THREE.Matrix4();
    
    // Standard DH parameters approach
    switch (jointIndex) {
      case 0: // Base rotation around Z
        transform.makeRotationZ(angle);
        transform.setPosition(0, 0, this.linkLengths[0]);
        break;
      case 1: // Shoulder joint
        transform.makeRotationY(angle);
        transform.setPosition(this.linkLengths[1], 0, 0);
        break;
      case 2: // Elbow joint
        transform.makeRotationY(angle);
        transform.setPosition(this.linkLengths[2], 0, 0);
        break;
      case 3: // Wrist pitch
        transform.makeRotationY(angle);
        transform.setPosition(this.linkLengths[3], 0, 0);
        break;
      case 4: // Wrist roll
        transform.makeRotationX(angle);
        transform.setPosition(this.linkLengths[4], 0, 0);
        break;
      case 5: // End effector
        transform.makeRotationZ(angle);
        transform.setPosition(this.linkLengths[5], 0, 0);
        break;
      default:
        transform.identity();
    }

    return transform;
  }

  /**
   * Extract angles array from joint angles object
   */
  private extractAnglesArray(jointAngles: JointAngles): number[] {
    const angles: number[] = [];
    for (let i = 1; i <= this.config.axes.count; i++) {
      const axisKey = `axis${i}`;
      // Convert degrees to radians
      angles.push((jointAngles[axisKey] || 0) * Math.PI / 180);
    }
    return angles;
  }

  /**
   * Get workspace bounds for the robot
   */
  getWorkspaceBounds(): { min: THREE.Vector3; max: THREE.Vector3 } {
    const totalReach = this.linkLengths.reduce((sum, length) => sum + length, 0);
    
    return {
      min: new THREE.Vector3(-totalReach, -totalReach, 0),
      max: new THREE.Vector3(totalReach, totalReach, totalReach)
    };
  }

  /**
   * Check if a position is within workspace
   */
  isWithinWorkspace(position: THREE.Vector3): boolean {
    const bounds = this.getWorkspaceBounds();
    return position.x >= bounds.min.x && position.x <= bounds.max.x &&
           position.y >= bounds.min.y && position.y <= bounds.max.y &&
           position.z >= bounds.min.z && position.z <= bounds.max.z;
  }
}