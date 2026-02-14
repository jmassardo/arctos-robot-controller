# Arctos Robot Controller - Developer Guide

## Overview

This guide provides comprehensive information for developers who want to integrate with, extend, or contribute to the Arctos Robot Controller project. It covers architecture, APIs, development setup, testing, and contribution guidelines.

**Target Audience**: Software developers, system integrators, contributors  
**Prerequisites**: JavaScript/TypeScript experience, basic robotics knowledge  
**Development Setup Time**: 15-30 minutes

## 📚 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Development Environment Setup](#development-environment-setup)
3. [Project Structure](#project-structure)
4. [Backend Development](#backend-development)
5. [Frontend Development](#frontend-development)
6. [API Integration](#api-integration)
7. [Testing Framework](#testing-framework)
8. [Contributing Guidelines](#contributing-guidelines)
9. [Deployment and CI/CD](#deployment-and-cicd)

## 🏗️ Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Arctos Robot Controller                  │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React TypeScript SPA)                           │
│  ├── Components (Manual Control, G-Code, etc.)            │
│  ├── State Management (Context API, Custom Hooks)         │
│  ├── Real-time Communication (Socket.IO Client)           │
│  └── 3D Visualization (Three.js/React Three Fiber)        │
├─────────────────────────────────────────────────────────────┤
│  Backend (Node.js/Express Server)                          │
│  ├── REST API Endpoints                                    │
│  ├── WebSocket Server (Socket.IO)                          │
│  ├── Authentication & Authorization (JWT, 2FA)             │
│  ├── Database Layer (SQLite/PostgreSQL)                    │
│  ├── G-Code Parser & Execution Engine                      │
│  └── Hardware Communication Layer                          │
├─────────────────────────────────────────────────────────────┤
│  Hardware Communication                                     │
│  ├── Serial Port Communication                             │
│  ├── CAN Bus Interface (SocketCAN)                         │
│  ├── RS485 Protocol Support                                │
│  └── Robot Controller Drivers (MKS57D, MKS42D)            │
├─────────────────────────────────────────────────────────────┤
│  Data Layer                                                 │
│  ├── Configuration Management                              │
│  ├── Position Database                                     │
│  ├── G-Code Program Storage                                │
│  ├── User Management & Audit Logs                          │
│  └── System Monitoring Data                                │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

**Frontend:**
- **React 18**: Modern UI framework with hooks and concurrent features
- **TypeScript**: Type-safe JavaScript development
- **Socket.IO Client**: Real-time bidirectional communication
- **React Three Fiber**: 3D robot visualization
- **Axios**: HTTP client for API requests
- **React Router**: Client-side routing

**Backend:**
- **Node.js 18+**: JavaScript runtime environment
- **Express.js**: Web application framework
- **Socket.IO**: Real-time communication server
- **Sequelize**: SQL ORM for database operations
- **JWT**: JSON Web Token authentication
- **Winston**: Logging framework
- **Express Validator**: Input validation middleware

**Hardware Communication:**
- **SerialPort**: Node.js serial port communication
- **SocketCAN**: Linux CAN bus interface
- **Modbus Serial**: RS485 communication protocol

**Development Tools:**
- **ESLint**: Code linting and style enforcement
- **Prettier**: Code formatting
- **Jest**: Unit testing framework
- **Playwright**: End-to-end testing
- **Husky**: Git hooks for quality checks

### Key Design Patterns

**Backend Patterns:**
- **Model-View-Controller (MVC)**: Separation of concerns in API layer
- **Repository Pattern**: Data access abstraction
- **Factory Pattern**: Hardware driver instantiation
- **Observer Pattern**: Event-driven robot status updates
- **Command Pattern**: G-code execution queue management

**Frontend Patterns:**
- **Component Composition**: Reusable UI components
- **Context Provider Pattern**: Global state management
- **Custom Hooks**: Business logic encapsulation
- **Higher-Order Components**: Cross-cutting concerns
- **Render Props**: Component logic sharing

## ⚙️ Development Environment Setup

### Prerequisites Installation

**Required Software:**
```bash
# Node.js 18+ (LTS recommended)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Git for version control
sudo apt install git

# Code editor (VS Code recommended)
sudo snap install --classic code
```

**VS Code Extensions (Recommended):**
- ES7+ React/Redux/React-Native snippets
- TypeScript Hero
- Prettier - Code formatter
- ESLint
- REST Client
- GitLens
- Thunder Client (API testing)

### Project Setup

**Clone and Install:**
```bash
# Clone repository
git clone https://github.com/your-org/arctos-robot-controller.git
cd arctos-robot-controller

# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..

# Copy environment template
cp .env.example .env

# Initialize development database
npm run db:init

# Run initial setup
npm run setup:dev
```

**Environment Configuration:**
```bash
# .env file configuration
NODE_ENV=development
PORT=5000
DB_TYPE=sqlite
DB_PATH=./data/development.db
JWT_SECRET=your-dev-jwt-secret
LOG_LEVEL=debug

# Robot communication (for development)
ROBOT_TYPE=simulation
SIMULATION_MODE=true
```

### Development Workflow

**Start Development Servers:**
```bash
# Terminal 1: Backend server with hot reload
npm run dev

# Terminal 2: Frontend development server
cd client && npm start

# Terminal 3: Watch tests
npm run test:watch
```

**Development URLs:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- API Documentation: http://localhost:5000/api/docs (if enabled)

## 📂 Project Structure

### Backend Structure

```
server.js                 # Main server entry point
package.json              # Dependencies and scripts
├── lib/                  # Core libraries and modules
│   ├── auth.js          # Authentication service
│   ├── database.js      # Database connection and models
│   ├── gcode-parser.js  # G-code parsing and validation
│   ├── hardware/        # Hardware communication modules
│   │   ├── mks57d.js   # MKS57D driver
│   │   └── serial.js   # Serial communication
│   ├── logger.js        # Logging configuration
│   └── security.js      # Security middleware
├── config/              # Configuration files
│   └── robot-config.json
├── data/                # Database and user data
│   ├── gcode-programs/  # Stored G-code files
│   └── saved-positions.json
├── test/                # Test files
│   ├── unit-tests/      # Unit tests
│   ├── integration-tests/ # Integration tests
│   └── e2e-tests/       # End-to-end tests
└── scripts/             # Utility scripts
    ├── setup.js         # Initial setup script
    └── backup.js        # Backup utilities
```

### Frontend Structure

```
client/
├── src/
│   ├── App.tsx          # Main application component
│   ├── index.tsx        # Application entry point
│   ├── components/      # Reusable UI components
│   │   ├── ManualControl.tsx
│   │   ├── GCodeControl.tsx
│   │   ├── PositionReplay.tsx
│   │   └── Configuration.tsx
│   ├── contexts/        # React context providers
│   │   ├── AuthContext.tsx
│   │   └── ThemeContext.tsx
│   ├── hooks/           # Custom React hooks
│   │   ├── useSocket.ts
│   │   ├── useRobot.ts
│   │   └── useAuth.ts
│   ├── utils/           # Utility functions
│   │   ├── api.ts       # API client functions
│   │   ├── validation.ts # Form validation
│   │   └── constants.ts  # Application constants
│   ├── types/           # TypeScript type definitions
│   │   ├── robot.ts     # Robot-related types
│   │   └── api.ts       # API response types
│   └── styles/          # CSS and styling
│       ├── index.css    # Global styles
│       └── components/  # Component-specific styles
├── public/              # Static assets
│   ├── index.html       # HTML template
│   └── manifest.json    # PWA manifest
└── package.json         # Frontend dependencies
```

## 🔧 Backend Development

### API Development

**Creating New Endpoints:**
```javascript
// lib/api/positions.js
const express = require('express');
const router = express.Router();
const { authenticateToken, requirePermission } = require('../auth');
const { Position } = require('../database');

// GET /api/positions
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0, group } = req.query;
    
    const whereClause = group ? { group } : {};
    const positions = await Position.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      positions: positions.rows,
      total: positions.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Error fetching positions:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// POST /api/positions
router.post('/', 
  authenticateToken,
  requirePermission('write'),
  async (req, res) => {
    try {
      const { name, description, group, axes, manipulators } = req.body;
      
      // Validation
      if (!name || !axes) {
        return res.status(400).json({
          success: false,
          error: 'Name and axes are required'
        });
      }

      const position = await Position.create({
        name,
        description,
        group: group || 'default',
        axes,
        manipulators: manipulators || {},
        createdBy: req.user.id
      });

      // Emit real-time update
      req.io.emit('positionCreated', position);

      res.status(201).json({
        success: true,
        message: 'Position created successfully',
        position
      });
    } catch (error) {
      logger.error('Error creating position:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to create position' 
      });
    }
  }
);

module.exports = router;
```

**Database Model Definition:**
```javascript
// lib/models/Position.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Position = sequelize.define('Position', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [1, 100]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    group: {
      type: DataTypes.STRING,
      defaultValue: 'default'
    },
    axes: {
      type: DataTypes.JSON,
      allowNull: false,
      validate: {
        isValidAxes(value) {
          if (!value || typeof value !== 'object') {
            throw new Error('Axes must be an object');
          }
          // Additional validation logic
        }
      }
    },
    manipulators: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    createdBy: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Users',
        key: 'id'
      }
    }
  }, {
    timestamps: true,
    indexes: [
      { fields: ['name'] },
      { fields: ['group'] },
      { fields: ['createdAt'] }
    ]
  });

  Position.associate = (models) => {
    Position.belongsTo(models.User, { 
      foreignKey: 'createdBy', 
      as: 'creator' 
    });
  };

  return Position;
};
```

### Hardware Integration

**Creating Hardware Drivers:**
```javascript
// lib/hardware/CustomRobotDriver.js
const EventEmitter = require('events');
const { SerialPort } = require('serialport');

class CustomRobotDriver extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port || '/dev/ttyUSB0';
    this.baudRate = options.baudRate || 115200;
    this.serialPort = null;
    this.isConnected = false;
    this.currentPosition = {
      axis1: 0, axis2: 0, axis3: 0,
      axis4: 0, axis5: 0, axis6: 0
    };
  }

  async connect() {
    try {
      this.serialPort = new SerialPort({
        path: this.port,
        baudRate: this.baudRate,
        autoOpen: false
      });

      return new Promise((resolve, reject) => {
        this.serialPort.open((error) => {
          if (error) {
            this.emit('error', error);
            reject(error);
            return;
          }

          this.isConnected = true;
          this.emit('connected');
          
          // Set up data parsing
          this.setupDataParser();
          
          resolve(true);
        });
      });
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  setupDataParser() {
    const { ReadlineParser } = require('@serialport/parser-readline');
    const parser = this.serialPort.pipe(new ReadlineParser({ 
      delimiter: '\r\n' 
    }));

    parser.on('data', (data) => {
      this.parseResponse(data);
    });
  }

  parseResponse(data) {
    try {
      // Parse robot responses
      if (data.startsWith('POS:')) {
        // Position update: "POS:X10.5,Y20.0,Z5.0"
        const posData = data.substring(4).split(',');
        const newPosition = {};
        
        posData.forEach((axis) => {
          const [name, value] = axis.split('');
          newPosition[`axis${name}`] = parseFloat(value);
        });
        
        this.currentPosition = { ...this.currentPosition, ...newPosition };
        this.emit('positionUpdated', this.currentPosition);
      } else if (data.startsWith('OK')) {
        this.emit('commandComplete', { success: true });
      } else if (data.startsWith('ERROR:')) {
        this.emit('commandComplete', { 
          success: false, 
          error: data.substring(6) 
        });
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  async sendCommand(command) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Robot not connected'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Command timeout'));
      }, 5000);

      const onComplete = (result) => {
        clearTimeout(timeout);
        this.removeListener('commandComplete', onComplete);
        resolve(result);
      };

      this.once('commandComplete', onComplete);
      this.serialPort.write(command + '\r\n');
    });
  }

  async moveToPosition(axes) {
    const command = `G01 ${Object.entries(axes)
      .map(([axis, value]) => `${axis.toUpperCase()}${value}`)
      .join(' ')}`;
    
    return this.sendCommand(command);
  }

  async home() {
    return this.sendCommand('G28');
  }

  async emergencyStop() {
    return this.sendCommand('M112');
  }

  disconnect() {
    if (this.serialPort && this.serialPort.isOpen) {
      this.serialPort.close();
    }
    this.isConnected = false;
    this.emit('disconnected');
  }
}

module.exports = CustomRobotDriver;
```

### Real-time Communication

**Socket.IO Event Handling:**
```javascript
// lib/socket-handlers.js
const { authenticateSocket } = require('./auth');

function setupSocketHandlers(io) {
  // Authentication middleware
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    console.log(`User ${socket.user.username} connected`);

    // Join user to appropriate rooms based on role
    socket.join(`role_${socket.user.role}`);
    socket.join(`user_${socket.user.id}`);

    // Handle manual movement commands
    socket.on('manualMove', async (data) => {
      try {
        const { axis, direction, amount } = data;
        
        // Validate user permissions
        if (!socket.user.permissions.includes('execute')) {
          socket.emit('error', { message: 'Insufficient permissions' });
          return;
        }

        // Execute movement
        const result = await robotDriver.jog(axis, direction, amount);
        
        // Broadcast position update to all users
        io.emit('positionUpdated', result.position);
        
        socket.emit('moveComplete', { 
          success: result.success,
          position: result.position 
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // Handle G-code execution commands
    socket.on('executeGCode', async (data) => {
      try {
        const { programId, options } = data;
        
        const result = await gcodeManager.execute(programId, {
          ...options,
          userId: socket.user.id,
          onProgress: (progress) => {
            socket.emit('gcodeProgress', progress);
          }
        });

        socket.emit('gcodeStarted', result);
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // Handle position saving
    socket.on('savePosition', async (data) => {
      try {
        const position = await positionService.create({
          ...data,
          createdBy: socket.user.id
        });

        // Notify all users of new position
        io.emit('positionCreated', position);
        
        socket.emit('positionSaved', { 
          success: true, 
          position 
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('disconnect', () => {
      console.log(`User ${socket.user.username} disconnected`);
    });
  });
}

module.exports = setupSocketHandlers;
```

## 🎨 Frontend Development

### React Component Development

**Reusable Component Example:**
```tsx
// src/components/AxisControl.tsx
import React, { useState } from 'react';
import { useSocket } from '../hooks/useSocket';

interface AxisControlProps {
  axis: string;
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onMove?: (axis: string, value: number) => void;
}

const AxisControl: React.FC<AxisControlProps> = ({
  axis,
  label,
  value,
  min,
  max,
  disabled = false,
  onMove
}) => {
  const [isMoving, setIsMoving] = useState(false);
  const socket = useSocket();

  const handleJog = async (direction: 'positive' | 'negative', amount: number) => {
    if (disabled || isMoving) return;

    setIsMoving(true);
    try {
      await socket.emit('manualMove', {
        axis,
        direction,
        amount
      });

      if (onMove) {
        const newValue = direction === 'positive' 
          ? Math.min(value + amount, max)
          : Math.max(value - amount, min);
        onMove(axis, newValue);
      }
    } catch (error) {
      console.error('Movement error:', error);
    } finally {
      setIsMoving(false);
    }
  };

  const isAtLimit = (direction: 'positive' | 'negative') => {
    if (direction === 'positive') return value >= max;
    return value <= min;
  };

  const getPositionColor = () => {
    if (value >= max * 0.9 || value <= min * 0.9) return 'text-red-500';
    if (value >= max * 0.8 || value <= min * 0.8) return 'text-yellow-500';
    return 'text-green-500';
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">{label}</h3>
        <span className={`text-xl font-mono ${getPositionColor()}`}>
          {value.toFixed(1)}°
        </span>
      </div>

      <div className="flex items-center justify-between">
        {/* Large movement buttons */}
        <div className="flex flex-col space-y-1">
          <button
            onClick={() => handleJog('positive', 10)}
            disabled={disabled || isMoving || isAtLimit('positive')}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
          >
            +10
          </button>
          <button
            onClick={() => handleJog('negative', 10)}
            disabled={disabled || isMoving || isAtLimit('negative')}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
          >
            -10
          </button>
        </div>

        {/* Medium movement buttons */}
        <div className="flex flex-col space-y-1">
          <button
            onClick={() => handleJog('positive', 1)}
            disabled={disabled || isMoving || isAtLimit('positive')}
            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300"
          >
            +1
          </button>
          <button
            onClick={() => handleJog('negative', 1)}
            disabled={disabled || isMoving || isAtLimit('negative')}
            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300"
          >
            -1
          </button>
        </div>

        {/* Fine movement buttons */}
        <div className="flex flex-col space-y-1">
          <button
            onClick={() => handleJog('positive', 0.1)}
            disabled={disabled || isMoving || isAtLimit('positive')}
            className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-300"
          >
            +0.1
          </button>
          <button
            onClick={() => handleJog('negative', 0.1)}
            disabled={disabled || isMoving || isAtLimit('negative')}
            className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-300"
          >
            -0.1
          </button>
        </div>
      </div>

      {/* Position indicator bar */}
      <div className="mt-3">
        <div className="relative h-2 bg-gray-200 rounded">
          <div
            className="absolute h-2 bg-blue-500 rounded"
            style={{
              width: `${((value - min) / (max - min)) * 100}%`
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{min}°</span>
          <span>{max}°</span>
        </div>
      </div>

      {isMoving && (
        <div className="mt-2 text-center text-sm text-blue-500">
          Moving...
        </div>
      )}
    </div>
  );
};

export default AxisControl;
```

### Custom Hooks

**Robot Communication Hook:**
```tsx
// src/hooks/useRobot.ts
import { useState, useEffect } from 'react';
import { useSocket } from './useSocket';

interface RobotState {
  position: Record<string, number>;
  status: 'idle' | 'moving' | 'error' | 'emergency_stop';
  isConnected: boolean;
  isHomed: boolean;
  temperature: Record<string, number>;
  lastUpdate: Date | null;
}

export const useRobot = () => {
  const [robotState, setRobotState] = useState<RobotState>({
    position: {},
    status: 'idle',
    isConnected: false,
    isHomed: false,
    temperature: {},
    lastUpdate: null
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    // Handle real-time robot status updates
    socket.on('robotStatus', (status: Partial<RobotState>) => {
      setRobotState(prev => ({
        ...prev,
        ...status,
        lastUpdate: new Date()
      }));
      setIsLoading(false);
    });

    // Handle position updates
    socket.on('positionUpdated', (position: Record<string, number>) => {
      setRobotState(prev => ({
        ...prev,
        position,
        lastUpdate: new Date()
      }));
    });

    // Handle connection status
    socket.on('robotConnected', () => {
      setRobotState(prev => ({ ...prev, isConnected: true }));
      setError(null);
    });

    socket.on('robotDisconnected', () => {
      setRobotState(prev => ({ ...prev, isConnected: false }));
      setError('Robot connection lost');
    });

    // Handle errors
    socket.on('robotError', (errorMsg: string) => {
      setError(errorMsg);
      setRobotState(prev => ({ ...prev, status: 'error' }));
    });

    // Initial status request
    socket.emit('getRobotStatus');

    return () => {
      socket.off('robotStatus');
      socket.off('positionUpdated');
      socket.off('robotConnected');
      socket.off('robotDisconnected');
      socket.off('robotError');
    };
  }, [socket]);

  const moveToPosition = async (position: Record<string, number>) => {
    if (!socket || !robotState.isConnected) {
      throw new Error('Robot not connected');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Movement timeout'));
      }, 30000);

      const onComplete = (result: { success: boolean; error?: string }) => {
        clearTimeout(timeout);
        socket.off('moveComplete', onComplete);
        
        if (result.success) {
          resolve(result);
        } else {
          reject(new Error(result.error || 'Movement failed'));
        }
      };

      socket.on('moveComplete', onComplete);
      socket.emit('moveToPosition', position);
    });
  };

  const emergencyStop = async () => {
    if (!socket) throw new Error('Socket not connected');
    
    return new Promise((resolve) => {
      socket.emit('emergencyStop');
      socket.once('emergencyStopComplete', resolve);
    });
  };

  const homeRobot = async () => {
    if (!socket || !robotState.isConnected) {
      throw new Error('Robot not connected');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Homing timeout'));
      }, 60000);

      const onComplete = (result: { success: boolean; error?: string }) => {
        clearTimeout(timeout);
        socket.off('homeComplete', onComplete);
        
        if (result.success) {
          setRobotState(prev => ({ ...prev, isHomed: true }));
          resolve(result);
        } else {
          reject(new Error(result.error || 'Homing failed'));
        }
      };

      socket.on('homeComplete', onComplete);
      socket.emit('homeRobot');
    });
  };

  return {
    robotState,
    isLoading,
    error,
    actions: {
      moveToPosition,
      emergencyStop,
      homeRobot
    }
  };
};
```

### State Management with Context

**Robot Context Provider:**
```tsx
// src/contexts/RobotContext.tsx
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';

interface RobotState {
  // ... (same as above)
}

type RobotAction =
  | { type: 'SET_POSITION'; payload: Record<string, number> }
  | { type: 'SET_STATUS'; payload: RobotState['status'] }
  | { type: 'SET_CONNECTION'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_LOADING'; payload: boolean };

const robotReducer = (state: RobotState, action: RobotAction): RobotState => {
  switch (action.type) {
    case 'SET_POSITION':
      return { ...state, position: action.payload, lastUpdate: new Date() };
    case 'SET_STATUS':
      return { ...state, status: action.payload };
    case 'SET_CONNECTION':
      return { ...state, isConnected: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
};

const RobotContext = createContext<{
  state: RobotState;
  dispatch: React.Dispatch<RobotAction>;
} | null>(null);

export const RobotProvider: React.FC<{ children: React.ReactNode }> = ({ 
  children 
}) => {
  const [state, dispatch] = useReducer(robotReducer, initialRobotState);
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    socket.on('positionUpdated', (position) => {
      dispatch({ type: 'SET_POSITION', payload: position });
    });

    socket.on('robotStatus', (status) => {
      dispatch({ type: 'SET_STATUS', payload: status });
    });

    // ... other event handlers

    return () => {
      socket.off('positionUpdated');
      socket.off('robotStatus');
    };
  }, [socket]);

  return (
    <RobotContext.Provider value={{ state, dispatch }}>
      {children}
    </RobotContext.Provider>
  );
};

export const useRobotContext = () => {
  const context = useContext(RobotContext);
  if (!context) {
    throw new Error('useRobotContext must be used within RobotProvider');
  }
  return context;
};
```

## 🧪 Testing Framework

### Unit Testing

**Jest Configuration:**
```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'test-results/coverage',
  collectCoverageFrom: [
    'lib/**/*.js',
    '!lib/**/*.test.js',
    '!lib/test-helpers/**'
  ],
  testMatch: [
    '**/test/unit-tests/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

**Backend Unit Test Example:**
```javascript
// test/unit-tests/position-service.test.js
const { PositionService } = require('../../lib/services/position-service');
const { Position, User } = require('../../lib/database');

jest.mock('../../lib/database');

describe('PositionService', () => {
  let positionService;
  let mockUser;

  beforeEach(() => {
    positionService = new PositionService();
    mockUser = { id: 1, username: 'testuser', role: 'operator' };
    jest.clearAllMocks();
  });

  describe('createPosition', () => {
    it('should create position with valid data', async () => {
      const positionData = {
        name: 'Test Position',
        description: 'A test position',
        axes: { axis1: 10, axis2: 20 },
        manipulators: { gripper1: 50 }
      };

      const mockPosition = { id: 1, ...positionData, createdBy: mockUser.id };
      Position.create.mockResolvedValue(mockPosition);

      const result = await positionService.createPosition(positionData, mockUser);

      expect(Position.create).toHaveBeenCalledWith({
        ...positionData,
        group: 'default',
        createdBy: mockUser.id
      });
      expect(result).toEqual(mockPosition);
    });

    it('should throw error for invalid axis data', async () => {
      const invalidData = {
        name: 'Invalid Position',
        axes: 'invalid' // Should be object
      };

      await expect(
        positionService.createPosition(invalidData, mockUser)
      ).rejects.toThrow('Invalid axes data');
    });

    it('should set default group if not provided', async () => {
      const positionData = {
        name: 'Test Position',
        axes: { axis1: 10 }
      };

      Position.create.mockResolvedValue({ id: 1, ...positionData });

      await positionService.createPosition(positionData, mockUser);

      expect(Position.create).toHaveBeenCalledWith(
        expect.objectContaining({ group: 'default' })
      );
    });
  });

  describe('getPositions', () => {
    it('should return paginated positions', async () => {
      const mockPositions = {
        rows: [
          { id: 1, name: 'Position 1' },
          { id: 2, name: 'Position 2' }
        ],
        count: 2
      };

      Position.findAndCountAll.mockResolvedValue(mockPositions);

      const result = await positionService.getPositions({
        limit: 10,
        offset: 0
      });

      expect(result).toEqual({
        positions: mockPositions.rows,
        total: mockPositions.count,
        limit: 10,
        offset: 0
      });
    });

    it('should filter by group when specified', async () => {
      const options = { group: 'production', limit: 10, offset: 0 };
      
      Position.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await positionService.getPositions(options);

      expect(Position.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { group: 'production' }
        })
      );
    });
  });
});
```

**Frontend Component Test Example:**
```tsx
// src/components/__tests__/AxisControl.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AxisControl from '../AxisControl';
import { useSocket } from '../../hooks/useSocket';

jest.mock('../../hooks/useSocket');

const mockUseSocket = useSocket as jest.MockedFunction<typeof useSocket>;

describe('AxisControl', () => {
  const defaultProps = {
    axis: 'axis1',
    label: 'X Axis',
    value: 45.5,
    min: -180,
    max: 180
  };

  const mockSocket = {
    emit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    off: jest.fn()
  };

  beforeEach(() => {
    mockUseSocket.mockReturnValue(mockSocket);
    jest.clearAllMocks();
  });

  it('renders axis label and current position', () => {
    render(<AxisControl {...defaultProps} />);
    
    expect(screen.getByText('X Axis')).toBeInTheDocument();
    expect(screen.getByText('45.5°')).toBeInTheDocument();
  });

  it('displays movement buttons', () => {
    render(<AxisControl {...defaultProps} />);
    
    expect(screen.getByText('+10')).toBeInTheDocument();
    expect(screen.getByText('-10')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('-1')).toBeInTheDocument();
    expect(screen.getByText('+0.1')).toBeInTheDocument();
    expect(screen.getByText('-0.1')).toBeInTheDocument();
  });

  it('sends jog command when button is clicked', async () => {
    render(<AxisControl {...defaultProps} />);
    
    const plusButton = screen.getByText('+1');
    fireEvent.click(plusButton);

    await waitFor(() => {
      expect(mockSocket.emit).toHaveBeenCalledWith('manualMove', {
        axis: 'axis1',
        direction: 'positive',
        amount: 1
      });
    });
  });

  it('disables buttons when at limits', () => {
    render(<AxisControl {...defaultProps} value={180} />);
    
    const plusButtons = screen.getAllByText(text => text.startsWith('+'));
    plusButtons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });

  it('shows loading state during movement', async () => {
    mockSocket.emit.mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 100))
    );

    render(<AxisControl {...defaultProps} />);
    
    const plusButton = screen.getByText('+1');
    fireEvent.click(plusButton);

    expect(screen.getByText('Moving...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('Moving...')).not.toBeInTheDocument();
    });
  });

  it('calls onMove callback when movement completes', async () => {
    const mockOnMove = jest.fn();
    
    render(<AxisControl {...defaultProps} onMove={mockOnMove} />);
    
    const plusButton = screen.getByText('+1');
    fireEvent.click(plusButton);

    await waitFor(() => {
      expect(mockOnMove).toHaveBeenCalledWith('axis1', 46.5);
    });
  });

  it('applies correct color based on position', () => {
    const { rerender } = render(<AxisControl {...defaultProps} value={170} />);
    
    // Near max limit should be yellow
    expect(screen.getByText('170.0°')).toHaveClass('text-yellow-500');

    rerender(<AxisControl {...defaultProps} value={175} />);
    
    // Very near max limit should be red
    expect(screen.getByText('175.0°')).toHaveClass('text-red-500');

    rerender(<AxisControl {...defaultProps} value={45} />);
    
    // Normal position should be green
    expect(screen.getByText('45.0°')).toHaveClass('text-green-500');
  });
});
```

### Integration Testing

**API Integration Test:**
```javascript
// test/integration-tests/positions-api.test.js
const request = require('supertest');
const app = require('../../server');
const { sequelize, Position, User } = require('../../lib/database');

describe('Positions API Integration', () => {
  let server;
  let authToken;
  let testUser;

  beforeAll(async () => {
    // Set up test database
    await sequelize.sync({ force: true });
    
    // Create test user
    testUser = await User.create({
      username: 'testuser',
      email: 'test@example.com',
      password: 'hashedpassword',
      role: 'operator'
    });

    // Get auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testuser',
        password: 'testpassword'
      });
    
    authToken = loginResponse.body.token;
    
    server = app.listen(0); // Random port for testing
  });

  afterAll(async () => {
    await sequelize.close();
    server.close();
  });

  beforeEach(async () => {
    // Clean positions before each test
    await Position.destroy({ where: {} });
  });

  describe('POST /api/positions', () => {
    it('should create a new position', async () => {
      const positionData = {
        name: 'Test Position',
        description: 'Integration test position',
        axes: { axis1: 10, axis2: 20, axis3: 30 },
        manipulators: { gripper1: 50 }
      };

      const response = await request(app)
        .post('/api/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(positionData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.position.name).toBe(positionData.name);
      expect(response.body.position.axes).toEqual(positionData.axes);

      // Verify position was saved to database
      const savedPosition = await Position.findOne({ 
        where: { name: positionData.name } 
      });
      expect(savedPosition).toBeTruthy();
      expect(savedPosition.createdBy).toBe(testUser.id);
    });

    it('should return 400 for invalid data', async () => {
      const response = await request(app)
        .post('/api/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: '' }) // Invalid: empty name
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });

    it('should return 401 without authentication', async () => {
      await request(app)
        .post('/api/positions')
        .send({ name: 'Test', axes: {} })
        .expect(401);
    });
  });

  describe('GET /api/positions', () => {
    beforeEach(async () => {
      // Create test positions
      await Position.bulkCreate([
        {
          name: 'Position 1',
          axes: { axis1: 10 },
          group: 'test',
          createdBy: testUser.id
        },
        {
          name: 'Position 2',
          axes: { axis1: 20 },
          group: 'production',
          createdBy: testUser.id
        }
      ]);
    });

    it('should return all positions', async () => {
      const response = await request(app)
        .get('/api/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.positions).toHaveLength(2);
      expect(response.body.total).toBe(2);
    });

    it('should filter positions by group', async () => {
      const response = await request(app)
        .get('/api/positions?group=test')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.positions).toHaveLength(1);
      expect(response.body.positions[0].group).toBe('test');
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/positions?limit=1&offset=0')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.positions).toHaveLength(1);
      expect(response.body.limit).toBe(1);
      expect(response.body.offset).toBe(0);
    });
  });
});
```

## 🚀 Contributing Guidelines

### Development Workflow

**Branch Naming Convention:**
```
feature/add-new-robot-driver
bugfix/fix-position-validation
hotfix/security-vulnerability
docs/update-api-documentation
```

**Commit Message Format:**
```
type(scope): brief description

Longer description explaining the change and why it was made.

- List any breaking changes
- Reference issue numbers: Fixes #123
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Code Quality Standards

**ESLint Configuration:**
```javascript
// .eslintrc.js
module.exports = {
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended'
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  rules: {
    // Security rules
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    
    // Code quality rules
    'complexity': ['warn', 10],
    'max-depth': ['warn', 4],
    'max-lines-per-function': ['warn', 50],
    'no-magic-numbers': ['warn', { ignore: [0, 1, -1] }],
    
    // TypeScript specific
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    
    // React specific
    'react/prop-types': 'off', // Using TypeScript for prop validation
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn'
  },
  env: {
    node: true,
    browser: true,
    es2021: true
  }
};
```

**Pre-commit Hooks:**
```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged",
      "commit-msg": "commitlint -E HUSKY_GIT_PARAMS"
    }
  },
  "lint-staged": {
    "*.{js,ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,css}": [
      "prettier --write"
    ]
  }
}
```

### Testing Requirements

**Test Coverage Targets:**
- Unit tests: 80%+ line coverage
- Integration tests: All API endpoints
- E2E tests: Critical user workflows
- Performance tests: Response time < 200ms

**Required Tests for New Features:**
```javascript
// Example test checklist for new API endpoint:
describe('New Feature Tests', () => {
  // ✓ Happy path
  it('should work with valid input');
  
  // ✓ Error handling
  it('should handle invalid input');
  it('should handle database errors');
  
  // ✓ Authentication/Authorization
  it('should require authentication');
  it('should check user permissions');
  
  // ✓ Edge cases
  it('should handle empty input');
  it('should handle maximum input size');
  
  // ✓ Integration
  it('should work with real database');
  it('should emit correct socket events');
});
```

### Pull Request Process

**PR Template:**
```markdown
## Description
Brief description of changes and motivation.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated and passing
- [ ] Integration tests added/updated and passing
- [ ] E2E tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Code is commented where necessary
- [ ] Documentation updated
- [ ] No console.log statements left in code
- [ ] Performance impact considered
```

**Review Requirements:**
- All CI/CD checks must pass
- At least 2 reviewers for breaking changes
- Security review for authentication/authorization changes
- Performance review for database changes
- Documentation review for API changes

### Security Guidelines

**Input Validation:**
```javascript
// Always validate and sanitize input
const { body, validationResult } = require('express-validator');

router.post('/api/positions',
  [
    body('name')
      .isLength({ min: 1, max: 100 })
      .matches(/^[a-zA-Z0-9\s\-_]+$/)
      .escape(),
    body('axes')
      .isObject()
      .custom(validateAxesObject)
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
);
```

**Authentication Security:**
```javascript
// Use secure JWT practices
const jwt = require('jsonwebtoken');

function generateToken(user) {
  return jwt.sign(
    { 
      userId: user.id, 
      role: user.role 
    },
    process.env.JWT_SECRET,
    { 
      expiresIn: '1h',
      issuer: 'arctos-robot-controller',
      audience: 'arctos-users'
    }
  );
}
```

## 📦 Deployment and CI/CD

### GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:13
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: |
        npm ci
        cd client && npm ci
    
    - name: Run linting
      run: npm run lint
    
    - name: Run backend tests
      run: npm run test:unit
      env:
        NODE_ENV: test
        DATABASE_URL: postgres://postgres:postgres@localhost/test
    
    - name: Run frontend tests
      run: cd client && npm test -- --coverage --watchAll=false
    
    - name: Build frontend
      run: npm run build
    
    - name: Run integration tests
      run: npm run test:integration
    
    - name: Run E2E tests
      run: |
        npm start &
        npm run test:e2e
    
    - name: Upload coverage reports
      uses: codecov/codecov-action@v2
      with:
        files: ./coverage/lcov.info,./client/coverage/lcov.info

  security:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    
    - name: Run security audit
      run: npm audit --production --audit-level high
    
    - name: Run dependency security scan
      uses: securecodewarrior/github-action-add-sarif@v1
      with:
        sarif-file: security-scan-results.sarif

  deploy:
    needs: [test, security]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Build Docker image
      run: docker build -t arctos-robot-controller:${{ github.sha }} .
    
    - name: Deploy to staging
      run: |
        # Deploy to staging environment
        echo "Deploying to staging..."
    
    - name: Run smoke tests
      run: |
        # Run basic smoke tests against staging
        curl -f https://staging.arctos-robotics.com/api/health
```

### Docker Configuration

**Multi-stage Dockerfile:**
```dockerfile
# Dockerfile
FROM node:18-alpine AS builder

# Build frontend
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci --only=production

COPY client/ ./
RUN npm run build

# Build backend
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS production

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S arctos -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=arctos:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=arctos:nodejs /app/client/build ./client/build
COPY --chown=arctos:nodejs . .

# Create data directories
RUN mkdir -p data logs config && \
    chown -R arctos:nodejs data logs config

# Set up health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

USER arctos

EXPOSE 5000

CMD ["node", "server.js"]
```

### Environment Configuration

**Production Environment Variables:**
```bash
# .env.production
NODE_ENV=production
PORT=5000

# Database
DB_TYPE=postgresql
DB_HOST=postgres-server
DB_PORT=5432
DB_NAME=arctos_robot_prod
DB_USER=arctos_user
DB_PASSWORD=${DB_PASSWORD}

# Security
JWT_SECRET=${JWT_SECRET}
BCRYPT_ROUNDS=12

# Logging
LOG_LEVEL=info
LOG_FILE=true
LOG_PATH=/app/logs

# Robot Communication
ROBOT_TYPE=MKS57D
COMMUNICATION_PROTOCOL=can
CAN_INTERFACE=can0

# Monitoring
ENABLE_METRICS=true
HEALTH_CHECK_INTERVAL=30000
```

---

*Developer Guide v1.0 - Updated January 21, 2025*  
*For the latest version: docs.arctos-robotics.com/developer-guide*