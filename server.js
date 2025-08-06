const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs-extra');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from React build
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
}

// Configuration storage
const CONFIG_FILE = path.join(__dirname, 'config', 'robot-config.json');
const POSITIONS_FILE = path.join(__dirname, 'data', 'saved-positions.json');
const GROUPS_FILE = path.join(__dirname, 'data', 'position-groups.json');

// Ensure config and data directories exist
fs.ensureDirSync(path.join(__dirname, 'config'));
fs.ensureDirSync(path.join(__dirname, 'data'));

// Default configuration
const defaultConfig = {
  robotType: 'arctos',
  communicationProtocol: 'serial',
  serialConfig: {
    port: '/dev/ttyUSB0',
    baudRate: 115200
  },
  canConfig: {
    interface: 'can0'
  },
  rs485Config: {
    port: '/dev/ttyUSB1',
    baudRate: 9600
  },
  axes: {
    count: 6,
    limits: {
      axis1: { min: -180, max: 180 },
      axis2: { min: -90, max: 90 },
      axis3: { min: -180, max: 180 },
      axis4: { min: -180, max: 180 },
      axis5: { min: -90, max: 90 },
      axis6: { min: -180, max: 180 }
    }
  },
  manipulators: {
    count: 2,
    gripper1: { min: 0, max: 100 },
    gripper2: { min: 0, max: 100 }
  }
};

// Load or create configuration
let robotConfig = defaultConfig;
if (fs.existsSync(CONFIG_FILE)) {
  try {
    robotConfig = fs.readJsonSync(CONFIG_FILE);
  } catch (error) {
    console.error('Error loading config:', error);
    robotConfig = defaultConfig;
  }
}

// Load saved positions
let savedPositions = [];
if (fs.existsSync(POSITIONS_FILE)) {
  try {
    savedPositions = fs.readJsonSync(POSITIONS_FILE);
  } catch (error) {
    console.error('Error loading saved positions:', error);
    savedPositions = [];
  }
}

// Load position groups
let positionGroups = [];
if (fs.existsSync(GROUPS_FILE)) {
  try {
    positionGroups = fs.readJsonSync(GROUPS_FILE);
  } catch (error) {
    console.error('Error loading position groups:', error);
    positionGroups = [];
  }
}

// API Routes
app.get('/api/config', (req, res) => {
  res.json(robotConfig);
});

