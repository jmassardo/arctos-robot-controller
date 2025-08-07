import React, { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import axios from 'axios';

interface ManualControlProps {
  config: any;
  socket: Socket | null;
}

const ManualControl: React.FC<ManualControlProps> = ({ config, socket }) => {
  const [axisValues, setAxisValues] = useState<{ [key: string]: number }>({});
  const [manipulatorValues, setManipulatorValues] = useState<{ [key: string]: number }>({});
  const [positionName, setPositionName] = useState('');
  const [positionDelay, setPositionDelay] = useState(1000);
  const [isMoving, setIsMoving] = useState(false);
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

  // Home all axes function
  const homeAllAxes = useCallback(async () => {
    try {
      setIsMoving(true);
      const response = await axios.post('/api/home');
      
      if (response.data.success) {
        // Reset all axis values to 0 (home position)
        const homeAxes: { [key: string]: number } = {};
        for (let i = 1; i <= config.axes.count; i++) {
          homeAxes[`axis${i}`] = 0;
        }
        setAxisValues(homeAxes);
        
        console.log('Home command executed successfully');
        alert('All axes homed successfully');
      } else {
        console.error('Home command failed:', response.data.error);
        alert('Home command failed');
      }
    } catch (error) {
      console.error('Error executing home command:', error);
      alert('Error executing home command');
    } finally {
      setTimeout(() => setIsMoving(false), 2000); // Allow time for homing
    }
  }, [config.axes.count]);

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

  // Jog manipulator function
  const jogManipulator = useCallback(async (manipulator: string, deltaValue: number) => {
    const currentValue = manipulatorValues[manipulator] || 0;
    const newValue = currentValue + deltaValue;
    
    // Check limits
    const limits = config.manipulators[manipulator] || { min: 0, max: 100 };
    const clampedValue = Math.max(limits.min, Math.min(limits.max, newValue));
    
    if (clampedValue !== currentValue) {
      setIsMoving(true);
      setManipulatorValues(prev => ({ ...prev, [manipulator]: clampedValue }));
      
      try {
        await axios.post('/api/manual/move', { manipulator, value: clampedValue });
        
        // Emit real-time update via socket
        if (socket) {
          socket.emit('manualControl', { manipulator, value: clampedValue, timestamp: Date.now() });
        }
      } catch (error) {
        console.error('Error moving manipulator:', error);
      } finally {
        setIsMoving(false);
      }
    }
  }, [manipulatorValues, config.manipulators, socket]);

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
          jogAxis('axis1', -1);
          break;
        case 'ArrowRight': // X+ (Axis 1 positive)
          jogAxis('axis1', 1);
          break;
        case 'ArrowUp': // Y+ (Axis 2 positive)
          jogAxis('axis2', 1);
          break;
        case 'ArrowDown': // Y- (Axis 2 negative)
          jogAxis('axis2', -1);
          break;
        case 'PageUp': // Z+ (Axis 3 positive)
          if (config.axes.count >= 3) {
            jogAxis('axis3', 1);
          }
          break;
        case 'PageDown': // Z- (Axis 3 negative)
          if (config.axes.count >= 3) {
            jogAxis('axis3', -1);
          }
          break;
        case 'Home': // A+ (Axis 4 positive)
          if (config.axes.count >= 4) {
            jogAxis('axis4', 1);
          }
          break;
        case 'End': // A- (Axis 4 negative)
          if (config.axes.count >= 4) {
            jogAxis('axis4', -1);
          }
          break;
      }
    }
  }, [keyboardEnabled, isMoving, config.axes.count, emergencyStop, jogAxis]);

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
      // Try to get current positions from MKS57D controllers
      let currentPositions = axisValues; // Default to UI values
      
      try {
        const response = await axios.get('/api/positions/current');
        if (response.data.success && response.data.positions) {
          currentPositions = response.data.positions;
          console.log('Retrieved current positions from controllers:', currentPositions);
        }
      } catch (error) {
        console.warn('Could not read from controllers, using UI values:', error);
      }

      await axios.post('/api/positions', {
        name: positionName,
        axes: currentPositions,
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

  const homeAllAxes = async () => {
    if (isMoving) return;
    
    try {
      setIsMoving(true);
      await axios.post('/api/home', {});
      
      // Reset position display to 0 after homing
      const resetAxes: { [key: string]: number } = {};
      for (let i = 1; i <= config.axes.count; i++) {
        resetAxes[`axis${i}`] = 0;
      }
      setAxisValues(resetAxes);
      
      console.log('Home command sent to all controllers');
    } catch (error) {
      console.error('Error homing axes:', error);
      alert('Error during homing operation');
    } finally {
      setIsMoving(false);
    }
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
        <div className="emergency-controls">
          <button 
            className="btn btn-danger emergency-stop" 
            onClick={emergencyStop}
            disabled={!isMoving}
          >
            🛑 EMERGENCY STOP (ESC)
          </button>
          <button 
            className="btn btn-warning home-button" 
            onClick={homeAllAxes}
            disabled={isMoving}
          >
            🏠 HOME ALL AXES
          </button>
        </div>
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
      
      {/* Industrial-style DRO Display with Unified Controls */}
      <div className="dro-section">
        <h3>Digital Readout & Control</h3>
        <div className="dro-industrial-panel">
          <div className="dro-header">
            <div className="dro-header-cell">TYPE</div>
            <div className="dro-header-cell">POSITION</div>
            <div className="dro-header-cell">LIMITS</div>
            <div className="dro-header-cell">JOG CONTROLS</div>
            <div className="dro-header-cell">KEYS</div>
          </div>
          
          {/* Render Axes */}
          {Array.from({ length: config.axes.count }, (_, i) => {
            const axisName = `axis${i + 1}`;
            const limits = config.axes.limits[axisName] || { min: -180, max: 180 };
            const currentValue = axisValues[axisName] || 0;
            const keyHints = ['← →', '↑ ↓', 'PgUp/PgDn', 'Home/End', '', ''];
            
            return (
              <div key={axisName} className="dro-row">
                <div className="dro-cell type-cell">
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
                  <div className="jog-controls-stacked">
                    {/* Negative direction buttons */}
                    <div className="jog-direction-group">
                      <button 
                        className="jog-btn-stacked jog-negative"
                        onMouseDown={() => jogAxis(axisName, -25)}
                        disabled={isMoving || currentValue <= limits.min}
                        title={`Jog ${axisName} -25°`}
                      >
                        ⬅⬅⬅
                      </button>
                      <button 
                        className="jog-btn-stacked jog-negative"
                        onMouseDown={() => jogAxis(axisName, -10)}
                        disabled={isMoving || currentValue <= limits.min}
                        title={`Jog ${axisName} -10°`}
                      >
                        ⬅⬅
                      </button>
                      <button 
                        className="jog-btn-stacked jog-negative"
                        onMouseDown={() => jogAxis(axisName, -1)}
                        disabled={isMoving || currentValue <= limits.min}
                        title={`Jog ${axisName} -1°`}
                      >
                        ⬅
                      </button>
                    </div>
                    {/* Positive direction buttons */}
                    <div className="jog-direction-group">
                      <button 
                        className="jog-btn-stacked jog-positive"
                        onMouseDown={() => jogAxis(axisName, 1)}
                        disabled={isMoving || currentValue >= limits.max}
                        title={`Jog ${axisName} +1°`}
                      >
                        ➡
                      </button>
                      <button 
                        className="jog-btn-stacked jog-positive"
                        onMouseDown={() => jogAxis(axisName, 10)}
                        disabled={isMoving || currentValue >= limits.max}
                        title={`Jog ${axisName} +10°`}
                      >
                        ➡➡
                      </button>
                      <button 
                        className="jog-btn-stacked jog-positive"
                        onMouseDown={() => jogAxis(axisName, 25)}
                        disabled={isMoving || currentValue >= limits.max}
                        title={`Jog ${axisName} +25°`}
                      >
                        ➡➡➡
                      </button>
                    </div>
                  </div>
                </div>
                <div className="dro-cell keys-cell">
                  <span className="keyboard-hint-compact">{keyHints[i]}</span>
                </div>
              </div>
            );
          })}

          {/* Render Manipulators/Grippers */}
          {Array.from({ length: config.manipulators.count }, (_, i) => {
            const manipulatorName = `gripper${i + 1}`;
            const limits = config.manipulators[manipulatorName] || { min: 0, max: 100 };
            const currentValue = manipulatorValues[manipulatorName] || 0;
            
            return (
              <div key={manipulatorName} className="dro-row">
                <div className="dro-cell type-cell">
                  <span className="gripper-number">{i + 1}</span>
                  <span className="gripper-name">GRIP</span>
                </div>
                <div className="dro-cell position-cell">
                  <div className="dro-display-compact">
                    <span className="dro-value-compact">{currentValue.toFixed(1)}</span>
                    <span className="dro-unit-compact">%</span>
                  </div>
                </div>
                <div className="dro-cell limits-cell">
                  <span className="dro-limits-compact">{limits.min}% to {limits.max}%</span>
                </div>
                <div className="dro-cell jog-cell">
                  <div className="jog-controls-stacked">
                    {/* Negative direction buttons (close gripper) */}
                    <div className="jog-direction-group">
                      <button 
                        className="jog-btn-stacked jog-negative"
                        onMouseDown={() => jogManipulator(manipulatorName, -25)}
                        disabled={isMoving || currentValue <= limits.min}
                        title={`Close ${manipulatorName} -25%`}
                      >
                        ⬅⬅⬅
                      </button>
                      <button 
                        className="jog-btn-stacked jog-negative"
                        onMouseDown={() => jogManipulator(manipulatorName, -10)}
                        disabled={isMoving || currentValue <= limits.min}
                        title={`Close ${manipulatorName} -10%`}
                      >
                        ⬅⬅
                      </button>
                      <button 
                        className="jog-btn-stacked jog-negative"
                        onMouseDown={() => jogManipulator(manipulatorName, -5)}
                        disabled={isMoving || currentValue <= limits.min}
                        title={`Close ${manipulatorName} -5%`}
                      >
                        ⬅
                      </button>
                    </div>
                    {/* Positive direction buttons (open gripper) */}
                    <div className="jog-direction-group">
                      <button 
                        className="jog-btn-stacked jog-positive"
                        onMouseDown={() => jogManipulator(manipulatorName, 5)}
                        disabled={isMoving || currentValue >= limits.max}
                        title={`Open ${manipulatorName} +5%`}
                      >
                        ➡
                      </button>
                      <button 
                        className="jog-btn-stacked jog-positive"
                        onMouseDown={() => jogManipulator(manipulatorName, 10)}
                        disabled={isMoving || currentValue >= limits.max}
                        title={`Open ${manipulatorName} +10%`}
                      >
                        ➡➡
                      </button>
                      <button 
                        className="jog-btn-stacked jog-positive"
                        onMouseDown={() => jogManipulator(manipulatorName, 25)}
                        disabled={isMoving || currentValue >= limits.max}
                        title={`Open ${manipulatorName} +25%`}
                      >
                        ➡➡➡
                      </button>
                    </div>
                  </div>
                </div>
                <div className="dro-cell keys-cell">
                  <span className="keyboard-hint-compact">—</span>
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
            className="btn btn-primary" 
            onClick={homeAllAxes}
            disabled={isMoving}
            title="Home all axes - moves to absolute zero position using limit switches"
          >
            🏠 Home All Axes
          </button>
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