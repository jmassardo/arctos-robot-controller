// Geometry utilities for 3D robot visualization
import * as THREE from 'three';

export interface RobotGeometry {
  base: THREE.BufferGeometry;
  links: THREE.BufferGeometry[];
  joints: THREE.BufferGeometry[];
  endEffector: THREE.BufferGeometry;
}

export interface LinkDimensions {
  length: number;
  radius: number;
  color: string;
}

export interface JointDimensions {
  radius: number;
  height: number;
  color: string;
}

export class GeometryUtils {
  /**
   * Create robot geometry for visualization
   */
  static createRobotGeometry(): RobotGeometry {
    const linkDimensions: LinkDimensions[] = [
      { length: 150, radius: 15, color: '#2c3e50' }, // Base link
      { length: 250, radius: 12, color: '#3498db' }, // Upper arm
      { length: 200, radius: 10, color: '#e74c3c' }, // Forearm
      { length: 150, radius: 8, color: '#f39c12' },  // Wrist link
      { length: 100, radius: 6, color: '#9b59b6' },  // Wrist
      { length: 80, radius: 5, color: '#1abc9c' }    // End effector
    ];

    const jointDimensions: JointDimensions[] = [
      { radius: 20, height: 30, color: '#34495e' }, // Base joint
      { radius: 16, height: 25, color: '#34495e' }, // Shoulder
      { radius: 14, height: 20, color: '#34495e' }, // Elbow
      { radius: 12, height: 18, color: '#34495e' }, // Wrist 1
      { radius: 10, height: 15, color: '#34495e' }, // Wrist 2
      { radius: 8, height: 12, color: '#34495e' }   // Wrist 3
    ];

    return {
      base: this.createBase(),
      links: linkDimensions.map(dim => this.createLink(dim)),
      joints: jointDimensions.map(dim => this.createJoint(dim)),
      endEffector: this.createEndEffector()
    };
  }

  /**
   * Create base geometry
   */
  private static createBase(): THREE.BufferGeometry {
    const geometry = new THREE.CylinderGeometry(30, 40, 50, 16);
    return geometry;
  }

  /**
   * Create link geometry
   */
  private static createLink(dimensions: LinkDimensions): THREE.BufferGeometry {
    const geometry = new THREE.CylinderGeometry(
      dimensions.radius,
      dimensions.radius,
      dimensions.length,
      12
    );
    
    // Rotate to align with X-axis (default is Y-axis)
    geometry.rotateZ(Math.PI / 2);
    geometry.translate(dimensions.length / 2, 0, 0);
    
    return geometry;
  }

  /**
   * Create joint geometry
   */
  private static createJoint(dimensions: JointDimensions): THREE.BufferGeometry {
    const geometry = new THREE.CylinderGeometry(
      dimensions.radius,
      dimensions.radius,
      dimensions.height,
      16
    );
    return geometry;
  }

  /**
   * Create end effector geometry
   */
  private static createEndEffector(): THREE.BufferGeometry {
    // Create a simple gripper-like end effector
    const group = new THREE.Group();
    
    // Main body
    const bodyGeometry = new THREE.BoxGeometry(30, 15, 15);
    const body = new THREE.Mesh(bodyGeometry);
    group.add(body);
    
    // Gripper fingers
    const fingerGeometry = new THREE.BoxGeometry(20, 3, 8);
    const finger1 = new THREE.Mesh(fingerGeometry);
    finger1.position.set(25, 6, 0);
    group.add(finger1);
    
    const finger2 = new THREE.Mesh(fingerGeometry);
    finger2.position.set(25, -6, 0);
    group.add(finger2);
    
    // Convert group to geometry (simplified approach)
    const geometry = new THREE.BoxGeometry(50, 20, 15);
    geometry.translate(25, 0, 0);
    
    return geometry;
  }

