import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import axios from 'axios';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable Position Item Component
const SortablePositionItem: React.FC<{
  position: Position;
  isSelected: boolean;
  isReplaying: boolean;
  onSelect: (id: number) => void;
  onReplay: (id: number) => void;
  onEdit: (position: Position) => void;
  onDelete: (id: number) => void;
  formatTimestamp: (timestamp: string) => string;
}> = ({ position, isSelected, isReplaying, onSelect, onReplay, onEdit, onDelete, formatTimestamp }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: position.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="position-item"
      {...attributes}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
        <div
          {...listeners}
          style={{ 
            cursor: 'grab', 
            padding: '5px', 
            display: 'flex', 
            alignItems: 'center',
            fontSize: '18px',
            color: '#666'
          }}
          title="Drag to reorder"
        >
          ⋮⋮
        </div>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(position.id)}
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
          onClick={() => onReplay(position.id)}
          disabled={isReplaying}
        >
          Replay
        </button>
        <button 
          className="btn btn-secondary" 
          onClick={() => onEdit(position)}
          disabled={isReplaying}
        >
          Edit
        </button>
        <button 
          className="btn btn-danger" 
          onClick={() => onDelete(position.id)}
          disabled={isReplaying}
        >
          Delete
        </button>
      </div>
    </div>
  );
};

interface PositionReplayProps {
  positions: any[];
  groups: any[];
  socket: Socket | null;
  config: any;
}

interface ReplayStatus {
  status: 'idle' | 'starting' | 'running' | 'completed';
  position?: string;
}

interface Position {
  id: number;
  name: string;
  axes: { [key: string]: number };
  manipulators: { [key: string]: number };
  delay: number;
  timestamp: string;
  groupId?: number;
}

interface PositionGroup {
  id: number;
  name: string;
  description: string;
  positionIds: number[];
  timestamp: string;
}

