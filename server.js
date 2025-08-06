const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs-extra');
const MKS57DManager = require('./lib/mks57d-manager');

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
    interface: 'can0',
    baseCanId: 256
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

// Initialize MKS57D Manager
let mks57dManager = null;

async function initializeMKS57D() {
  if (robotConfig.communicationProtocol === 'can') {
    try {
      mks57dManager = new MKS57DManager({
        canConfig: robotConfig.canConfig,
        controllerAddresses: robotConfig.controllerAddresses || [1, 2, 3, 4, 5, 6]
      });
      
      const success = await mks57dManager.initialize();
      if (success) {
        console.log('MKS57D Manager initialized successfully');
      } else {
        console.warn('MKS57D Manager initialization failed');
        mks57dManager = null;
      }
    } catch (error) {
      console.error('Failed to initialize MKS57D Manager:', error);
      mks57dManager = null;
    }
  }
}

// Initialize MKS57D on startup if CAN is configured
if (robotConfig.communicationProtocol === 'can') {
  initializeMKS57D();
}

// API Routes
app.get('/api/config', (req, res) => {
  res.json(robotConfig);
});

app.post('/api/config', async (req, res) => {
  try {
    const oldProtocol = robotConfig.communicationProtocol;
    robotConfig = { ...robotConfig, ...req.body };
    fs.writeJsonSync(CONFIG_FILE, robotConfig, { spaces: 2 });
    
    // Reinitialize MKS57D manager if communication protocol changed to CAN
    if (oldProtocol !== robotConfig.communicationProtocol) {
      if (mks57dManager) {
        await mks57dManager.shutdown();
        mks57dManager = null;
      }
      
      if (robotConfig.communicationProtocol === 'can') {
        await initializeMKS57D();
      }
    }
    
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

// Get current positions endpoint  
app.get('/api/positions/current', async (req, res) => {
  try {
    let currentPositions = {};
    
    // Get current positions from MKS57D manager if available
    if (mks57dManager) {
      try {
        currentPositions = await mks57dManager.getAllPositions();
        console.log('Retrieved current positions from MKS57D controllers');
      } catch (error) {
        console.error('Failed to get current positions:', error);
        currentPositions = { error: 'Failed to read from controllers' };
      }
    } else {
      // Fallback - return default/last known positions
      currentPositions = {
        axis1: 0, axis2: 0, axis3: 0, axis4: 0, axis5: 0, axis6: 0,
        note: 'No MKS57D manager available - returning default positions'
      };
    }
    
    res.json({ success: true, positions: currentPositions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// G-code processing endpoint
app.post('/api/gcode/execute', async (req, res) => {
  try {
    const { gcode } = req.body;
    console.log('Executing G-code:', gcode);
    
    res.json({ success: true, message: 'G-code execution started' });
    io.emit('gcodeStatus', { status: 'executing', progress: 0 });
    
    // Parse and execute G-code using MKS57D manager if available
    if (mks57dManager && gcode) {
      try {
        const lines = gcode.split('\n').map(line => line.trim()).filter(line => line);
        let progress = 0;
        const progressIncrement = 100 / lines.length;
        
        for (const line of lines) {
          if (line.startsWith(';') || !line) continue; // Skip comments and empty lines
          
          try {
            await mks57dManager.executeGCode(line);
            console.log(`Executed G-code line: ${line}`);
          } catch (error) {
            console.error(`Failed to execute G-code line "${line}":`, error);
          }
          
          progress += progressIncrement;
          io.emit('gcodeStatus', { status: 'executing', progress: Math.min(100, Math.round(progress)) });
          
          // Small delay between commands
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        io.emit('gcodeStatus', { status: 'completed', progress: 100 });
      } catch (error) {
        console.error('G-code execution error:', error);
        io.emit('gcodeStatus', { status: 'error', progress: 0, error: error.message });
      }
    } else {
      // Fallback simulation when no MKS57D manager available
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        io.emit('gcodeStatus', { status: 'executing', progress });
        
        if (progress >= 100) {
          clearInterval(interval);
          io.emit('gcodeStatus', { status: 'completed', progress: 100 });
        }
      }, 500);
    }
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Manual control endpoint
app.post('/api/manual/move', async (req, res) => {
  try {
    const { axis, value, manipulator } = req.body;
    console.log('Manual movement:', { axis, value, manipulator });
    
    // Use MKS57D manager if available and axis is specified
    if (mks57dManager && axis && value !== undefined) {
      try {
        const success = await mks57dManager.moveAxis(axis, parseFloat(value));
        if (success) {
          console.log(`Successfully moved ${axis} to ${value} degrees`);
        }
      } catch (error) {
        console.error('MKS57D movement error:', error);
      }
    }
    
    // Always broadcast the movement to all clients for UI updates
    io.emit('robotMovement', { axis, value, manipulator, timestamp: Date.now() });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Emergency stop endpoint
app.post('/api/emergency-stop', async (req, res) => {
  try {
    console.log('Emergency stop triggered!');
    
    // Use MKS57D manager if available
    if (mks57dManager) {
      try {
        const success = await mks57dManager.emergencyStop();
        console.log(`MKS57D emergency stop: ${success ? 'SUCCESS' : 'FAILED'}`);
      } catch (error) {
        console.error('MKS57D emergency stop error:', error);
      }
    }
    
    // Broadcast emergency stop to all clients
    io.emit('emergencyStop', { timestamp: Date.now() });
    res.json({ success: true, message: 'Emergency stop activated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Home all controllers endpoint
app.post('/api/home', async (req, res) => {
  try {
    console.log('Homing all controllers');
    
    let results = {};
    
    // Use MKS57D manager if available
    if (mks57dManager) {
      try {
        results = await mks57dManager.homeAll();
        console.log('MKS57D home results:', results);
      } catch (error) {
        console.error('MKS57D home error:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    } else {
      // Fallback when no MKS57D manager available
      console.log('No MKS57D manager available, simulating home command');
      results = { simulated: true };
    }
    
    // Broadcast home command to all clients
    io.emit('homeCommand', { timestamp: Date.now(), results });
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Position replay endpoint
app.post('/api/replay/:id', async (req, res) => {
  try {
    const positionId = parseInt(req.params.id);
    const position = savedPositions.find(pos => pos.id === positionId);
    
    if (!position) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }
    
    console.log('Replaying position:', position.name);
    
    io.emit('replayStatus', { status: 'starting', position: position.name });
    
    // Use MKS57D manager if available
    if (mks57dManager && position.axes) {
      try {
        const success = await mks57dManager.moveMultipleAxes(position.axes);
        if (success) {
          console.log(`Successfully replayed position: ${position.name}`);
        }
      } catch (error) {
        console.error('MKS57D replay error:', error);
      }
    }
    
    // Broadcast movement for UI updates
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