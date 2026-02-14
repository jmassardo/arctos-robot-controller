import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import axios from 'axios';
import InlineHelp from './InlineHelp';

interface GCodeControlProps {
  socket: Socket | null;
}

interface GCodeStatus {
  status: 'idle' | 'executing' | 'completed' | 'error' | 'stopping' | 'stopped';
  progress: number;
  message?: string;
  error?: string;
  currentLine?: number;
  totalLines?: number;
  coordinateSystem?: string;
  currentPlane?: string;
}

interface CoordinateSystemInfo {
  active: string;
  offsets: Record<string, { x: number; y: number; z: number; a: number; b: number; c: number }>;
  currentOffset: { x: number; y: number; z: number; a: number; b: number; c: number };
}

const GCodeControl: React.FC<GCodeControlProps> = ({ socket }) => {
  const [gcodeInput, setGcodeInput] = useState('');
  const [gcodeHistory, setGcodeHistory] = useState<string[]>([]);
  const [status, setStatus] = useState<GCodeStatus>({ status: 'idle', progress: 0 });
  const [isExecuting, setIsExecuting] = useState(false);
  const [coordinateSystemInfo, setCoordinateSystemInfo] = useState<CoordinateSystemInfo | null>(null);
  const [validationErrors, setValidationErrors] = useState<Array<{line: number, message: string, severity: string}>>([]);

  useEffect(() => {
    if (socket) {
      socket.on('gcodeStatus', (statusUpdate: GCodeStatus) => {
        setStatus(statusUpdate);
        
        if (statusUpdate.status === 'completed' || statusUpdate.status === 'error') {
          setIsExecuting(false);
        }
      });

      // Load coordinate system information on startup
      loadCoordinateSystemInfo();
    }

    return () => {
      if (socket) {
        socket.off('gcodeStatus');
      }
    };
  }, [socket]);

  const loadCoordinateSystemInfo = async () => {
    try {
      const response = await axios.get('/api/gcode/coordinate-systems');
      if (response.data.success) {
        setCoordinateSystemInfo(response.data.coordinateSystemInfo);
      }
    } catch (error) {
      console.error('Error loading coordinate system info:', error);
    }
  };

  const validateGCode = async (gcode: string) => {
    try {
      const response = await axios.post('/api/gcode/validate', { gcode });
      if (response.data.success) {
        setValidationErrors(response.data.errors || []);
        return response.data.valid;
      }
    } catch (error) {
      console.error('Error validating G-code:', error);
    }
    return true;
  };

  const executeGCode = async () => {
    if (!gcodeInput.trim()) {
      alert('Please enter G-code commands');
      return;
    }

    // Validate G-code before execution
    const isValid = await validateGCode(gcodeInput);
    if (!isValid && validationErrors.length > 0) {
      const errorMessages = validationErrors
        .filter(e => e.severity === 'error')
        .map(e => `Line ${e.line}: ${e.message}`)
        .join('\n');
      
      if (errorMessages && !window.confirm(`G-code has validation errors:\n${errorMessages}\n\nDo you want to execute anyway?`)) {
        return;
      }
    }

    try {
      setIsExecuting(true);
      setStatus({ status: 'executing', progress: 0 });
      
      const response = await axios.post('/api/gcode/execute', {
        gcode: gcodeInput
      });

      if (response.data.success) {
        // Add to history
        setGcodeHistory(prev => [gcodeInput, ...prev.slice(0, 9)]); // Keep last 10
        console.log('G-code execution started');
      } else {
        setStatus({ status: 'error', progress: 0, message: response.data.error });
        setIsExecuting(false);
      }
    } catch (error) {
      console.error('Error executing G-code:', error);
      setStatus({ status: 'error', progress: 0, message: 'Failed to execute G-code' });
      setIsExecuting(false);
    }
  };

  const loadSampleGCode = () => {
    const sampleGCode = `; Advanced G-code sample with circular interpolation
G21 ; Set units to millimeters
G90 ; Absolute positioning
G54 ; Select work coordinate system 1
G17 ; Select XY plane
G28 ; Home all axes

; Move to starting position
G1 X100 Y100 Z50 F1000
G1 Z20 F500

; Pick up operation
M106 ; Activate gripper
G4 P1000 ; Wait 1 second

; Circular interpolation examples
G1 Z50 F500
; Quarter circle clockwise
G2 X150 Y150 I50 J0 F800
; Quarter circle counter-clockwise  
G3 X100 Y200 I-50 J0 F800
; Arc using radius parameter
G2 X50 Y150 R50 F800
; Return to start of arc sequence
G1 X100 Y100 F1000

; Move to different coordinate system
G55 ; Select work coordinate system 2
G1 X0 Y0 Z30 F1000

; Drop operation
G1 Z20 F500
M107 ; Deactivate gripper
G4 P1000 ; Wait 1 second

; Return to home
G1 Z50 F500
G54 ; Return to coordinate system 1
G28 ; Home all axes

M2 ; End program`;
    
    setGcodeInput(sampleGCode);
  };

  const clearGCode = () => {
    setGcodeInput('');
    setStatus({ status: 'idle', progress: 0 });
  };

  const loadFromHistory = (historicalGCode: string) => {
    setGcodeInput(historicalGCode);
  };

  const stopExecution = async () => {
    console.log('Stop execution requested');
    setIsExecuting(false);
    setStatus({ status: 'stopping', progress: 0 });
    
    try {
      // Send stop command to server
      await axios.post('/api/gcode/stop');
      setStatus({ status: 'stopped', progress: 0 });
    } catch (error) {
      console.error('Error stopping G-code execution:', error);
      setStatus({ status: 'error', progress: 0, error: 'Failed to stop execution' });
    }
  };

  return (
    <div>
      <h2>G-Code Control</h2>
      <p>Enter G-code commands to automatically control the robotic arm.</p>

      <div className="control-grid">
        <div className="control-section">
          <h3>
            G-Code Editor
            <InlineHelp topic="gcode-basics" position="right" size="small" />
          </h3>
          
          <div className="form-group">
            <label htmlFor="gcodeInput">G-Code Commands:</label>
            <textarea
              id="gcodeInput"
              className="form-control textarea"
              value={gcodeInput}
              onChange={(e) => {
                setGcodeInput(e.target.value);
                // Clear validation errors when text changes
                setValidationErrors([]);
              }}
              placeholder="Enter your G-code commands here..."
              rows={15}
              disabled={isExecuting}
            />
          </div>

          {validationErrors.length > 0 && (
            <div className="form-group">
              <h4>Validation Issues</h4>
              <div className="validation-errors" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                {validationErrors.map((error, index) => (
                  <div 
                    key={index} 
                    className={`alert ${error.severity === 'error' ? 'alert-danger' : 'alert-warning'}`}
                    style={{ padding: '5px 10px', margin: '2px 0', fontSize: '12px' }}
                  >
                    <strong>Line {error.line}:</strong> {error.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="button-group">
            <button 
              className="btn btn-success" 
              onClick={executeGCode}
              disabled={isExecuting || !gcodeInput.trim()}
            >
              {isExecuting ? 'Executing...' : 'Execute G-Code'}
            </button>
            
            <button 
              className="btn btn-danger" 
              onClick={stopExecution}
              disabled={!isExecuting}
            >
              Stop
            </button>
            
            <button 
              className="btn btn-secondary" 
              onClick={loadSampleGCode}
              disabled={isExecuting}
            >
              Load Sample
            </button>
            
            <button 
              className="btn btn-secondary" 
              onClick={() => validateGCode(gcodeInput)}
              disabled={isExecuting || !gcodeInput.trim()}
            >
              Validate
            </button>
            
            <button 
              className="btn btn-secondary" 
              onClick={clearGCode}
              disabled={isExecuting}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="control-section">
          <h3>Execution Status</h3>
          
          <div className="form-group">
            <div className={`status-indicator ${
              status.status === 'executing' ? 'status-executing' : 
              status.status === 'completed' ? 'status-connected' : 
              status.status === 'error' ? 'status-disconnected' : 
              'status-disconnected'
            }`}>
              {status.status.toUpperCase()}
            </div>
          </div>

          {status.status === 'executing' && (
            <div className="form-group">
              <label>Progress:</label>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${status.progress}%` }}
                ></div>
              </div>
              <div style={{ textAlign: 'center', fontSize: '14px', color: '#666' }}>
                {status.progress}%
              </div>
            </div>
          )}

          {status.message && (
            <div className={`alert ${status.status === 'error' ? 'alert-danger' : 'alert-info'}`}>
              {status.message}
            </div>
          )}

          {coordinateSystemInfo && (
            <div className="form-group">
              <h4>Coordinate System</h4>
              <div style={{ fontSize: '14px', color: '#666' }}>
                <p><strong>Active:</strong> {coordinateSystemInfo.active}</p>
                <p><strong>Current Plane:</strong> {status.currentPlane || 'XY'}</p>
                <div style={{ fontSize: '12px' }}>
                  <strong>Offset:</strong> 
                  X: {coordinateSystemInfo.currentOffset.x.toFixed(3)}, 
                  Y: {coordinateSystemInfo.currentOffset.y.toFixed(3)}, 
                  Z: {coordinateSystemInfo.currentOffset.z.toFixed(3)}
                </div>
              </div>
            </div>
          )}

          <h4>G-Code Reference</h4>
          <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.4' }}>
            <p><strong>Motion Commands:</strong></p>
            <ul style={{ paddingLeft: '20px' }}>
              <li><code>G0 X Y Z</code> - Rapid positioning</li>
              <li><code>G1 X Y Z F</code> - Linear move</li>
              <li><code>G2 X Y I J</code> - Clockwise arc</li>
              <li><code>G3 X Y I J</code> - Counter-clockwise arc</li>
              <li><code>G4 P</code> - Dwell (P in seconds)</li>
            </ul>
            <p><strong>Coordinate Systems:</strong></p>
            <ul style={{ paddingLeft: '20px' }}>
              <li><code>G17/G18/G19</code> - Select XY/XZ/YZ plane</li>
              <li><code>G54-G59</code> - Work coordinate systems</li>
              <li><code>G90/G91</code> - Absolute/relative mode</li>
            </ul>
            <p><strong>Other Commands:</strong></p>
            <ul style={{ paddingLeft: '20px' }}>
              <li><code>G28</code> - Home all axes</li>
              <li><code>M106/M107</code> - Gripper on/off</li>
              <li><code>F</code> - Feed rate (mm/min)</li>
            </ul>
          </div>
        </div>
      </div>

      {gcodeHistory.length > 0 && (
        <div className="control-section" style={{ marginTop: '30px' }}>
          <h3>Recent G-Code History</h3>
          <div className="position-list">
            {gcodeHistory.map((gcode, index) => (
              <div key={index} className="position-item">
                <div className="position-info">
                  <h4>Program {index + 1}</h4>
                  <p>{gcode.split('\n')[0].substring(0, 50)}...</p>
                </div>
                <div className="button-group">
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => loadFromHistory(gcode)}
                    disabled={isExecuting}
                  >
                    Load
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GCodeControl;