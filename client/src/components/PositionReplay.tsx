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
  currentPositionIndex?: number;
  totalPositions?: number;
  currentLoop?: number;
  totalLoops?: number;
  step?: string;
  timestamp?: number;
}

interface ProgressLogEntry {
  id: number;
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

type ReplayMode = 'once' | 'count' | 'infinite';

const PositionReplay: React.FC<PositionReplayProps> = ({ positions, socket, config }) => {
  const [selectedPositions, setSelectedPositions] = useState<number[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayStatus, setReplayStatus] = useState<ReplayStatus>({ status: 'idle' });
  const [sequenceDelay, setSequenceDelay] = useState(1000);
  const [loopCount, setLoopCount] = useState(1);
  const [replayMode, setReplayMode] = useState<ReplayMode>('once');
  const [shouldStop, setShouldStop] = useState(false);
  const [progressLog, setProgressLog] = useState<ProgressLogEntry[]>([]);

  const addProgressLogEntry = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const entry: ProgressLogEntry = {
      id: Date.now() + Math.random(),
      timestamp: Date.now(),
      message,
      type
    };
    setProgressLog(prev => [...prev, entry]);
  };

  const clearProgressLog = () => {
    setProgressLog([]);
  };

  useEffect(() => {
    if (socket) {
      socket.on('replayStatus', (status: ReplayStatus) => {
        setReplayStatus(status);
        
        // Add progress log entries based on status updates
        if (status.step) {
          addProgressLogEntry(status.step, 'info');
        }
        
        if (status.status === 'completed') {
          setIsReplaying(false);
          addProgressLogEntry('Position replay completed successfully', 'success');
        }
        
        if (status.status === 'starting') {
          if (status.position) {
            addProgressLogEntry(`Starting replay of position: ${status.position}`, 'info');
          }
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
    setShouldStop(false);
    setReplayStatus({ status: 'starting' });
    clearProgressLog();
    
    addProgressLogEntry(`Starting sequence replay: ${selectedPositions.length} positions, ${loopCount} loops`, 'info');

    try {
      const maxLoops = replayMode === 'once' ? 1 : (replayMode === 'count' ? loopCount : Infinity);
      let loop = 0;
      
      while ((replayMode === 'infinite' || loop < maxLoops) && !shouldStop) {
        for (const positionId of selectedPositions) {
          if (shouldStop) break;
      for (let loop = 0; loop < loopCount; loop++) {
        addProgressLogEntry(`Starting loop ${loop + 1} of ${loopCount}`, 'info');
        
        for (let posIndex = 0; posIndex < selectedPositions.length; posIndex++) {
          const positionId = selectedPositions[posIndex];
          const position = positions.find(p => p.id === positionId);
          
          if (!position) {
            addProgressLogEntry(`Error: Position with ID ${positionId} not found`, 'error');
            continue;
          }

          // Update status with detailed progress
          setReplayStatus({
            status: 'running',
            position: position.name,
            currentPositionIndex: posIndex + 1,
            totalPositions: selectedPositions.length,
            currentLoop: loop + 1,
            totalLoops: loopCount,
            step: `Executing position ${posIndex + 1}/${selectedPositions.length} in loop ${loop + 1}/${loopCount}`,
            timestamp: Date.now()
          });

          addProgressLogEntry(`Executing position: ${position.name} (${posIndex + 1}/${selectedPositions.length})`, 'info');
          
          const response = await axios.post(`/api/replay/${positionId}`);
          
          if (!response.data.success) {
            throw new Error(response.data.error);
          }

          addProgressLogEntry(`Position ${position.name} executed successfully`, 'success');

          // Wait for the position to complete plus sequence delay
          const totalDelay = (position?.delay || 0) + sequenceDelay;
          
          if (totalDelay > 0) {
            addProgressLogEntry(`Waiting ${totalDelay}ms before next step...`, 'info');
            await new Promise(resolve => setTimeout(resolve, totalDelay));
          }
        }
        loop++;
        
        if (shouldStop) break;
      }
      
      setReplayStatus({ status: shouldStop ? 'idle' : 'completed' });
        
        addProgressLogEntry(`Loop ${loop + 1} completed`, 'success');
      }
      
      setReplayStatus({ 
        status: 'completed',
        step: 'All positions completed successfully',
        timestamp: Date.now()
      });
      addProgressLogEntry('Sequence replay completed successfully!', 'success');
    } catch (error) {
      console.error('Error during replay:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during position replay';
      addProgressLogEntry(`Error: ${errorMessage}`, 'error');
      setReplayStatus({ status: 'idle' });
      alert('Error during position replay');
    } finally {
      setIsReplaying(false);
      setShouldStop(false);
    }
  };

  const stopReplay = () => {
    setShouldStop(true);
  };

  const replaySinglePosition = async (positionId: number) => {
    const position = positions.find(p => p.id === positionId);
    if (!position) {
      addProgressLogEntry(`Error: Position with ID ${positionId} not found`, 'error');
      return;
    }

    setIsReplaying(true);
    clearProgressLog();
    addProgressLogEntry(`Starting single position replay: ${position.name}`, 'info');
    
    try {
      const response = await axios.post(`/api/replay/${positionId}`);
      
      if (response.data.success) {
        addProgressLogEntry(`Position ${position.name} executed successfully`, 'success');
        setTimeout(() => {
          setIsReplaying(false);
          addProgressLogEntry('Single position replay completed', 'success');
        }, position?.delay || 1000);
      } else {
        throw new Error(response.data.error);
      }
    } catch (error) {
      console.error('Error replaying position:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addProgressLogEntry(`Error: ${errorMessage}`, 'error');
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
            <label>Replay Mode:</label>
            <div style={{ marginTop: '8px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                <input
                  type="radio"
                  name="replayMode"
                  value="once"
                  checked={replayMode === 'once'}
                  onChange={(e) => setReplayMode(e.target.value as ReplayMode)}
                  disabled={isReplaying}
                  style={{ marginRight: '8px' }}
                />
                Run once
              </label>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                <input
                  type="radio"
                  name="replayMode"
                  value="count"
                  checked={replayMode === 'count'}
                  onChange={(e) => setReplayMode(e.target.value as ReplayMode)}
                  disabled={isReplaying}
                  style={{ marginRight: '8px' }}
                />
                Run specific count
              </label>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                <input
                  type="radio"
                  name="replayMode"
                  value="infinite"
                  checked={replayMode === 'infinite'}
                  onChange={(e) => setReplayMode(e.target.value as ReplayMode)}
                  disabled={isReplaying}
                  style={{ marginRight: '8px' }}
                />
                Run indefinitely until stopped
              </label>
            </div>
          </div>

          {replayMode === 'count' && (
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
          )}

          <div className="button-group">
            <button 
              className="btn btn-success" 
              onClick={replaySelectedPositions}
              disabled={isReplaying || selectedPositions.length === 0}
            >
              {isReplaying ? 'Replaying...' : `Replay Selected (${selectedPositions.length})`}
            </button>
            
            {isReplaying && replayMode === 'infinite' && (
              <button 
                className="btn btn-warning" 
                onClick={stopReplay}
              >
                Stop Replay
              </button>
            )}
            
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
              {replayStatus.currentPositionIndex && replayStatus.totalPositions && (
                <div style={{ fontSize: '12px', marginTop: '5px' }}>
                  Position {replayStatus.currentPositionIndex}/{replayStatus.totalPositions}
                  {replayStatus.currentLoop && replayStatus.totalLoops && (
                    `, Loop ${replayStatus.currentLoop}/${replayStatus.totalLoops}`
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="control-section">
          <h3>Progress Log</h3>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '14px', color: '#666' }}>
              {progressLog.length} entries
            </div>
            <button 
              className="btn btn-sm btn-secondary" 
              onClick={clearProgressLog}
              disabled={isReplaying}
            >
              Clear Log
            </button>
          </div>
          
          <div 
            style={{ 
              maxHeight: '300px', 
              overflowY: 'auto', 
              border: '1px solid #e9ecef', 
              borderRadius: '4px',
              backgroundColor: '#f8f9fa',
              padding: '10px'
            }}
          >
            {progressLog.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                No progress entries yet. Start a replay to see detailed logs.
              </div>
            ) : (
              <div>
                {progressLog.map((entry) => (
                  <div 
                    key={entry.id} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'flex-start',
                      marginBottom: '8px',
                      padding: '5px',
                      borderRadius: '3px',
                      backgroundColor: entry.type === 'error' ? '#ffeaea' : 
                                    entry.type === 'success' ? '#eafaf1' :
                                    entry.type === 'warning' ? '#fff3cd' : '#ffffff',
                      borderLeft: `3px solid ${
                        entry.type === 'error' ? '#dc3545' :
                        entry.type === 'success' ? '#28a745' :
                        entry.type === 'warning' ? '#ffc107' : '#007bff'
                      }`
                    }}
                  >
                    <div style={{ 
                      fontSize: '11px', 
                      color: '#666', 
                      minWidth: '60px',
                      marginRight: '10px',
                      fontFamily: 'monospace'
                    }}>
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </div>
                    <div style={{ 
                      flex: 1,
                      fontSize: '13px',
                      color: entry.type === 'error' ? '#721c24' : '#333'
                    }}>
                      {entry.message}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                {replayMode === 'infinite' ? '∞' :
                  selectedPositions.length > 0 ? 
                  `${Math.round((selectedPositions.reduce((total, id) => {
                    const pos = positions.find(p => p.id === id);
                    return total + (pos?.delay || 0) + sequenceDelay;
                  }, 0) * (replayMode === 'once' ? 1 : loopCount)) / 1000)}s` : 
                  '0s'
                }
              </div>
            </div>
            
            <div>
              <h4>Total Loops</h4>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ffc107' }}>
                {replayMode === 'once' ? '1' : replayMode === 'infinite' ? '∞' : loopCount}
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