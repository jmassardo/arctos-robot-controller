import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import axios from 'axios';

interface ManualControlProps {
  config: any;
  socket: Socket | null;
}

const ManualControl: React.FC<ManualControlProps> = ({ config, socket }) => {
  const [axisValues, setAxisValues] = useState<{ [key: string]: number }>({});
  const [manipulatorValues, setManipulatorValues] = useState<{ [key: string]: number }>({});
  const [isRecording, setIsRecording] = useState(false);
  const [positionName, setPositionName] = useState('');
  const [positionDelay, setPositionDelay] = useState(1000);

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

  const handleAxisChange = async (axis: string, value: number) => {
    setAxisValues(prev => ({ ...prev, [axis]: value }));
    
    try {
      await axios.post('/api/manual/move', { axis, value });
      
      // Emit real-time update via socket
      if (socket) {
        socket.emit('manualControl', { axis, value, timestamp: Date.now() });
      }
    } catch (error) {
      console.error('Error moving axis:', error);
    }
  };

  const handleManipulatorChange = async (manipulator: string, value: number) => {
    setManipulatorValues(prev => ({ ...prev, [manipulator]: value }));
    
    try {
      await axios.post('/api/manual/move', { manipulator, value });
      
      // Emit real-time update via socket
      if (socket) {
        socket.emit('manualControl', { manipulator, value, timestamp: Date.now() });
      }
    } catch (error) {
      console.error('Error moving manipulator:', error);
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
      setIsRecording(false);
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
      <p>Use the controls below to manually position the robotic arm axes and manipulators.</p>
      
      <div className="control-grid">
        <div className="control-section">
          <h3>Axis Control ({config.axes.count} axes)</h3>
          {Array.from({ length: config.axes.count }, (_, i) => {
            const axisName = `axis${i + 1}`;
            const limits = config.axes.limits[axisName] || { min: -180, max: 180 };
            
            return (
              <div key={axisName} className="axis-control">
                <label htmlFor={axisName}>
                  Axis {i + 1} ({limits.min}° to {limits.max}°)
                </label>
                <input
                  type="range"
                  id={axisName}
                  min={limits.min}
                  max={limits.max}
                  value={axisValues[axisName] || 0}
                  onChange={(e) => handleAxisChange(axisName, parseInt(e.target.value))}
                />
                <div className="axis-value">{axisValues[axisName] || 0}°</div>
              </div>
            );
          })}
          
          <div className="button-group">
            <button className="btn btn-secondary" onClick={resetAllAxes}>
              Reset All Axes
            </button>
          </div>
        </div>

        <div className="control-section">
          <h3>Manipulator Control ({config.manipulators.count} manipulators)</h3>
          {Array.from({ length: config.manipulators.count }, (_, i) => {
            const manipulatorName = `gripper${i + 1}`;
            const limits = config.manipulators[manipulatorName] || { min: 0, max: 100 };
            
            return (
              <div key={manipulatorName} className="axis-control">
                <label htmlFor={manipulatorName}>
                  Gripper {i + 1} ({limits.min}% to {limits.max}%)
                </label>
                <input
                  type="range"
                  id={manipulatorName}
                  min={limits.min}
                  max={limits.max}
                  value={manipulatorValues[manipulatorName] || 0}
                  onChange={(e) => handleManipulatorChange(manipulatorName, parseInt(e.target.value))}
                />
                <div className="axis-value">{manipulatorValues[manipulatorName] || 0}%</div>
              </div>
            );
          })}
          
          <div className="button-group">
            <button className="btn btn-secondary" onClick={resetAllManipulators}>
              Reset All Manipulators
            </button>
          </div>
        </div>
      </div>

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
          />
        </div>
        
        <div className="button-group">
          <button 
            className="btn btn-success" 
            onClick={saveCurrentPosition}
            disabled={!positionName.trim()}
          >
            Save Current Position
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManualControl;