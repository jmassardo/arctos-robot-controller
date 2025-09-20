import React, { useState, useEffect } from 'react';
import { useDeviceInfo } from '../utils/mobileUtils';
import { TouchJoystick, TouchSlider, TouchButton, SwipeableView } from './MobileTouchControls';
import { MobileModal } from './MobileNavigation';

interface MobileManualControlProps {
  config: any;
  socket: any;
  onPositionSave?: (name: string, position: any) => void;
}

export const MobileManualControl: React.FC<MobileManualControlProps> = ({
  config,
  socket,
  onPositionSave
}) => {
  const [axisPositions, setAxisPositions] = useState<{ [key: string]: number }>({});
  const [manipulatorPositions, setManipulatorPositions] = useState<{ [key: string]: number }>({});
  const [activeControlMode, setActiveControlMode] = useState<'jog' | 'continuous' | 'precise'>('jog');
  const [activeView, setActiveView] = useState(0);
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false);
  const [positionName, setPositionName] = useState('');
  const [emergencyStopActive, setEmergencyStopActive] = useState(false);
  
  const deviceInfo = useDeviceInfo();

  useEffect(() => {
    if (config) {
      // Initialize axis positions
      const initialAxisPositions: { [key: string]: number } = {};
      for (let i = 0; i < config.axes.count; i++) {
        const axisKey = String.fromCharCode(65 + i); // A, B, C, etc.
        initialAxisPositions[axisKey] = 0;
      }
      setAxisPositions(initialAxisPositions);

      // Initialize manipulator positions
      const initialManipulatorPositions: { [key: string]: number } = {};
      for (let i = 0; i < config.manipulators.count; i++) {
        initialManipulatorPositions[`gripper${i + 1}`] = 0;
      }
      setManipulatorPositions(initialManipulatorPositions);
    }
  }, [config]);

  const handleJoystickMove = (axisX: string, axisY: string, x: number, y: number) => {
    if (emergencyStopActive) return;

    const newPositions = { ...axisPositions };
    
    if (activeControlMode === 'continuous') {
      // Continuous movement based on joystick position
      newPositions[axisX] += x * 0.5;
      newPositions[axisY] += y * 0.5;
    } else {
      // Direct position control
      const xRange = config?.axes?.limits?.[axisX] || { min: -100, max: 100 };
      const yRange = config?.axes?.limits?.[axisY] || { min: -100, max: 100 };
      
      newPositions[axisX] = x * (xRange.max - xRange.min) / 2;
      newPositions[axisY] = y * (yRange.max - yRange.min) / 2;
    }

    // Apply limits
    Object.keys(newPositions).forEach(axis => {
      const limits = config?.axes?.limits?.[axis] || { min: -100, max: 100 };
      newPositions[axis] = Math.max(limits.min, Math.min(limits.max, newPositions[axis]));
    });

    setAxisPositions(newPositions);
    
    if (socket) {
      socket.emit('manual-control', {
        type: 'position-update',
        axes: newPositions,
        manipulators: manipulatorPositions
      });
    }
  };

  const handleAxisJog = (axis: string, direction: number, amount: number = 1) => {
    if (emergencyStopActive) return;

    const newPositions = { ...axisPositions };
    const limits = config?.axes?.limits?.[axis] || { min: -100, max: 100 };
    
    newPositions[axis] += direction * amount;
    newPositions[axis] = Math.max(limits.min, Math.min(limits.max, newPositions[axis]));
    
    setAxisPositions(newPositions);
    
    if (socket) {
      socket.emit('manual-control', {
        type: 'jog',
        axis,
        direction,
        amount,
        newPosition: newPositions[axis]
      });
    }
  };

  const handleManipulatorControl = (manipulator: string, value: number) => {
    if (emergencyStopActive) return;

    const newPositions = { ...manipulatorPositions };
    newPositions[manipulator] = Math.max(0, Math.min(100, value));
    
    setManipulatorPositions(newPositions);
    
    if (socket) {
      socket.emit('manual-control', {
        type: 'manipulator',
        manipulator,
        value: newPositions[manipulator]
      });
    }
  };

  const handleEmergencyStop = () => {
    setEmergencyStopActive(!emergencyStopActive);
    
    if (socket) {
      socket.emit('emergency-stop', { active: !emergencyStopActive });
    }
  };

  const handleHomeAll = () => {
    if (emergencyStopActive) return;

    const homePositions: { [key: string]: number } = {};
    Object.keys(axisPositions).forEach(axis => {
      homePositions[axis] = 0;
    });
    
    setAxisPositions(homePositions);
    
    if (socket) {
      socket.emit('manual-control', {
        type: 'home-all'
      });
    }
  };

  const handleSavePosition = () => {
    if (!positionName.trim()) return;

    const currentPosition = {
      name: positionName,
      axes: { ...axisPositions },
      manipulators: { ...manipulatorPositions },
      timestamp: new Date().toISOString()
    };

    if (onPositionSave) {
      onPositionSave(positionName, currentPosition);
    }

    setPositionName('');
    setIsPositionModalOpen(false);
  };

  // Render joystick control view
  const renderJoystickView = () => (
    <div className="mobile-joystick-view">
      <div className="joystick-section">
        <h4>XY Control</h4>
        <TouchJoystick
          size={deviceInfo.isMobile ? 150 : 200}
          maxDistance={deviceInfo.isMobile ? 60 : 80}
          onMove={(x, y) => handleJoystickMove('X', 'Y', x, -y)} // Invert Y for intuitive control
          hapticEnabled={true}
          disabled={emergencyStopActive}
        />
        <div className="position-display">
          <span>X: {axisPositions.X?.toFixed(1) || '0.0'}</span>
          <span>Y: {axisPositions.Y?.toFixed(1) || '0.0'}</span>
        </div>
      </div>

      {config?.axes?.count > 2 && (
        <div className="joystick-section">
          <h4>ZA Control</h4>
          <TouchJoystick
            size={deviceInfo.isMobile ? 130 : 180}
            maxDistance={deviceInfo.isMobile ? 50 : 70}
            onMove={(x, y) => handleJoystickMove('Z', 'A', x, -y)}
            hapticEnabled={true}
            disabled={emergencyStopActive}
          />
          <div className="position-display">
            <span>Z: {axisPositions.Z?.toFixed(1) || '0.0'}</span>
            <span>A: {axisPositions.A?.toFixed(1) || '0.0'}</span>
          </div>
        </div>
      )}
    </div>
  );

  // Render individual axis control view
  const renderAxisView = () => (
    <div className="mobile-axis-view">
      {Object.keys(axisPositions).map(axis => {
        const limits = config?.axes?.limits?.[axis] || { min: -100, max: 100 };
        const jogAmounts = deviceInfo.isMobile ? [0.1, 1, 10] : [0.1, 1, 10, 50];
        
        return (
          <div key={axis} className="axis-control-section">
            <div className="axis-header">
              <h4>Axis {axis}</h4>
              <span className="axis-position">{axisPositions[axis]?.toFixed(2) || '0.00'}</span>
            </div>
            
            <div className="axis-jog-controls">
              {jogAmounts.map(amount => (
                <div key={amount} className="jog-group">
                  <TouchButton
                    onPress={() => handleAxisJog(axis, -1, amount)}
                    variant="secondary"
                    size="small"
                    disabled={emergencyStopActive}
                    hapticType="light"
                  >
                    -{amount}
                  </TouchButton>
                  <TouchButton
                    onPress={() => handleAxisJog(axis, 1, amount)}
                    variant="secondary"
                    size="small"
                    disabled={emergencyStopActive}
                    hapticType="light"
                  >
                    +{amount}
                  </TouchButton>
                </div>
              ))}
            </div>
            
            <TouchSlider
              value={axisPositions[axis] || 0}
              min={limits.min}
              max={limits.max}
              step={0.1}
              onValueChange={(value) => {
                const newPositions = { ...axisPositions };
                newPositions[axis] = value;
                setAxisPositions(newPositions);
              }}
              size={{ width: deviceInfo.isMobile ? 280 : 350, height: 40 }}
              hapticEnabled={true}
              disabled={emergencyStopActive}
              label={`${axis} Position`}
            />
          </div>
        );
      })}
    </div>
  );

  // Render manipulator control view
  const renderManipulatorView = () => (
    <div className="mobile-manipulator-view">
      {Object.keys(manipulatorPositions).map(manipulator => (
        <div key={manipulator} className="manipulator-control-section">
          <div className="manipulator-header">
            <h4>{manipulator.charAt(0).toUpperCase() + manipulator.slice(1)}</h4>
            <span className="manipulator-position">{manipulatorPositions[manipulator]?.toFixed(1) || '0.0'}%</span>
          </div>
          
          <div className="manipulator-preset-controls">
            <TouchButton
              onPress={() => handleManipulatorControl(manipulator, 0)}
              variant="danger"
              size="small"
              disabled={emergencyStopActive}
            >
              Open (0%)
            </TouchButton>
            <TouchButton
              onPress={() => handleManipulatorControl(manipulator, 50)}
              variant="secondary"
              size="small"
              disabled={emergencyStopActive}
            >
              Half (50%)
            </TouchButton>
            <TouchButton
              onPress={() => handleManipulatorControl(manipulator, 100)}
              variant="success"
              size="small"
              disabled={emergencyStopActive}
            >
              Close (100%)
            </TouchButton>
          </div>
          
          <TouchSlider
            value={manipulatorPositions[manipulator] || 0}
            min={0}
            max={100}
            step={1}
            onValueChange={(value) => handleManipulatorControl(manipulator, value)}
            size={{ width: deviceInfo.isMobile ? 280 : 350, height: 40 }}
            hapticEnabled={true}
            disabled={emergencyStopActive}
            label={`${manipulator} Position`}
          />
        </div>
      ))}
    </div>
  );

  const views = [
    { title: 'Joystick', content: renderJoystickView() },
    { title: 'Axes', content: renderAxisView() },
    { title: 'Tools', content: renderManipulatorView() }
  ];

  return (
    <div className={`mobile-manual-control ${emergencyStopActive ? 'emergency-stop-active' : ''}`}>
      {/* Emergency Stop and Control Mode */}
      <div className="mobile-control-header">
        <TouchButton
          onPress={handleEmergencyStop}
          variant={emergencyStopActive ? 'success' : 'danger'}
          size="large"
          hapticType="heavy"
        >
          {emergencyStopActive ? '▶ Resume' : '⏹ E-Stop'}
        </TouchButton>
        
        <div className="control-mode-selector">
          {['jog', 'continuous', 'precise'].map(mode => (
            <TouchButton
              key={mode}
              onPress={() => setActiveControlMode(mode as any)}
              variant={activeControlMode === mode ? 'primary' : 'secondary'}
              size="small"
              disabled={emergencyStopActive}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </TouchButton>
          ))}
        </div>
      </div>

      {/* Swipeable Views */}
      <SwipeableView
        activeIndex={activeView}
        onSwipe={(direction, newIndex) => setActiveView(newIndex)}
        swipeThreshold={60}
      >
        {views.map(view => view.content)}
      </SwipeableView>

      {/* Quick Actions */}
      <div className="mobile-quick-actions">
        <TouchButton
          onPress={handleHomeAll}
          variant="secondary"
          size="medium"
          disabled={emergencyStopActive}
          hapticType="medium"
        >
          🏠 Home All
        </TouchButton>
        
        <TouchButton
          onPress={() => setIsPositionModalOpen(true)}
          variant="primary"
          size="medium"
          disabled={emergencyStopActive}
        >
          💾 Save Position
        </TouchButton>
      </div>

      {/* Save Position Modal */}
      <MobileModal
        isOpen={isPositionModalOpen}
        onClose={() => {
          setIsPositionModalOpen(false);
          setPositionName('');
        }}
        title="Save Current Position"
        size="medium"
      >
        <div className="save-position-modal">
          <div className="current-position-summary">
            <h5>Current Position:</h5>
            <div className="position-values">
              {Object.entries(axisPositions).map(([axis, value]) => (
                <span key={axis} className="position-value">
                  {axis}: {value.toFixed(2)}
                </span>
              ))}
            </div>
          </div>
          
          <div className="position-name-input">
            <label htmlFor="positionName">Position Name:</label>
            <input
              id="positionName"
              type="text"
              value={positionName}
              onChange={(e) => setPositionName(e.target.value)}
              placeholder="Enter position name..."
              className="mobile-text-input"
            />
          </div>
          
          <div className="modal-actions">
            <TouchButton
              onPress={() => {
                setIsPositionModalOpen(false);
                setPositionName('');
              }}
              variant="secondary"
              size="medium"
            >
              Cancel
            </TouchButton>
            <TouchButton
              onPress={handleSavePosition}
              variant="primary"
              size="medium"
              disabled={!positionName.trim()}
            >
              Save Position
            </TouchButton>
          </div>
        </div>
      </MobileModal>
    </div>
  );
};

export default MobileManualControl;