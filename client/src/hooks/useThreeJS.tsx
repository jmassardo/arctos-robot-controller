// Custom React hook for Three.js setup and management
import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

export interface ThreeJSScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls?: any; // Will be populated if OrbitControls are used
}

export interface ThreeJSOptions {
  enableControls?: boolean;
  backgroundColor?: string;
  cameraPosition?: THREE.Vector3;
  cameraTarget?: THREE.Vector3;
  antialias?: boolean;
  shadowMap?: boolean;
}

export interface AnimationLoop {
  start: () => void;
  stop: () => void;
  isRunning: boolean;
}

export const useThreeJS = (
  containerRef: React.RefObject<HTMLDivElement>,
  options: ThreeJSOptions = {}
) => {
  const sceneRef = useRef<ThreeJSScene | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultOptions: ThreeJSOptions = {
    enableControls: true,
    backgroundColor: '#1a1a1a',
    cameraPosition: new THREE.Vector3(500, 500, 500),
    cameraTarget: new THREE.Vector3(0, 0, 0),
    antialias: true,
    shadowMap: true,
    ...options
  };

  // Initialize Three.js scene
  const initializeScene = useCallback(async () => {
    if (!containerRef.current || sceneRef.current) return;

    try {
      const container = containerRef.current;
      const { clientWidth: width, clientHeight: height } = container;

      // Create scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(defaultOptions.backgroundColor!);

      // Create camera
      const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 10000);
      camera.position.copy(defaultOptions.cameraPosition!);
      camera.lookAt(defaultOptions.cameraTarget!);

      // Create renderer
      const renderer = new THREE.WebGLRenderer({ 
        antialias: defaultOptions.antialias,
        alpha: true 
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      
      if (defaultOptions.shadowMap) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }

      // Add lighting
      addDefaultLighting(scene);

      // Append renderer to container
      container.appendChild(renderer.domElement);

      // Initialize controls if enabled
      let controls: any = null;
      if (defaultOptions.enableControls) {
        try {
          // Dynamically import OrbitControls to avoid SSR issues
          const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
          controls = new OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;
          controls.dampingFactor = 0.05;
          controls.enableZoom = true;
          controls.enablePan = true;
          controls.enableRotate = true;
          controls.target.copy(defaultOptions.cameraTarget!);
        } catch (controlsError) {
          console.warn('OrbitControls not available:', controlsError);
        }
      }

      sceneRef.current = {
        scene,
        camera,
        renderer,
        controls
      };

      setIsInitialized(true);
      setError(null);

    } catch (err) {
      console.error('Error initializing Three.js scene:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [containerRef, defaultOptions]);

  // Add default lighting to scene
  const addDefaultLighting = (scene: THREE.Scene) => {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    scene.add(ambientLight);

    // Main directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(500, 500, 500);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 2000;
    directionalLight.shadow.camera.left = -500;
    directionalLight.shadow.camera.right = 500;
    directionalLight.shadow.camera.top = 500;
    directionalLight.shadow.camera.bottom = -500;
    scene.add(directionalLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-300, 200, -200);
    scene.add(fillLight);

    // Hemisphere light for ambient lighting
    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x8b4513, 0.2);
    scene.add(hemisphereLight);
  };

  // Animation loop management
  const createAnimationLoop = useCallback((
    renderCallback?: (scene: ThreeJSScene, deltaTime: number) => void
  ): AnimationLoop => {
    let isRunning = false;
    let lastTime = 0;

    const animate = (currentTime: number) => {
      if (!isRunning || !sceneRef.current) return;

      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      const { scene, camera, renderer, controls } = sceneRef.current;

      // Update controls
      if (controls && controls.update) {
        controls.update();
      }

      // Call user-provided render callback
      if (renderCallback) {
        renderCallback(sceneRef.current, deltaTime);
      }

      // Render the scene
      renderer.render(scene, camera);

      if (isRunning) {
        animationIdRef.current = requestAnimationFrame(animate);
      }
    };

    return {
      start: () => {
        if (!isRunning) {
          isRunning = true;
          lastTime = performance.now();
          animationIdRef.current = requestAnimationFrame(animate);
        }
      },
      stop: () => {
        isRunning = false;
        if (animationIdRef.current !== null) {
          cancelAnimationFrame(animationIdRef.current);
          animationIdRef.current = null;
        }
      },
      get isRunning() {
        return isRunning;
      }
    };
  }, []);

  // Handle window resize
  const handleResize = useCallback(() => {
    if (!containerRef.current || !sceneRef.current) return;

    const { clientWidth: width, clientHeight: height } = containerRef.current;
    const { camera, renderer } = sceneRef.current;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }, []);

  // Setup resize observer
  useEffect(() => {
    if (!containerRef.current || !isInitialized) return;

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [handleResize, isInitialized]);

  // Initialize scene on mount
  useEffect(() => {
    if (containerRef.current && !sceneRef.current) {
      initializeScene();
    }

    // Cleanup on unmount
    return () => {
      if (sceneRef.current) {
        const { renderer } = sceneRef.current;
        
        // Stop animation
        if (animationIdRef.current !== null) {
          cancelAnimationFrame(animationIdRef.current);
        }

        // Remove renderer from DOM
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }

        // Dispose of resources
        renderer.dispose();
      }
      
      sceneRef.current = null;
      setIsInitialized(false);
    };
  }, [initializeScene]);

  // Utility functions
  const addObject = useCallback((object: THREE.Object3D) => {
    if (sceneRef.current) {
      sceneRef.current.scene.add(object);
    }
  }, []);

  const removeObject = useCallback((object: THREE.Object3D) => {
    if (sceneRef.current) {
      sceneRef.current.scene.remove(object);
    }
  }, []);

  const clearScene = useCallback(() => {
    if (sceneRef.current) {
      const { scene } = sceneRef.current;
      
      // Remove all objects except lights
      const objectsToRemove = scene.children.filter(
        child => !(child instanceof THREE.Light)
      );
      
      objectsToRemove.forEach(object => {
        scene.remove(object);
        
        // Dispose of geometry and materials
        if (object instanceof THREE.Mesh) {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach(material => material.dispose());
            } else {
              object.material.dispose();
            }
          }
        }
      });
    }
  }, []);

  const setCameraPosition = useCallback((position: THREE.Vector3) => {
    if (sceneRef.current) {
      sceneRef.current.camera.position.copy(position);
    }
  }, []);

  const setCameraTarget = useCallback((target: THREE.Vector3) => {
    if (sceneRef.current) {
      sceneRef.current.camera.lookAt(target);
      if (sceneRef.current.controls && sceneRef.current.controls.target) {
        sceneRef.current.controls.target.copy(target);
      }
    }
  }, []);

  return {
    scene: sceneRef.current,
    isInitialized,
    error,
    createAnimationLoop,
    addObject,
    removeObject,
    clearScene,
    setCameraPosition,
    setCameraTarget,
    handleResize
  };
};