import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import axios from 'axios';

interface GCodeControlProps {
  socket: Socket | null;
}

interface GCodeStatus {
  status: 'idle' | 'executing' | 'completed' | 'error';
  progress: number;
  message?: string;
}

const GCodeControl: React.FC<GCodeControlProps> = ({ socket }) => {
  const [gcodeInput, setGcodeInput] = useState('');
  const [gcodeHistory, setGcodeHistory] = useState<string[]>([]);
  const [status, setStatus] = useState<GCodeStatus>({ status: 'idle', progress: 0 });
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    if (socket) {
      socket.on('gcodeStatus', (statusUpdate: GCodeStatus) => {
        setStatus(statusUpdate);
        
        if (statusUpdate.status === 'completed' || statusUpdate.status === 'error') {
          setIsExecuting(false);
        }
      });
    }

    return () => {
      if (socket) {
        socket.off('gcodeStatus');
      }
    };
  }, [socket]);

  const executeGCode = async () => {
    if (!gcodeInput.trim()) {
      alert('Please enter G-code commands');
      return;
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
    const sampleGCode = `; Sample G-code for robotic arm movement
G21 ; Set units to millimeters
G90 ; Absolute positioning
G28 ; Home all axes

; Move to starting position
G1 X100 Y100 Z50 F1000
G1 Z20 F500

; Pick up operation
M106 ; Activate gripper
G4 P1000 ; Wait 1 second

; Move to drop position
G1 Z50 F500
G1 X200 Y150 F1000
G1 Z20 F500

; Drop operation
M107 ; Deactivate gripper
G4 P1000 ; Wait 1 second

; Return to home
G1 Z50 F500
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

  const stopExecution = () => {
    // TODO: Implement stop functionality
    console.log('Stop execution requested');
    setIsExecuting(false);
    setStatus({ status: 'idle', progress: 0 });
  };

  return (
    <div>
      <h2>G-Code Control</h2>
      <p>Enter G-code commands to automatically control the robotic arm.</p>

      <div className="control-grid">
        <div className="control-section">
          <h3>G-Code Editor</h3>
          
          <div className="form-group">
            <label htmlFor="gcodeInput">G-Code Commands:</label>
            <textarea
              id="gcodeInput"
              className="form-control textarea"
              value={gcodeInput}
              onChange={(e) => setGcodeInput(e.target.value)}
              placeholder="Enter your G-code commands here..."
              rows={15}
              disabled={isExecuting}
            />
          </div>

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

          <h4>G-Code Reference</h4>
          <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.4' }}>
            <p><strong>Common Commands:</strong></p>
            <ul style={{ paddingLeft: '20px' }}>
              <li><code>G1 X Y Z</code> - Linear move</li>
              <li><code>G28</code> - Home all axes</li>
              <li><code>G90</code> - Absolute positioning</li>
              <li><code>G91</code> - Relative positioning</li>
              <li><code>M106</code> - Activate gripper</li>
              <li><code>M107</code> - Deactivate gripper</li>
              <li><code>G4 P1000</code> - Wait 1 second</li>
              <li><code>F1000</code> - Set feed rate</li>
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