app.post('/api/config', (req, res) => {
  try {
    robotConfig = { ...robotConfig, ...req.body };
    fs.writeJsonSync(CONFIG_FILE, robotConfig, { spaces: 2 });
    res.json({ success: true, config: robotConfig });
    
    // Broadcast config update to all clients
    io.emit('configUpdated', robotConfig);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/positions', (req, res) => {
  res.json(savedPositions);
});

app.post('/api/positions', (req, res) => {
  try {
    const newPosition = {
      id: Date.now(),
      name: req.body.name,
      axes: req.body.axes,
      manipulators: req.body.manipulators,
      delay: req.body.delay || 0,
      timestamp: new Date().toISOString()
    };
    
    savedPositions.push(newPosition);
    fs.writeJsonSync(POSITIONS_FILE, savedPositions, { spaces: 2 });
    res.json({ success: true, position: newPosition });
    
    // Broadcast position update to all clients
    io.emit('positionsUpdated', savedPositions);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/positions/:id', (req, res) => {
  try {
    const positionId = parseInt(req.params.id);
    const positionIndex = savedPositions.findIndex(pos => pos.id === positionId);
    
    if (positionIndex === -1) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }
    
    // Update position with new data, preserving id and timestamp
    const updatedPosition = {
      ...savedPositions[positionIndex],
      name: req.body.name,
      axes: req.body.axes,
      manipulators: req.body.manipulators,
      delay: req.body.delay || 0,
      groupId: req.body.groupId || null
    };
    
    savedPositions[positionIndex] = updatedPosition;
    fs.writeJsonSync(POSITIONS_FILE, savedPositions, { spaces: 2 });
    res.json({ success: true, position: updatedPosition });
    
    // Broadcast position update to all clients
    io.emit('positionsUpdated', savedPositions);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/positions/:id', (req, res) => {
  try {
    const positionId = parseInt(req.params.id);
    savedPositions = savedPositions.filter(pos => pos.id !== positionId);
    fs.writeJsonSync(POSITIONS_FILE, savedPositions, { spaces: 2 });
    res.json({ success: true });
    
    // Broadcast position update to all clients
    io.emit('positionsUpdated', savedPositions);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/positions/reorder', (req, res) => {
  try {
    const { positionIds } = req.body;
    
    // Reorder positions based on the provided array of IDs
    const reorderedPositions = [];
    positionIds.forEach(id => {
      const position = savedPositions.find(pos => pos.id === id);
      if (position) {
        reorderedPositions.push(position);
      }
    });
    
    // Add any positions that weren't in the reorder list
    savedPositions.forEach(position => {
      if (!positionIds.includes(position.id)) {
        reorderedPositions.push(position);
      }
    });
    
    savedPositions = reorderedPositions;
    fs.writeJsonSync(POSITIONS_FILE, savedPositions, { spaces: 2 });
    res.json({ success: true });
    
    // Broadcast position update to all clients
    io.emit('positionsUpdated', savedPositions);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Group management endpoints
app.get('/api/groups', (req, res) => {
  res.json(positionGroups);
});

app.post('/api/groups', (req, res) => {
  try {
    const newGroup = {
      id: Date.now(),
      name: req.body.name,
      description: req.body.description || '',
      positionIds: [],
      timestamp: new Date().toISOString()
    };
    
    positionGroups.push(newGroup);
    fs.writeJsonSync(GROUPS_FILE, positionGroups, { spaces: 2 });
    res.json({ success: true, group: newGroup });
    
    // Broadcast group update to all clients
    io.emit('groupsUpdated', positionGroups);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/groups/:id', (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const groupIndex = positionGroups.findIndex(group => group.id === groupId);
    
    if (groupIndex === -1) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    
    // Update group with new data, preserving id and timestamp
    const updatedGroup = {
      ...positionGroups[groupIndex],
      name: req.body.name,
      description: req.body.description || '',
      positionIds: req.body.positionIds || positionGroups[groupIndex].positionIds
    };
    
    positionGroups[groupIndex] = updatedGroup;
    fs.writeJsonSync(GROUPS_FILE, positionGroups, { spaces: 2 });
    res.json({ success: true, group: updatedGroup });
    
    // Broadcast group update to all clients
    io.emit('groupsUpdated', positionGroups);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/groups/:id', (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    
    // Remove group reference from positions
    savedPositions.forEach(position => {
      if (position.groupId === groupId) {
        delete position.groupId;
      }
    });
    fs.writeJsonSync(POSITIONS_FILE, savedPositions, { spaces: 2 });
    
    // Remove group
    positionGroups = positionGroups.filter(group => group.id !== groupId);
    fs.writeJsonSync(GROUPS_FILE, positionGroups, { spaces: 2 });
    res.json({ success: true });
    
    // Broadcast updates to all clients
    io.emit('groupsUpdated', positionGroups);
    io.emit('positionsUpdated', savedPositions);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/groups/:groupId/positions/:positionId', (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const positionId = parseInt(req.params.positionId);
    
    const group = positionGroups.find(g => g.id === groupId);
    const position = savedPositions.find(p => p.id === positionId);
    
    if (!group || !position) {
      return res.status(404).json({ success: false, error: 'Group or position not found' });
    }
    
    // Add position to group if not already there
    if (!group.positionIds.includes(positionId)) {
      group.positionIds.push(positionId);
    }
    
    // Set group reference on position
    position.groupId = groupId;
    
    fs.writeJsonSync(GROUPS_FILE, positionGroups, { spaces: 2 });
    fs.writeJsonSync(POSITIONS_FILE, savedPositions, { spaces: 2 });
    res.json({ success: true });
    
    // Broadcast updates to all clients
    io.emit('groupsUpdated', positionGroups);
    io.emit('positionsUpdated', savedPositions);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/groups/:groupId/positions/:positionId', (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const positionId = parseInt(req.params.positionId);
    
    const group = positionGroups.find(g => g.id === groupId);
    const position = savedPositions.find(p => p.id === positionId);
    
    if (!group || !position) {
      return res.status(404).json({ success: false, error: 'Group or position not found' });
    }
    
    // Remove position from group
    group.positionIds = group.positionIds.filter(id => id !== positionId);
    
    // Remove group reference from position
    delete position.groupId;
    
    fs.writeJsonSync(GROUPS_FILE, positionGroups, { spaces: 2 });
    fs.writeJsonSync(POSITIONS_FILE, savedPositions, { spaces: 2 });
    res.json({ success: true });
    
    // Broadcast updates to all clients
    io.emit('groupsUpdated', positionGroups);
    io.emit('positionsUpdated', savedPositions);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// G-code processing endpoint
app.post('/api/gcode/execute', (req, res) => {
  try {
    const { gcode } = req.body;
    console.log('Executing G-code:', gcode);
    
    // TODO: Implement actual G-code parsing and execution
    // For now, just simulate processing
    
    res.json({ success: true, message: 'G-code execution started' });
    io.emit('gcodeStatus', { status: 'executing', progress: 0 });
    
    // Simulate execution progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      io.emit('gcodeStatus', { status: 'executing', progress });
      
      if (progress >= 100) {
        clearInterval(interval);
        io.emit('gcodeStatus', { status: 'completed', progress: 100 });
      }
    }, 500);
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Manual control endpoint
app.post('/api/manual/move', (req, res) => {
  try {
    const { axis, value, manipulator } = req.body;
    console.log('Manual movement:', { axis, value, manipulator });
    
    // TODO: Implement actual hardware communication
    // For now, just broadcast the movement to all clients
    
    io.emit('robotMovement', { axis, value, manipulator, timestamp: Date.now() });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Emergency stop endpoint
app.post('/api/emergency-stop', (req, res) => {
  try {
    console.log('Emergency stop triggered!');
    
    // TODO: Implement actual emergency stop hardware communication
    // This should immediately stop all robot movement and enter safe state
    
    // Broadcast emergency stop to all clients
    io.emit('emergencyStop', { timestamp: Date.now() });
    res.json({ success: true, message: 'Emergency stop activated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Position replay endpoint
app.post('/api/replay/:id', (req, res) => {
  try {
    const positionId = parseInt(req.params.id);
    const position = savedPositions.find(pos => pos.id === positionId);
    
    if (!position) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }
    
    console.log('Replaying position:', position.name);
    
    // TODO: Implement actual position replay
    // For now, just simulate the movement
    
    io.emit('replayStatus', { status: 'starting', position: position.name });
    
    setTimeout(() => {
      io.emit('robotMovement', {
        axes: position.axes,
        manipulators: position.manipulators,
        timestamp: Date.now()
      });
      
      setTimeout(() => {
        io.emit('replayStatus', { status: 'completed', position: position.name });
      }, position.delay || 1000);
    }, 500);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send current configuration and positions to new client
  socket.emit('configUpdated', robotConfig);
  socket.emit('positionsUpdated', savedPositions);
  socket.emit('groupsUpdated', positionGroups);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
  
  // Handle real-time manual control
  socket.on('manualControl', (data) => {
    console.log('Real-time manual control:', data);
    // TODO: Implement real-time hardware communication
    socket.broadcast.emit('robotMovement', data);
  });
  
  // Handle emergency stop
  socket.on('emergencyStop', (data) => {
    console.log('Emergency stop via socket:', data);
    // TODO: Implement emergency stop hardware communication
    socket.broadcast.emit('emergencyStop', data);
  });
});

// Serve React app for all non-API routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});