  /**
   * Create coordinate system axes
   */
  static createCoordinateSystem(size: number = 100): THREE.Group {
    const group = new THREE.Group();
    
    // X-axis (red)
    const xGeometry = new THREE.CylinderGeometry(1, 1, size, 8);
    const xMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const xAxis = new THREE.Mesh(xGeometry, xMaterial);
    xAxis.rotation.z = -Math.PI / 2;
    xAxis.position.x = size / 2;
    group.add(xAxis);
    
    // Y-axis (green)
    const yGeometry = new THREE.CylinderGeometry(1, 1, size, 8);
    const yMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const yAxis = new THREE.Mesh(yGeometry, yMaterial);
    yAxis.position.y = size / 2;
    group.add(yAxis);
    
    // Z-axis (blue)
    const zGeometry = new THREE.CylinderGeometry(1, 1, size, 8);
    const zMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const zAxis = new THREE.Mesh(zGeometry, zMaterial);
    zAxis.rotation.x = Math.PI / 2;
    zAxis.position.z = size / 2;
    group.add(zAxis);
    
    // Add axis labels (simplified with small spheres)
    const labelGeometry = new THREE.SphereGeometry(3, 8, 8);
    
    const xLabel = new THREE.Mesh(labelGeometry, xMaterial);
    xLabel.position.set(size, 0, 0);
    group.add(xLabel);
    
    const yLabel = new THREE.Mesh(labelGeometry, yMaterial);
    yLabel.position.set(0, size, 0);
    group.add(yLabel);
    
    const zLabel = new THREE.Mesh(labelGeometry, zMaterial);
    zLabel.position.set(0, 0, size);
    group.add(zLabel);
    
    return group;
  }

  /**
   * Create workspace bounds visualization
   */
  static createWorkspaceBounds(min: THREE.Vector3, max: THREE.Vector3): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    
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
      vertices.push(...corners[edge[0]], ...corners[edge[1]]);
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    
    const material = new THREE.LineBasicMaterial({ 
      color: 0x888888, 
      transparent: true, 
      opacity: 0.3 
    });
    
    return new THREE.LineSegments(geometry, material);
  }

  /**
   * Create grid plane
   */
  static createGridPlane(size: number = 500, divisions: number = 20): THREE.Group {
    const group = new THREE.Group();
    
    // Create grid
    const gridHelper = new THREE.GridHelper(size, divisions, 0x444444, 0x222222);
    group.add(gridHelper);
    
    // Create ground plane
    const planeGeometry = new THREE.PlaneGeometry(size, size);
    const planeMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x333333, 
      transparent: true, 
      opacity: 0.1,
      side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    group.add(plane);
    
    return group;
  }

  /**
   * Create tool path visualization geometry
   */
  static createToolPath(points: THREE.Vector3[], color: string = '#4ecdc4'): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    
    if (points.length < 2) return geometry;
    
    const vertices = [];
    for (const point of points) {
      vertices.push(point.x, point.y, point.z);
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    
    return geometry;
  }

  /**
   * Create progress indicator for path execution
   */
  static createProgressIndicator(radius: number = 5): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(radius, 16, 16);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0xffff00,
      transparent: true,
      opacity: 0.8
    });
    
    return new THREE.Mesh(geometry, material);
  }

  /**
   * Calculate optimal camera position for viewing the scene
   */
  static calculateCameraPosition(bounds: { min: THREE.Vector3; max: THREE.Vector3 }): THREE.Vector3 {
    const center = bounds.min.clone().add(bounds.max).multiplyScalar(0.5);
    const size = bounds.max.clone().sub(bounds.min);
    const maxDimension = Math.max(size.x, size.y, size.z);
    
    const distance = maxDimension * 2;
    return new THREE.Vector3(
      center.x + distance * 0.7,
      center.y + distance * 0.7,
      center.z + distance * 0.5
    );
  }

  /**
   * Create material with specified properties
   */
  static createMaterial(color: string | number, options: {
    transparent?: boolean;
    opacity?: number;
    wireframe?: boolean;
    metalness?: number;
    roughness?: number;
  } = {}): THREE.Material {
    return new THREE.MeshStandardMaterial({
      color,
      transparent: options.transparent || false,
      opacity: options.opacity || 1.0,
      wireframe: options.wireframe || false,
      metalness: options.metalness || 0.1,
      roughness: options.roughness || 0.8
    });
  }

  /**
   * Animate between two positions
   */
  static interpolateVector3(start: THREE.Vector3, end: THREE.Vector3, t: number): THREE.Vector3 {
    return start.clone().lerp(end, t);
  }

  /**
   * Convert color string to THREE.Color
   */
  static parseColor(color: string): THREE.Color {
    return new THREE.Color(color);
  }
}