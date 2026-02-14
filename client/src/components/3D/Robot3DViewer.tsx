// Main 3D Robot Viewer component using React Three Fiber
import React, { Suspense, useState, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Stats, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { Socket } from 'socket.io-client';

// Import our 3D components
import RobotModel from './RobotModel';
import ToolPath from './ToolPath';
import WorkspaceEnvelope from './WorkspaceEnvelope';
import AnimationControls from './AnimationControls';

// Import utilities
import { ForwardKinematics, JointAngles } from '../../utils/kinematics';
import { PathCalculator, GCodeProgram } from '../../utils/pathCalculation';

interface Robot3DViewerProps {
  config: any;
  socket: Socket | null;
  gcodeText?: string;
  currentPosition?: JointAngles;
  showGrid?: boolean;
  showAxes?: boolean;
  showWorkspace?: boolean;
  showToolpath?: boolean;
  isAnimating?: boolean;
  animationProgress?: number;
}

interface ViewerState {
  cameraMode: 'orbit' | 'follow' | 'top' | 'front' | 'side';
  showStats: boolean;
  showWireframe: boolean;
  robotVisible: boolean;
  pathVisible: boolean;
  workspaceVisible: boolean;
  currentPath: GCodeProgram | null;
  animationSpeed: number;
}

const Robot3DViewer: React.FC<Robot3DViewerProps> = ({
  config,
  socket,
  gcodeText = '',
  currentPosition = {},
  showGrid = true,
  showAxes = true,
  showWorkspace = true,
  showToolpath = true,
  isAnimating = false,
  animationProgress = 0
}) => {
  const [viewerState, setViewerState] = useState<ViewerState>({
    cameraMode: 'orbit',
    showStats: false,
    showWireframe: false,
    robotVisible: true,
    pathVisible: true,
    workspaceVisible: true,
    currentPath: null,
    animationSpeed: 1.0
  });

  const pathCalculatorRef = useRef<PathCalculator>(new PathCalculator());
  const kinematicsRef = useRef<ForwardKinematics | null>(null);

  // Initialize kinematics when config changes
  useEffect(() => {
    if (config) {
      kinematicsRef.current = new ForwardKinematics(config);
    }
  }, [config]);

  // Parse G-code when it changes
  useEffect(() => {
    if (gcodeText && showToolpath) {
      try {
        const program = pathCalculatorRef.current.parseGCode(gcodeText);
        setViewerState(prev => ({ ...prev, currentPath: program }));
      } catch (error) {
        console.error('Error parsing G-code:', error);
        setViewerState(prev => ({ ...prev, currentPath: null }));
      }
    } else {
      setViewerState(prev => ({ ...prev, currentPath: null }));
    }
  }, [gcodeText, showToolpath]);

  // Socket.IO integration for real-time updates
  useEffect(() => {
    if (!socket) return;

    const handlePositionUpdate = (position: JointAngles) => {
      // Position updates are handled via props, but we could add additional logic here
      console.log('Received position update:', position);
    };

    const handleGCodeUpdate = (gcode: string) => {
      console.log('Received G-code update');
    };

    socket.on('positionUpdate', handlePositionUpdate);
    socket.on('gcodeUpdate', handleGCodeUpdate);

    return () => {
      socket.off('positionUpdate', handlePositionUpdate);
      socket.off('gcodeUpdate', handleGCodeUpdate);
    };
  }, [socket]);

  const handleCameraModeChange = (mode: ViewerState['cameraMode']) => {
    setViewerState(prev => ({ ...prev, cameraMode: mode }));
  };

  const handleToggleOption = (option: keyof ViewerState) => {
    setViewerState(prev => ({
      ...prev,
      [option]: !prev[option as keyof ViewerState]
    }));
  };

  const handleAnimationSpeedChange = (speed: number) => {
    setViewerState(prev => ({ ...prev, animationSpeed: speed }));
  };

  const getCameraPosition = (): [number, number, number] => {
    switch (viewerState.cameraMode) {
      case 'top':
        return [0, 800, 0];
      case 'front':
        return [0, 200, 600];
      case 'side':
        return [600, 200, 0];
      case 'follow':
        return [300, 300, 300];
      default: // orbit
        return [400, 300, 400];
    }
  };

  const LoadingFallback = () => (
    <mesh>
      <boxGeometry args={[100, 100, 100]} />
      <meshStandardMaterial color="#cccccc" />
    </mesh>
  );

  return (
    <div className="robot-3d-viewer">
      {/* 3D Canvas */}
      <div className="canvas-container">
        <Canvas
          camera={{ 
            position: getCameraPosition(), 
            fov: 60,
            near: 1,
            far: 2000
          }}
          shadows
          gl={{ 
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance'
          }}
          style={{ width: '100%', height: '600px' }}
        >
          {/* Lighting */}
          <ambientLight intensity={0.4} />
          <directionalLight 
            position={[500, 500, 500]} 
            intensity={0.8}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-far={1000}
            shadow-camera-left={-500}
            shadow-camera-right={500}
            shadow-camera-top={500}
            shadow-camera-bottom={-500}
          />
          <pointLight position={[-500, 300, -500]} intensity={0.3} />

          {/* Environment and Controls */}
          <Environment preset="warehouse" />
          <OrbitControls 
            enablePan={viewerState.cameraMode === 'orbit'}
            enableZoom={true}
            enableRotate={viewerState.cameraMode === 'orbit'}
            minDistance={100}
            maxDistance={1500}
          />

          {/* Grid and Axes */}
          {showGrid && <Grid args={[1000, 50]} />}
          {showAxes && (
            <group>
              {/* X-axis (red) */}
              <mesh position={[50, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[2, 2, 100]} />
                <meshBasicMaterial color="#ff0000" />
              </mesh>
              {/* Y-axis (green) */}
              <mesh position={[0, 50, 0]}>
                <cylinderGeometry args={[2, 2, 100]} />
                <meshBasicMaterial color="#00ff00" />
              </mesh>
              {/* Z-axis (blue) */}
              <mesh position={[0, 0, 50]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[2, 2, 100]} />
                <meshBasicMaterial color="#0000ff" />
              </mesh>
            </group>
          )}

          {/* 3D Components */}
          <Suspense fallback={<LoadingFallback />}>
            {/* Robot Model */}
            {viewerState.robotVisible && config && (
              <RobotModel
                position={currentPosition}
                config={config}
                wireframe={viewerState.showWireframe}
                kinematics={kinematicsRef.current}
              />
            )}

            {/* Workspace Envelope */}
            {viewerState.workspaceVisible && showWorkspace && kinematicsRef.current && (
              <WorkspaceEnvelope
                kinematics={kinematicsRef.current}
                config={config}
              />
            )}

            {/* Tool Path */}
            {viewerState.pathVisible && viewerState.currentPath && (
              <ToolPath
                program={viewerState.currentPath}
                progress={animationProgress}
                isAnimating={isAnimating}
                animationSpeed={viewerState.animationSpeed}
              />
            )}
          </Suspense>

          {/* Performance Stats */}
          {viewerState.showStats && <Stats />}
        </Canvas>

        {/* Loading Overlay */}
        <Suspense fallback={
          <div className="loading-overlay">
            <div className="spinner"></div>
            <p>Loading 3D scene...</p>
          </div>
        } />
      </div>

      {/* Controls Panel */}
      <div className="controls-panel">
        {/* Camera Controls */}
        <div className="control-section">
          <h4>Camera</h4>
          <div className="button-group">
            {(['orbit', 'top', 'front', 'side', 'follow'] as const).map(mode => (
              <button
                key={mode}
                className={`btn-sm ${viewerState.cameraMode === mode ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handleCameraModeChange(mode)}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Visibility Controls */}
        <div className="control-section">
          <h4>Display</h4>
          <div className="checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={viewerState.robotVisible}
                onChange={() => handleToggleOption('robotVisible')}
              />
              Robot
            </label>
            <label>
              <input
                type="checkbox"
                checked={viewerState.pathVisible}
                onChange={() => handleToggleOption('pathVisible')}
              />
              Toolpath
            </label>
            <label>
              <input
                type="checkbox"
                checked={viewerState.workspaceVisible}
                onChange={() => handleToggleOption('workspaceVisible')}
              />
              Workspace
            </label>
            <label>
              <input
                type="checkbox"
                checked={viewerState.showWireframe}
                onChange={() => handleToggleOption('showWireframe')}
              />
              Wireframe
            </label>
            <label>
              <input
                type="checkbox"
                checked={viewerState.showStats}
                onChange={() => handleToggleOption('showStats')}
              />
              Stats
            </label>
          </div>
        </div>

        {/* Animation Controls */}
        {viewerState.currentPath && (
          <AnimationControls
            isAnimating={isAnimating}
            progress={animationProgress}
            animationSpeed={viewerState.animationSpeed}
            onSpeedChange={handleAnimationSpeedChange}
            totalSegments={viewerState.currentPath.segments.length}
          />
        )}
      </div>
    </div>
  );
};

export default Robot3DViewer;