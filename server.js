const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs-extra');

// TODO: Uncomment these imports when lib/ directory with MKS hardware modules is available
// const { MKS42DController, GCodeTranslator } = require('./lib/mks42d');
// const MKS57DManager = require('./lib/mks57d-manager');

const { MKS42DController, GCodeTranslator } = require('./lib/mks42d');
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
const GROUPS_FILE = path.join(__dirname, 'data', 'position-groups.json');

// Ensure config and data directories exist
fs.ensureDirSync(path.join(__dirname, 'config'));
fs.ensureDirSync(path.join(__dirname, 'data'));

// Default configuration
const defaultConfig = {
  robotType: 'arctos',
  communicationProtocol: 'can',
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
  },
  mks42d: {
    enabled: true,
    simulationMode: true,
    controllers: [
      { id: 1, name: 'Base Controller', axes: ['X', 'Y'], type: 'axis' },
      { id: 2, name: 'Z-Axis Controller', axes: ['Z'], type: 'axis' },
      { id: 3, name: 'Gripper Controller', axes: ['E'], type: 'gripper' }
    ],
    stepsPerMM: { x: 80, y: 80, z: 400, e: 93 },
    maxSpeed: { x: 3000, y: 3000, z: 1500, e: 2000 },
    homingSpeed: 1000
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



// Initialize MKS42D controller
// TODO: Uncomment when lib/ directory with MKS hardware modules is available  
let mks42d = null;
let gcodeTranslator = null;

/* 
// Uncomment when lib/ modules are available:


// Initialize MKS42D controller
let mks42d = null;
let gcodeTranslator = null;


if (robotConfig.mks42d && robotConfig.mks42d.enabled) {
  try {
    mks42d = new MKS42DController({
      interface: robotConfig.canConfig.interface,
      controllers: robotConfig.mks42d.controllers,
      simulationMode: robotConfig.mks42d.simulationMode
    });

    gcodeTranslator = new GCodeTranslator(mks42d, {
      stepsPerMM: robotConfig.mks42d.stepsPerMM,
      maxSpeed: robotConfig.mks42d.maxSpeed,
      homingSpeed: robotConfig.mks42d.homingSpeed
    });

    // Set up event listeners
    mks42d.on('connected', () => {
      console.log('MKS42D: Controller connected');
      io.emit('mks42dStatus', { status: 'connected' });
    });

    mks42d.on('disconnected', () => {
      console.log('MKS42D: Controller disconnected');
      io.emit('mks42dStatus', { status: 'disconnected' });
    });

    mks42d.on('positionUpdated', (data) => {
      io.emit('positionUpdated', data);
    });

    mks42d.on('homeStarted', (data) => {
      io.emit('homeStatus', { status: 'started', ...data });
    });

    mks42d.on('commandAck', (data) => {
      if (data.success) {
        io.emit('homeStatus', { status: 'completed', controllerId: data.controllerId });
      }
    });

    // Connect to CAN interface
    mks42d.connect().then(success => {
      if (success) {
        console.log('MKS42D: Successfully initialized');
      } else {
        console.error('MKS42D: Failed to initialize');
      }
    });

  } catch (error) {
    console.error('Error initializing MKS42D:', error);
  }
}

*/


// Initialize MKS57D Manager
// TODO: Uncomment when lib/ directory with MKS hardware modules is available
let mks57dManager = null;

/* 
// Uncomment when lib/ modules are available:

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

*/



// API Routes
app.get('/api/config', (req, res) => {
  res.json(robotConfig);
});

app.post('/api/config', async (req, res) => {
  try {

    const oldConfig = { ...robotConfig };
    robotConfig = { ...robotConfig, ...req.body };
    fs.writeJsonSync(CONFIG_FILE, robotConfig, { spaces: 2 });
    

    // Reinitialize MKS42D if config changed
    const mks42dConfigChanged = JSON.stringify(oldConfig.mks42d) !== JSON.stringify(robotConfig.mks42d);
    const canConfigChanged = JSON.stringify(oldConfig.canConfig) !== JSON.stringify(robotConfig.canConfig);
    
    if ((mks42dConfigChanged || canConfigChanged) && robotConfig.mks42d && robotConfig.mks42d.enabled) {
      try {
        // Disconnect existing controller
        if (mks42d) {
          mks42d.disconnect();
        }
        
        // Create new controller with updated config
        mks42d = new MKS42DController({
          interface: robotConfig.canConfig.interface,
          controllers: robotConfig.mks42d.controllers,
          simulationMode: robotConfig.mks42d.simulationMode
        });

        gcodeTranslator = new GCodeTranslator(mks42d, {
          stepsPerMM: robotConfig.mks42d.stepsPerMM,
          maxSpeed: robotConfig.mks42d.maxSpeed,
          homingSpeed: robotConfig.mks42d.homingSpeed
        });

        // Reconnect
        await mks42d.connect();
        console.log('MKS42D: Reinitialized with new configuration');
        
      } catch (error) {
        console.error('Error reinitializing MKS42D:', error);
9
      }
    }

    const oldProtocol = oldConfig.communicationProtocol;

    
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
    */
    
    
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

// Get current positions from controllers
app.get('/api/positions/current', async (req, res) => {
  try {
    if (mks42d && robotConfig.mks42d.enabled) {
      const positions = await mks42d.getAllPositions();
      res.json({ success: true, positions });
    } else {
      // Return simulated positions
      res.json({ 
        success: true, 
        positions: { 1: { x: 0, y: 0, z: 0, e: 0 } },
        mode: 'simulation'
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/positions', async (req, res) => {
  try {
    let currentAxes = req.body.axes;
    let currentManipulators = req.body.manipulators;
    
    // If no positions provided, get current positions from controllers
    if (!currentAxes && mks42d && robotConfig.mks42d.enabled) {
      try {
        const controllerPositions = await mks42d.getAllPositions();
        // Convert controller positions to axes format
        currentAxes = {};
        currentManipulators = {};
        
        // Aggregate positions from all controllers based on their axis configuration
        for (const controller of mks42d.controllers) {
          const pos = controllerPositions[controller.id] || { x: 0, y: 0, z: 0, e: 0 };
          
          if (controller.axes.includes('X')) currentAxes.axis1 = pos.x;
          if (controller.axes.includes('Y')) currentAxes.axis2 = pos.y;  
          if (controller.axes.includes('Z')) currentAxes.axis3 = pos.z;
          if (controller.type === 'gripper') currentManipulators.gripper1 = pos.e;
        }
      } catch (error) {
        console.warn('Failed to get current positions from controllers:', error);
        // Fall back to provided values or defaults
        currentAxes = req.body.axes || {};
        currentManipulators = req.body.manipulators || {};
      }
    }
    
    const newPosition = {
      id: Date.now(),
      name: req.body.name,
      axes: currentAxes,
      manipulators: currentManipulators,
      delay: req.body.delay || 0,
      groupId: req.body.groupId || null,
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

// Edit position endpoint
app.put('/api/positions/:id', (req, res) => {
  try {
    const positionId = parseInt(req.params.id);
    const positionIndex = savedPositions.findIndex(pos => pos.id === positionId);
    
    if (positionIndex === -1) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }
    
    // Update position with new data
    const updatedPosition = {
      ...savedPositions[positionIndex],
      ...req.body,
      id: positionId, // Ensure ID doesn't change
      timestamp: new Date().toISOString()
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

// Reorder positions endpoint
app.post('/api/positions/reorder', (req, res) => {
  try {
    const { orderedIds } = req.body;
    
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, error: 'orderedIds must be an array' });
    }
    
    // Reorder savedPositions based on the provided order
    const reorderedPositions = [];
    
    // First add positions in the specified order
    for (const id of orderedIds) {
      const position = savedPositions.find(pos => pos.id === parseInt(id));
      if (position) {
        reorderedPositions.push(position);
      }
    }
    
    // Then add any positions not in the ordered list (shouldn't happen, but safety check)
    for (const position of savedPositions) {
      if (!orderedIds.includes(position.id.toString())) {
        reorderedPositions.push(position);
      }
    }
    
    savedPositions = reorderedPositions;
    fs.writeJsonSync(POSITIONS_FILE, savedPositions, { spaces: 2 });
    
    res.json({ success: true });
    
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
      timestamp: new Date().toISOString()
    };
    
    positionGroups.push(newGroup);
    fs.writeJsonSync(GROUPS_FILE, positionGroups, { spaces: 2 });
    
    res.json({ success: true, group: newGroup });
    
    // Broadcast groups update to all clients
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
    
    const updatedGroup = {
      ...positionGroups[groupIndex],
      ...req.body,
      id: groupId, // Ensure ID doesn't change
      timestamp: new Date().toISOString()
    };
    
    positionGroups[groupIndex] = updatedGroup;
    fs.writeJsonSync(GROUPS_FILE, positionGroups, { spaces: 2 });
    
    res.json({ success: true, group: updatedGroup });
    
    // Broadcast groups update to all clients
    io.emit('groupsUpdated', positionGroups);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/groups/:id', (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    
    // Remove the group
    positionGroups = positionGroups.filter(group => group.id !== groupId);
    fs.writeJsonSync(GROUPS_FILE, positionGroups, { spaces: 2 });
    
    // Remove group assignment from positions
    savedPositions = savedPositions.map(pos => ({
      ...pos,
      groupId: pos.groupId === groupId ? null : pos.groupId
    }));
    fs.writeJsonSync(POSITIONS_FILE, savedPositions, { spaces: 2 });
    
    res.json({ success: true });
    
    // Broadcast updates to all clients
    io.emit('groupsUpdated', positionGroups);
    io.emit('positionsUpdated', savedPositions);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Assign position to group
app.post('/api/groups/:groupId/positions/:positionId', (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const positionId = parseInt(req.params.positionId);
    
    // Find the position
    const position = savedPositions.find(pos => pos.id === positionId);
    if (!position) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }
    
    // Find the group
    const group = positionGroups.find(g => g.id === groupId);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    
    // Update position's group assignment
    position.groupId = groupId;
    fs.writeJsonSync(POSITIONS_FILE, savedPositions, { spaces: 2 });
    
    res.json({ success: true });
    
    // Broadcast positions update to all clients
    io.emit('positionsUpdated', savedPositions);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove position from group
app.delete('/api/groups/:groupId/positions/:positionId', (req, res) => {
  try {
    const positionId = parseInt(req.params.positionId);
    
    // Find the position
    const position = savedPositions.find(pos => pos.id === positionId);
    if (!position) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }
    
    // Remove group assignment
    position.groupId = null;
    fs.writeJsonSync(POSITIONS_FILE, savedPositions, { spaces: 2 });
    
    res.json({ success: true });
    
    // Broadcast positions update to all clients
    io.emit('positionsUpdated', savedPositions);

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
    

    if (mks42d && robotConfig.mks42d.enabled) {
      // Use MKS42D controllers for actual hardware communication
      if (axis) {
        // Find controllers that handle this axis
        const controllerIds = mks42d.controllers
          .filter(c => c.axes.includes(axis.toUpperCase()))
          .map(c => c.id);
          
        if (controllerIds.length > 0) {
          // Convert axis letter to number
          const axisNumber = { 'X': 0, 'Y': 1, 'Z': 2, 'E': 3 }[axis.toUpperCase()] || 0;
          
          // Send move command to all relevant controllers
          const results = [];
          for (const controllerId of controllerIds) {
            try {
              await mks42d.moveAbsolute(controllerId, axisNumber, value, 1000);
              results.push({ controllerId, success: true });
            } catch (error) {
              results.push({ controllerId, success: false, error: error.message });
            }
          }
          
          io.emit('robotMovement', { 
            axis, 
            value, 
            controllers: controllerIds, 
            results,
            timestamp: Date.now() 
          });
          
          res.json({ success: true, controllers: controllerIds, results });
        } else {
          res.json({ success: false, error: `No controllers configured for axis ${axis}` });
        }
      } else if (manipulator) {
        // Handle manipulator movement (gripper)
        const gripperControllers = mks42d.controllers.filter(c => c.type === 'gripper');
        
        if (gripperControllers.length > 0) {
          const results = [];
          for (const controller of gripperControllers) {
            try {
              await mks42d.moveAbsolute(controller.id, 3, value, 500); // E-axis for gripper
              results.push({ controllerId: controller.id, success: true });
            } catch (error) {
              results.push({ controllerId: controller.id, success: false, error: error.message });
            }
          }
          
          io.emit('robotMovement', { 
            manipulator, 
            value, 
            controllers: gripperControllers.map(c => c.id),
            results,
            timestamp: Date.now() 
          });
          
          res.json({ success: true, controllers: gripperControllers.map(c => c.id), results });
        } else {
          res.json({ success: false, error: 'No gripper controllers configured' });
        }
      }
    } else {
      // Fallback to simulation mode
      io.emit('robotMovement', { axis, value, manipulator, timestamp: Date.now() });
      res.json({ success: true, mode: 'simulation' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Home endpoint
app.post('/api/home', async (req, res) => {
  try {
    const { axes } = req.body; // Optional: specific axes to home
    console.log('Homing requested:', axes || 'all axes');
    
    if (mks42d && robotConfig.mks42d.enabled) {
      let controllerIds = [];
      
      if (axes && axes.length > 0) {
        // Home specific axes
        axes.forEach(axis => {
          const axisControllers = mks42d.controllers
            .filter(c => c.axes.includes(axis.toUpperCase()))
            .map(c => c.id);
          controllerIds.push(...axisControllers);
        });
        // Remove duplicates
        controllerIds = [...new Set(controllerIds)];
      } else {
        // Home all controllers
        controllerIds = mks42d.controllers.map(c => c.id);
      }
      
      if (controllerIds.length > 0) {
        const results = await mks42d.goHome(controllerIds);
        io.emit('homeStatus', { status: 'started', controllers: controllerIds });
        res.json({ success: true, controllers: controllerIds, results });
      } else {
        res.json({ success: false, error: 'No controllers found for specified axes' });
      }
    } else {
      // Fallback to simulation
      io.emit('homeStatus', { status: 'started', mode: 'simulation' });
      setTimeout(() => {
        io.emit('homeStatus', { status: 'completed', mode: 'simulation' });
      }, 2000);
      res.json({ success: true, mode: 'simulation' });
    }


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
    

    if (mks42d && robotConfig.mks42d.enabled) {
      // Use MKS42D controllers for actual emergency stop
      const results = await mks42d.stop();
      io.emit('emergencyStop', { timestamp: Date.now(), results });
      res.json({ success: true, message: 'Emergency stop activated', results });
    } else {
      // Fallback to simulation
      io.emit('emergencyStop', { timestamp: Date.now(), mode: 'simulation' });
      res.json({ success: true, message: 'Emergency stop activated (simulation)' });
    }

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


    if (mks42d && robotConfig.mks42d.enabled) {
      // Use MKS42D controllers for actual position replay
      io.emit('replayStatus', { status: 'starting', position: position.name });
      
      try {
        // Move each axis to its saved position
        const results = [];
        
        for (const [axis, value] of Object.entries(position.axes)) {
          const axisUpper = axis.toUpperCase();
          const controllerIds = mks42d.controllers
            .filter(c => c.axes.includes(axisUpper))
            .map(c => c.id);
            
          if (controllerIds.length > 0) {
            const axisNumber = { 'X': 0, 'Y': 1, 'Z': 2, 'E': 3 }[axisUpper] || 0;
            
            for (const controllerId of controllerIds) {
              try {
                await mks42d.moveAbsolute(controllerId, axisNumber, value, 1000);
                results.push({ axis, controllerId, success: true });
              } catch (error) {
                results.push({ axis, controllerId, success: false, error: error.message });
              }
            }
          }
        }
        
        // Handle manipulators
        for (const [manipulator, value] of Object.entries(position.manipulators)) {
          const gripperControllers = mks42d.controllers.filter(c => c.type === 'gripper');
          
          for (const controller of gripperControllers) {
            try {
              await mks42d.moveAbsolute(controller.id, 3, value, 500);
              results.push({ manipulator, controllerId: controller.id, success: true });
            } catch (error) {
              results.push({ manipulator, controllerId: controller.id, success: false, error: error.message });
            }
          }
        }
        
        // Wait for position delay
        if (position.delay) {
          await new Promise(resolve => setTimeout(resolve, position.delay));
        }
        
        io.emit('robotMovement', {
          axes: position.axes,
          manipulators: position.manipulators,
          timestamp: Date.now(),
          results
        });
        
        io.emit('replayStatus', { status: 'completed', position: position.name, results });
        res.json({ success: true, results });
        
      } catch (error) {
        io.emit('replayStatus', { status: 'error', position: position.name, error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    } else {
      // Fallback to simulation mode
      io.emit('replayStatus', { status: 'starting', position: position.name });


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

      io.emit('replayStatus', { status: 'completed', position: position.name });
    }, position.delay || 1000);
    
    res.json({ success: true });

      setTimeout(() => {
        io.emit('robotMovement', {
          axes: position.axes,
          manipulators: position.manipulators,
          timestamp: Date.now(),
          mode: 'simulation'
        });
        
        setTimeout(() => {
          io.emit('replayStatus', { status: 'completed', position: position.name, mode: 'simulation' });
        }, position.delay || 1000);
      }, 500);
      
      res.json({ success: true, mode: 'simulation' });
    }

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send current configuration, positions, and groups to new client
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