const PositionReplay: React.FC<PositionReplayProps> = ({ positions, groups, socket, config }) => {
  const [selectedPositions, setSelectedPositions] = useState<number[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayStatus, setReplayStatus] = useState<ReplayStatus>({ status: 'idle' });
  const [sequenceDelay, setSequenceDelay] = useState(1000);
  const [loopCount, setLoopCount] = useState(1);
  
  // New state for editing features
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<PositionGroup | null>(null);
  
  // Form states
  const [newPositionForm, setNewPositionForm] = useState({
    name: '',
    axes: {} as { [key: string]: number },
    manipulators: {} as { [key: string]: number },
    delay: 1000
  });
  
  const [newGroupForm, setNewGroupForm] = useState({
    name: '',
    description: ''
  });

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  // Initialize form with config defaults
  useEffect(() => {
    if (config) {
      const defaultAxes: { [key: string]: number } = {};
      const defaultManipulators: { [key: string]: number } = {};
      
      // Initialize axes to 0
      for (let i = 1; i <= config.axes.count; i++) {
        defaultAxes[`axis${i}`] = 0;
      }
      
      // Initialize manipulators to 0
      Object.keys(config.manipulators).forEach(key => {
        if (key !== 'count') {
          defaultManipulators[key] = 0;
        }
      });
      
      setNewPositionForm(prev => ({
        ...prev,
        axes: defaultAxes,
        manipulators: defaultManipulators
      }));
    }
  }, [config]);

  // Add new position
  const handleAddPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newPositionForm.name.trim()) {
      alert('Please enter a position name');
      return;
    }
    
    try {
      await axios.post('/api/positions', newPositionForm);
      setShowAddForm(false);
      setNewPositionForm({
        name: '',
        axes: newPositionForm.axes, // Keep the initialized axes
        manipulators: newPositionForm.manipulators, // Keep the initialized manipulators
        delay: 1000
      });
    } catch (error) {
      console.error('Error adding position:', error);
      alert('Error adding position');
    }
  };

  // Edit position
  const handleEditPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingPosition) return;
    
    try {
      await axios.put(`/api/positions/${editingPosition.id}`, editingPosition);
      setEditingPosition(null);
    } catch (error) {
      console.error('Error updating position:', error);
      alert('Error updating position');
    }
  };

  // Handle drag end for position reordering
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = positions.findIndex(pos => pos.id === active.id);
      const newIndex = positions.findIndex(pos => pos.id === over?.id);
      
      const reorderedPositions = arrayMove(positions, oldIndex, newIndex);
      const positionIds = reorderedPositions.map(pos => pos.id);
      
      try {
        await axios.post('/api/positions/reorder', { positionIds });
      } catch (error) {
        console.error('Error reordering positions:', error);
        alert('Error reordering positions');
      }
    }
  };

  // Group management functions
  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newGroupForm.name.trim()) {
      alert('Please enter a group name');
      return;
    }
    
    try {
      await axios.post('/api/groups', newGroupForm);
      setShowGroupForm(false);
      setNewGroupForm({ name: '', description: '' });
    } catch (error) {
      console.error('Error adding group:', error);
      alert('Error adding group');
    }
  };

  const handleEditGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingGroup) return;
    
    try {
      await axios.put(`/api/groups/${editingGroup.id}`, editingGroup);
      setEditingGroup(null);
    } catch (error) {
      console.error('Error updating group:', error);
      alert('Error updating group');
    }
  };

  const handleDeleteGroup = async (groupId: number) => {
    if (window.confirm('Are you sure you want to delete this group? Positions will not be deleted, just ungrouped.')) {
      try {
        await axios.delete(`/api/groups/${groupId}`);
      } catch (error) {
        console.error('Error deleting group:', error);
        alert('Error deleting group');
      }
    }
  };

  const handleAddPositionToGroup = async (groupId: number, positionId: number) => {
    try {
      await axios.post(`/api/groups/${groupId}/positions/${positionId}`);
    } catch (error) {
      console.error('Error adding position to group:', error);
      alert('Error adding position to group');
    }
  };

  const handleRemovePositionFromGroup = async (groupId: number, positionId: number) => {
    try {
      await axios.delete(`/api/groups/${groupId}/positions/${positionId}`);
    } catch (error) {
      console.error('Error removing position from group:', error);
      alert('Error removing position from group');
    }
  };

  return (
    <div>
      <h2>Position Replay</h2>
      <p>Manage and replay robot positions. Create groups to organize your positions.</p>

      {/* Add Position and Group Buttons */}
      <div className="button-group" style={{ marginBottom: '20px' }}>
        <button 
          className="btn btn-success" 
          onClick={() => setShowAddForm(true)}
          disabled={isReplaying}
        >
          Add New Position
        </button>
        <button 
          className="btn btn-info" 
          onClick={() => setShowGroupForm(true)}
          disabled={isReplaying}
        >
          Create New Group
        </button>
      </div>

      {/* Add Position Form */}
      {showAddForm && (
        <div className="control-section" style={{ marginBottom: '30px' }}>
          <h3>Add New Position</h3>
          <form onSubmit={handleAddPosition}>
            <div className="form-group">
              <label htmlFor="newPositionName">Position Name:</label>
              <input
                type="text"
                id="newPositionName"
                className="form-control"
                value={newPositionForm.name}
                onChange={(e) => setNewPositionForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter position name"
                required
              />
            </div>
            
            <div className="form-group">
              <label>Axes Positions:</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {Object.entries(newPositionForm.axes).map(([axis, value]) => (
                  <div key={axis}>
                    <label>{axis.toUpperCase()}:</label>
                    <input
                      type="number"
                      className="form-control"
                      value={value}
                      onChange={(e) => setNewPositionForm(prev => ({
                        ...prev,
                        axes: { ...prev.axes, [axis]: parseFloat(e.target.value) || 0 }
                      }))}
                      step="0.1"
                    />
                  </div>
                ))}
              </div>
            </div>
            
            <div className="form-group">
              <label>Manipulator Positions:</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                {Object.entries(newPositionForm.manipulators).map(([manipulator, value]) => (
                  <div key={manipulator}>
                    <label>{manipulator.toUpperCase()}:</label>
                    <input
                      type="number"
                      className="form-control"
                      value={value}
                      onChange={(e) => setNewPositionForm(prev => ({
                        ...prev,
                        manipulators: { ...prev.manipulators, [manipulator]: parseFloat(e.target.value) || 0 }
                      }))}
                      min="0"
                      max="100"
                      step="0.1"
                    />
                  </div>
                ))}
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="newPositionDelay">Delay (ms):</label>
              <input
                type="number"
                id="newPositionDelay"
                className="form-control"
                value={newPositionForm.delay}
                onChange={(e) => setNewPositionForm(prev => ({ ...prev, delay: parseInt(e.target.value) || 0 }))}
                min="0"
                step="100"
              />
            </div>
            
            <div className="button-group">
              <button type="submit" className="btn btn-success">Add Position</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Group Form */}
      {showGroupForm && (
        <div className="control-section" style={{ marginBottom: '30px' }}>
          <h3>{editingGroup ? 'Edit Group' : 'Create New Group'}</h3>
          <form onSubmit={editingGroup ? handleEditGroup : handleAddGroup}>
            <div className="form-group">
              <label htmlFor="groupName">Group Name:</label>
              <input
                type="text"
                id="groupName"
                className="form-control"
                value={editingGroup ? editingGroup.name : newGroupForm.name}
                onChange={(e) => {
                  if (editingGroup) {
                    setEditingGroup(prev => prev ? { ...prev, name: e.target.value } : null);
                  } else {
                    setNewGroupForm(prev => ({ ...prev, name: e.target.value }));
                  }
                }}
                placeholder="Enter group name"
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="groupDescription">Description:</label>
              <textarea
                id="groupDescription"
                className="form-control"
                value={editingGroup ? editingGroup.description : newGroupForm.description}
                onChange={(e) => {
                  if (editingGroup) {
                    setEditingGroup(prev => prev ? { ...prev, description: e.target.value } : null);
                  } else {
                    setNewGroupForm(prev => ({ ...prev, description: e.target.value }));
                  }
                }}
                placeholder="Enter group description"
                rows={3}
              />
            </div>
            
            <div className="button-group">
              <button type="submit" className="btn btn-success">
                {editingGroup ? 'Update Group' : 'Create Group'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => {
                setShowGroupForm(false);
                setEditingGroup(null);
              }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Position Form */}
      {editingPosition && (
        <div className="control-section" style={{ marginBottom: '30px' }}>
          <h3>Edit Position: {editingPosition.name}</h3>
          <form onSubmit={handleEditPosition}>
            <div className="form-group">
              <label htmlFor="editPositionName">Position Name:</label>
              <input
                type="text"
                id="editPositionName"
                className="form-control"
                value={editingPosition.name}
                onChange={(e) => setEditingPosition(prev => prev ? { ...prev, name: e.target.value } : null)}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Axes Positions:</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {Object.entries(editingPosition.axes).map(([axis, value]) => (
                  <div key={axis}>
                    <label>{axis.toUpperCase()}:</label>
                    <input
                      type="number"
                      className="form-control"
                      value={value}
                      onChange={(e) => setEditingPosition(prev => prev ? {
                        ...prev,
                        axes: { ...prev.axes, [axis]: parseFloat(e.target.value) || 0 }
                      } : null)}
                      step="0.1"
                    />
                  </div>
                ))}
              </div>
            </div>
            
            <div className="form-group">
              <label>Manipulator Positions:</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                {Object.entries(editingPosition.manipulators).map(([manipulator, value]) => (
                  <div key={manipulator}>
                    <label>{manipulator.toUpperCase()}:</label>
                    <input
                      type="number"
                      className="form-control"
                      value={value}
                      onChange={(e) => setEditingPosition(prev => prev ? {
                        ...prev,
                        manipulators: { ...prev.manipulators, [manipulator]: parseFloat(e.target.value) || 0 }
                      } : null)}
                      min="0"
                      max="100"
                      step="0.1"
                    />
                  </div>
                ))}
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="editPositionDelay">Delay (ms):</label>
              <input
                type="number"
                id="editPositionDelay"
                className="form-control"
                value={editingPosition.delay}
                onChange={(e) => setEditingPosition(prev => prev ? { ...prev, delay: parseInt(e.target.value) || 0 } : null)}
                min="0"
                step="100"
              />
            </div>
            
            <div className="button-group">
              <button type="submit" className="btn btn-success">Update Position</button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingPosition(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

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
              <h4>Total Groups</h4>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#17a2b8' }}>
                {groups.length}
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
          </div>
        </div>
      </div>

      {/* Groups Section */}
      <div className="control-section" style={{ marginTop: '30px' }}>
        <h3>Position Groups</h3>
        
        {groups.length === 0 ? (
          <div className="alert alert-info">
            No groups created. Click "Create New Group" to organize your positions.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '20px' }}>
            {groups.map((group) => (
              <div key={group.id} className="control-section" style={{ backgroundColor: '#f8f9fa' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <div>
                    <h4>{group.name}</h4>
                    {group.description && <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>{group.description}</p>}
                  </div>
                  <div className="button-group">
                    <button 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => {
                        setEditingGroup(group);
                        setShowGroupForm(true);
                      }}
                      disabled={isReplaying}
                    >
                      Edit
                    </button>
                    <button 
                      className="btn btn-danger btn-sm" 
                      onClick={() => handleDeleteGroup(group.id)}
                      disabled={isReplaying}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                
                <div>
                  <p style={{ fontSize: '12px', color: '#999', marginBottom: '10px' }}>
                    {group.positionIds.length} positions
                  </p>
                  
                  {group.positionIds.map((positionId: number) => {
                    const position = positions.find(p => p.id === positionId);
                    return position ? (
                      <div key={positionId} style={{ 
                        backgroundColor: 'white', 
                        padding: '8px', 
                        borderRadius: '4px', 
                        marginBottom: '5px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '14px'
                      }}>
                        <span>{position.name}</span>
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => handleRemovePositionFromGroup(group.id, positionId)}
                          disabled={isReplaying}
                          title="Remove from group"
                        >
                          ×
                        </button>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Positions Section with Drag and Drop */}
      <div className="control-section" style={{ marginTop: '30px' }}>
        <h3>Saved Positions</h3>
        
        {positions.length === 0 ? (
          <div className="alert alert-info">
            No saved positions. Use the "Add New Position" button above or the Manual Control tab to save positions.
          </div>
        ) : (
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={positions.map(p => p.id)} strategy={verticalListSortingStrategy}>
              <div className="position-list">
                {positions.map((position) => (
                  <SortablePositionItem
                    key={position.id}
                    position={position}
                    isSelected={selectedPositions.includes(position.id)}
                    isReplaying={isReplaying}
                    onSelect={handlePositionSelect}
                    onReplay={replaySinglePosition}
                    onEdit={(pos) => setEditingPosition(pos)}
                    onDelete={deletePosition}
                    formatTimestamp={formatTimestamp}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
        
        {/* Quick Group Assignment */}
        {positions.length > 0 && groups.length > 0 && (
          <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <h4>Quick Group Assignment</h4>
            <p style={{ fontSize: '14px', marginBottom: '15px' }}>
              Select a position and a group to quickly assign:
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <select 
                className="form-control" 
                style={{ flex: '1', minWidth: '150px' }}
                id="position-select"
                disabled={isReplaying}
              >
                <option value="">Select position...</option>
                {positions.map(position => (
                  <option key={position.id} value={position.id}>
                    {position.name} {position.groupId ? `(in ${groups.find(g => g.id === position.groupId)?.name || 'unknown'})` : ''}
                  </option>
                ))}
              </select>
              
              <select 
                className="form-control" 
                style={{ flex: '1', minWidth: '150px' }}
                id="group-select"
                disabled={isReplaying}
              >
                <option value="">Select group...</option>
                {groups.map(group => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
              
              <button
                className="btn btn-primary"
                onClick={() => {
                  const positionSelect = document.getElementById('position-select') as HTMLSelectElement;
                  const groupSelect = document.getElementById('group-select') as HTMLSelectElement;
                  
                  if (positionSelect.value && groupSelect.value) {
                    const positionId = parseInt(positionSelect.value);
                    const groupId = parseInt(groupSelect.value);
                    handleAddPositionToGroup(groupId, positionId);
                    positionSelect.value = '';
                    groupSelect.value = '';
                  } else {
                    alert('Please select both a position and a group');
                  }
                }}
                disabled={isReplaying}
              >
                Assign
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PositionReplay;