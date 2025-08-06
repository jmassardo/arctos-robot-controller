import React, { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import axios from 'axios';

interface ManualControlProps {
  config: any;
  socket: Socket | null;
}

interface JogSettings {
  stepSize: number;
  speed: number;
}

const ManualControl: React.FC<ManualControlProps> = ({ config, socket }) => {
  const [axisValues, setAxisValues] = useState<{ [key: string]: number }>({});
  const [manipulatorValues, setManipulatorValues] = useState<{ [key: string]: number }>({});
  const [positionName, setPositionName] = useState('');
  const [positionDelay, setPositionDelay] = useState(1000);
  const [isMoving, setIsMoving] = useState(false);
  const [jogSettings, setJogSettings] = useState<JogSettings>({
    stepSize: 1.0,
    speed: 100
  });
  const [keyboardEnabled, setKeyboardEnabled] = useState(true);

  useEffect(() => {
    // Initialize axis values to 0
    const initialAxes: { [key: string]: number } = {};
    for (let i = 1; i <= config.axes.count; i++) {
      initialAxes[`axis${i}`] = 0;
    }
    setAxisValues(initialAxes);

    // Initialize manipulator values to 0
    const initialManipulators: { [key: string]: number } = {};
    for (let i = 1; i <= config.manipulators.count; i++) {
      initialManipulators[`gripper${i}`] = 0;
    }
    setManipulatorValues(initialManipulators);
  }, [config]);

  // Emergency stop function
  const emergencyStop = useCallback(async () => {
    try {
      setIsMoving(false);
      await axios.post('/api/emergency-stop');
      
      if (socket) {
        socket.emit('emergencyStop', { timestamp: Date.now() });
      }
      
      console.log('Emergency stop triggered');
    } catch (error) {
      console.error('Error triggering emergency stop:', error);
    }
  }, [socket]);

  // Jog axis function
  const jogAxis = useCallback(async (axis: string, deltaValue: number) => {
    const currentValue = axisValues[axis] || 0;
    const newValue = currentValue + deltaValue;
    
    // Check limits
    const limits = config.axes.limits[axis] || { min: -180, max: 180 };
    const clampedValue = Math.max(limits.min, Math.min(limits.max, newValue));
    
    if (clampedValue !== currentValue) {
      setIsMoving(true);
      setAxisValues(prev => ({ ...prev, [axis]: clampedValue }));
      
      try {
        await axios.post('/api/manual/move', { axis, value: clampedValue });
        
        // Emit real-time update via socket
        if (socket) {
          socket.emit('manualControl', { axis, value: clampedValue, timestamp: Date.now() });
        }
      } catch (error) {
        console.error('Error moving axis:', error);
      } finally {
        setIsMoving(false);
      }
    }
  }, [axisValues, config.axes.limits, socket]);

  // Keyboard event handler
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!keyboardEnabled) return;
    
    // Emergency stop on ESC key
    if (event.key === 'Escape') {
      event.preventDefault();
      emergencyStop();
      return;
    }
    
    // Prevent default for our jog keys
    const jogKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'];
    if (jogKeys.includes(event.code)) {
      event.preventDefault();
    }
    
    // Jog controls (only if not currently moving)
    if (!isMoving) {
      switch (event.code) {
        case 'ArrowLeft': // X- (Axis 1 negative)
          jogAxis('axis1', -jogSettings.stepSize);
          break;
        case 'ArrowRight': // X+ (Axis 1 positive)
          jogAxis('axis1', jogSettings.stepSize);
          break;
        case 'ArrowUp': // Y+ (Axis 2 positive)
          jogAxis('axis2', jogSettings.stepSize);
          break;
        case 'ArrowDown': // Y- (Axis 2 negative)
          jogAxis('axis2', -jogSettings.stepSize);
          break;
        case 'PageUp': // Z+ (Axis 3 positive)
          if (config.axes.count >= 3) {
            jogAxis('axis3', jogSettings.stepSize);
          }
          break;
        case 'PageDown': // Z- (Axis 3 negative)
          if (config.axes.count >= 3) {
            jogAxis('axis3', -jogSettings.stepSize);
          }
          break;
        case 'Home': // A+ (Axis 4 positive)
          if (config.axes.count >= 4) {
            jogAxis('axis4', jogSettings.stepSize);
          }
          break;
        case 'End': // A- (Axis 4 negative)
          if (config.axes.count >= 4) {
            jogAxis('axis4', -jogSettings.stepSize);
          }
          break;
      }
    }
  }, [keyboardEnabled, isMoving, jogSettings.stepSize, config.axes.count, emergencyStop, jogAxis]);

  useEffect(() => {
    // Add keyboard event listeners
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  const handleAxisChange = async (axis: string, value: number) => {
    setAxisValues(prev => ({ ...prev, [axis]: value }));
    
    try {
      setIsMoving(true);
      await axios.post('/api/manual/move', { axis, value });
      
      // Emit real-time update via socket
      if (socket) {
        socket.emit('manualControl', { axis, value, timestamp: Date.now() });
      }
    } catch (error) {
      console.error('Error moving axis:', error);
    } finally {
      setIsMoving(false);
    }
  };

  const handleManipulatorChange = async (manipulator: string, value: number) => {
    setManipulatorValues(prev => ({ ...prev, [manipulator]: value }));
    
    try {
      setIsMoving(true);
      await axios.post('/api/manual/move', { manipulator, value });
      
      // Emit real-time update via socket
      if (socket) {
        socket.emit('manualControl', { manipulator, value, timestamp: Date.now() });
      }
    } catch (error) {
      console.error('Error moving manipulator:', error);
    } finally {
      setIsMoving(false);
    }
  };

  const saveCurrentPosition = async () => {
    if (!positionName.trim()) {
      alert('Please enter a position name');
      return;
    }

    try {
      await axios.post('/api/positions', {
        name: positionName,
        axes: axisValues,
        manipulators: manipulatorValues,
        delay: positionDelay
      });
      
      setPositionName('');
      alert('Position saved successfully!');
    } catch (error) {
      console.error('Error saving position:', error);
      alert('Error saving position');
    }
  };

  const resetAllAxes = () => {
    const resetAxes: { [key: string]: number } = {};
    for (let i = 1; i <= config.axes.count; i++) {
      resetAxes[`axis${i}`] = 0;
      handleAxisChange(`axis${i}`, 0);
    }
    setAxisValues(resetAxes);
  };

  const resetAllManipulators = () => {
    const resetManipulators: { [key: string]: number } = {};
    for (let i = 1; i <= config.manipulators.count; i++) {
      resetManipulators[`gripper${i}`] = 0;
      handleManipulatorChange(`gripper${i}`, 0);
    }
    setManipulatorValues(resetManipulators);
  };

  return (
    <div>
      <h2>Manual Control</h2>
      <p>Use the jog buttons or keyboard shortcuts to manually position the robotic arm axes and manipulators.</p>
      
      {/* Emergency Stop and Status */}
      <div className="emergency-section">
        <button 
          className="btn btn-danger emergency-stop" 
          onClick={emergencyStop}
          disabled={!isMoving}
        >
          🛑 EMERGENCY STOP (ESC)
        </button>
        <div className="status-indicators">
          <span className={`status-indicator ${isMoving ? 'status-moving' : 'status-idle'}`}>
            {isMoving ? 'MOVING' : 'IDLE'}
          </span>
          <span className={`status-indicator ${keyboardEnabled ? 'status-keyboard-on' : 'status-keyboard-off'}`}>
            KEYBOARD: {keyboardEnabled ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>

      {/* Jog Settings */}
      <div className="jog-settings">
        <h3>Jog Settings</h3>
        <div className="settings-row">
          <div className="form-group">
            <label>Step Size (°):</label>
            <select 
              value={jogSettings.stepSize} 
              onChange={(e) => setJogSettings(prev => ({ ...prev, stepSize: parseFloat(e.target.value) }))}
              className="form-control"
            >
              <option value={0.1}>0.1°</option>
              <option value={0.5}>0.5°</option>
              <option value={1.0}>1.0°</option>
              <option value={5.0}>5.0°</option>
              <option value={10.0}>10.0°</option>
            </select>
          </div>
          <div className="form-group">
            <label>
              <input 
                type="checkbox" 
                checked={keyboardEnabled} 
                onChange={(e) => setKeyboardEnabled(e.target.checked)}
              />
              Enable Keyboard Shortcuts
            </label>
          </div>
        </div>
      </div>
      
      {/* Industrial-style DRO Display */}
      <div className="dro-section">
        <h3>Digital Readout & Axis Control</h3>
        <div className="dro-industrial-panel">
          <div className="dro-header">
            <div className="dro-header-cell">AXIS</div>
            <div className="dro-header-cell">POSITION</div>
            <div className="dro-header-cell">LIMITS</div>
            <div className="dro-header-cell">JOG</div>
            <div className="dro-header-cell">KEYS</div>
          </div>
          {Array.from({ length: config.axes.count }, (_, i) => {
            const axisName = `axis${i + 1}`;
            const limits = config.axes.limits[axisName] || { min: -180, max: 180 };
            const currentValue = axisValues[axisName] || 0;
            const keyHints = ['← →', '↑ ↓', 'PgUp/PgDn', 'Home/End', '', ''];
            
            return (
              <div key={axisName} className="dro-row">
                <div className="dro-cell axis-cell">
                  <span className="axis-number">{i + 1}</span>
                  <span className="axis-name">{['X', 'Y', 'Z', 'A', 'B', 'C'][i]}</span>
                </div>
                <div className="dro-cell position-cell">
                  <div className="dro-display-compact">
                    <span className="dro-value-compact">{currentValue.toFixed(3)}</span>
                    <span className="dro-unit-compact">°</span>
                  </div>
                </div>
                <div className="dro-cell limits-cell">
                  <span className="dro-limits-compact">{limits.min}° to {limits.max}°</span>
                </div>
                <div className="dro-cell jog-cell">
                  <div className="jog-controls-compact">
                    <button 
                      className="jog-btn-compact jog-minus-compact"
                      onMouseDown={() => jogAxis(axisName, -jogSettings.stepSize)}
                      disabled={isMoving || currentValue <= limits.min}
                      title={`Jog ${axisName} negative`}
                    >
                      −
                    </button>
                    <button 
                      className="jog-btn-compact jog-plus-compact"
                      onMouseDown={() => jogAxis(axisName, jogSettings.stepSize)}
                      disabled={isMoving || currentValue >= limits.max}
                      title={`Jog ${axisName} positive`}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="dro-cell keys-cell">
                  <span className="keyboard-hint-compact">{keyHints[i]}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Manipulator Control */}
      <div className="manipulator-section">
        <h3>Manipulator Control ({config.manipulators.count} manipulators)</h3>
        <div className="manipulator-grid">
          {Array.from({ length: config.manipulators.count }, (_, i) => {
            const manipulatorName = `gripper${i + 1}`;
            const limits = config.manipulators[manipulatorName] || { min: 0, max: 100 };
            const currentValue = manipulatorValues[manipulatorName] || 0;
            
            return (
              <div key={manipulatorName} className="manipulator-control">
                <div className="manipulator-header">
                  <span className="manipulator-label">GRIPPER {i + 1}</span>
                </div>
                <div className="dro-display-compact manipulator-dro">
                  <span className="dro-value-compact">{currentValue.toFixed(1)}</span>
                  <span className="dro-unit-compact">%</span>
                </div>
                <div className="dro-limits">
                  {limits.min}% to {limits.max}%
                </div>
                <div className="manipulator-buttons">
                  <button 
                    className="btn btn-secondary"
                    onClick={() => handleManipulatorChange(manipulatorName, 0)}
                    disabled={isMoving}
                  >
                    Open
                  </button>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => handleManipulatorChange(manipulatorName, 50)}
                    disabled={isMoving}
                  >
                    50%
                  </button>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => handleManipulatorChange(manipulatorName, 100)}
                    disabled={isMoving}
                  >
                    Close
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reset Controls */}
      <div className="reset-section">
        <h3>Reset Controls</h3>
        <div className="button-group">
          <button 
            className="btn btn-secondary" 
            onClick={resetAllAxes}
            disabled={isMoving}
          >
            Reset All Axes
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={resetAllManipulators}
            disabled={isMoving}
          >
            Reset All Manipulators
          </button>
        </div>
      </div>

      {/* Position Recording */}
      <div className="control-section" style={{ marginTop: '30px' }}>
        <h3>Position Recording</h3>
        <p>Save the current arm position for later replay.</p>
        
        <div className="form-group">
          <label htmlFor="positionName">Position Name:</label>
          <input
            type="text"
            id="positionName"
            className="form-control"
            value={positionName}
            onChange={(e) => setPositionName(e.target.value)}
            placeholder="Enter a name for this position"
            disabled={isMoving}
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="positionDelay">Delay (ms):</label>
          <input
            type="number"
            id="positionDelay"
            className="form-control"
            value={positionDelay}
            onChange={(e) => setPositionDelay(parseInt(e.target.value))}
            min="0"
            step="100"
            disabled={isMoving}
          />
        </div>
        
        <div className="button-group">
          <button 
            className="btn btn-success" 
            onClick={saveCurrentPosition}
            disabled={!positionName.trim() || isMoving}
          >
            Save Current Position
          </button>
        </div>
      </div>

      {/* Keyboard Shortcuts Help */}
      <div className="keyboard-help">
        <h3>Keyboard Shortcuts</h3>
        <div className="shortcuts-grid">
          <div className="shortcut-item">
            <kbd>←</kbd> <kbd>→</kbd> <span>Jog Axis 1 (X)</span>
          </div>
          <div className="shortcut-item">
            <kbd>↑</kbd> <kbd>↓</kbd> <span>Jog Axis 2 (Y)</span>
          </div>
          <div className="shortcut-item">
            <kbd>PgUp</kbd> <kbd>PgDn</kbd> <span>Jog Axis 3 (Z)</span>
          </div>
          <div className="shortcut-item">
            <kbd>Home</kbd> <kbd>End</kbd> <span>Jog Axis 4 (A)</span>
          </div>
          <div className="shortcut-item emergency">
            <kbd>ESC</kbd> <span>Emergency Stop</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManualControl;