import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import axios from 'axios';

interface PositionReplayProps {
  positions: any[];
  socket: Socket | null;
  config: any;
}

interface ReplayStatus {
  status: 'idle' | 'starting' | 'running' | 'completed';
  position?: string;
}

const PositionReplay: React.FC<PositionReplayProps> = ({ positions, socket, config }) => {
  const [selectedPositions, setSelectedPositions] = useState<number[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayStatus, setReplayStatus] = useState<ReplayStatus>({ status: 'idle' });
  const [sequenceDelay, setSequenceDelay] = useState(1000);
  const [loopCount, setLoopCount] = useState(1);

  useEffect(() => {
    if (socket) {
      socket.on('replayStatus', (status: ReplayStatus) => {
        setReplayStatus(status);
        
        if (status.status === 'completed') {
          setIsReplaying(false);
        }
      });
    }

    return () => {
      if (socket) {
        socket.off('replayStatus');
      }
    };
  }, [socket]);

  const handlePositionSelect = (positionId: number) => {
    setSelectedPositions(prev => {
      if (prev.includes(positionId)) {
        return prev.filter(id => id !== positionId);
      } else {
        return [...prev, positionId];
      }
    });
  };

  const replaySelectedPositions = async () => {
    if (selectedPositions.length === 0) {
      alert('Please select at least one position to replay');
      return;
    }

    setIsReplaying(true);
    setReplayStatus({ status: 'starting' });

    try {
      for (let loop = 0; loop < loopCount; loop++) {
        for (const positionId of selectedPositions) {
          const response = await axios.post(`/api/replay/${positionId}`);
          
          if (!response.data.success) {
            throw new Error(response.data.error);
          }

          // Wait for the position to complete plus sequence delay
          const position = positions.find(p => p.id === positionId);
          const totalDelay = (position?.delay || 0) + sequenceDelay;
          
          await new Promise(resolve => setTimeout(resolve, totalDelay));
        }
      }
      
      setReplayStatus({ status: 'completed' });
    } catch (error) {
      console.error('Error during replay:', error);
      alert('Error during position replay');
      setReplayStatus({ status: 'idle' });
    } finally {
      setIsReplaying(false);
    }
  };

  const replaySinglePosition = async (positionId: number) => {
    setIsReplaying(true);
    
    try {
      const response = await axios.post(`/api/replay/${positionId}`);
      
      if (response.data.success) {
        const position = positions.find(p => p.id === positionId);
        setTimeout(() => {
          setIsReplaying(false);
        }, position?.delay || 1000);
      } else {
        throw new Error(response.data.error);
      }
    } catch (error) {
      console.error('Error replaying position:', error);
      alert('Error replaying position');
      setIsReplaying(false);
    }
  };

  const deletePosition = async (positionId: number) => {
    if (window.confirm('Are you sure you want to delete this position?')) {
      try {
        await axios.delete(`/api/positions/${positionId}`);
        // Position list will be updated via socket
      } catch (error) {
        console.error('Error deleting position:', error);
        alert('Error deleting position');
      }
    }
  };

  const selectAllPositions = () => {
    setSelectedPositions(positions.map(p => p.id));
  };

  const clearSelection = () => {
    setSelectedPositions([]);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div>
      <h2>Position Replay</h2>
      <p>Select saved positions to replay automatically. You can replay individual positions or create sequences.</p>

      <div className="control-grid">
        <div className="control-section">
          <h3>Sequence Controls</h3>
          
          <div className="form-group">
            <label htmlFor="sequenceDelay">Delay Between Positions (ms):</label>
            <input
              type="number"
              id="sequenceDelay"
              className="form-control"
              value={sequenceDelay}
              onChange={(e) => setSequenceDelay(parseInt(e.target.value))}
              min="0"
              step="100"
              disabled={isReplaying}
            />
          </div>

          <div className="form-group">
            <label htmlFor="loopCount">Number of Loops:</label>
            <input
              type="number"
              id="loopCount"
              className="form-control"
              value={loopCount}
              onChange={(e) => setLoopCount(parseInt(e.target.value))}
              min="1"
              max="100"
              disabled={isReplaying}
            />
          </div>

          <div className="button-group">
            <button 
              className="btn btn-success" 
              onClick={replaySelectedPositions}
              disabled={isReplaying || selectedPositions.length === 0}
            >
              {isReplaying ? 'Replaying...' : `Replay Selected (${selectedPositions.length})`}
            </button>
            
            <button 
              className="btn btn-secondary" 
              onClick={selectAllPositions}
              disabled={isReplaying || positions.length === 0}
            >
              Select All
            </button>
            
            <button 
              className="btn btn-secondary" 
              onClick={clearSelection}
              disabled={isReplaying}
            >
              Clear Selection
            </button>
          </div>

          <div className="form-group">
            <div className={`status-indicator ${
              replayStatus.status === 'running' || replayStatus.status === 'starting' ? 'status-executing' : 
              replayStatus.status === 'completed' ? 'status-connected' : 
              'status-disconnected'
            }`}>
              {replayStatus.status.toUpperCase()}
              {replayStatus.position && ` - ${replayStatus.position}`}
            </div>
          </div>
        </div>

        <div className="control-section">
          <h3>Replay Statistics</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <h4>Total Positions</h4>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>
                {positions.length}
              </div>
            </div>
            
            <div>
              <h4>Selected</h4>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
                {selectedPositions.length}
              </div>
            </div>
            
            <div>
              <h4>Estimated Time</h4>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#6c757d' }}>
                {selectedPositions.length > 0 ? 
                  `${Math.round((selectedPositions.reduce((total, id) => {
                    const pos = positions.find(p => p.id === id);
                    return total + (pos?.delay || 0) + sequenceDelay;
                  }, 0) * loopCount) / 1000)}s` : 
                  '0s'
                }
              </div>
            </div>
            
            <div>
              <h4>Total Loops</h4>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ffc107' }}>
                {loopCount}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="control-section" style={{ marginTop: '30px' }}>
        <h3>Saved Positions</h3>
        
        {positions.length === 0 ? (
          <div className="alert alert-info">
            No saved positions. Use the Manual Control tab to save positions.
          </div>
        ) : (
          <div className="position-list">
            {positions.map((position) => (
              <div key={position.id} className="position-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={selectedPositions.includes(position.id)}
                    onChange={() => handlePositionSelect(position.id)}
                    disabled={isReplaying}
                    style={{ transform: 'scale(1.2)' }}
                  />
                  
                  <div className="position-info" style={{ flex: 1 }}>
                    <h4>{position.name}</h4>
                    <p>
                      Saved: {formatTimestamp(position.timestamp)} | 
                      Delay: {position.delay}ms | 
                      Axes: {Object.keys(position.axes).length} | 
                      Manipulators: {Object.keys(position.manipulators).length}
                    </p>
                    <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>
                      {Object.entries(position.axes).map(([axis, value], index) => 
                        `${axis}: ${value}°${index < Object.entries(position.axes).length - 1 ? ' | ' : ''}`
                      ).join('')}
                    </div>
                  </div>
                </div>
                
                <div className="button-group">
                  <button 
                    className="btn btn-primary" 
                    onClick={() => replaySinglePosition(position.id)}
                    disabled={isReplaying}
                  >
                    Replay
                  </button>
                  <button 
                    className="btn btn-danger" 
                    onClick={() => deletePosition(position.id)}
                    disabled={isReplaying}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PositionReplay;