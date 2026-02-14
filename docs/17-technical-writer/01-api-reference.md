# Arctos Robot Controller - API Reference

## Overview

The Arctos Robot Controller provides a comprehensive REST API for controlling multi-axis robotic arms, managing G-code programs, and monitoring system status. The API uses JSON for data exchange and implements JWT-based authentication with role-based access control.

**Base URL:** `http://localhost:5000/api`  
**Authentication:** Bearer token (JWT)  
**Content-Type:** `application/json`

## Quick Start

### Authentication Flow

1. **Register a new user:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "operator1",
    "email": "operator@company.com", 
    "password": "SecurePassword123!",
    "role": "operator"
  }'
```

2. **Login to get access token:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "operator1",
    "password": "SecurePassword123!"
  }'
```

3. **Use token in subsequent requests:**
```bash
curl -X GET http://localhost:5000/api/config \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Authentication Endpoints

### POST /api/auth/register
Register a new user account.

**Request Body:**
```json
{
  "username": "string (required, 3-50 chars)",
  "email": "string (required, valid email)",
  "password": "string (required, 8+ chars with uppercase, lowercase, number, symbol)",
  "role": "string (optional, default: 'operator')" 
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": 1,
    "username": "operator1",
    "email": "operator@company.com",
    "role": "operator",
    "isActive": true
  }
}
```

### POST /api/auth/login
Authenticate user and receive access token.

**Request Body:**
```json
{
  "username": "string (required)",
  "password": "string (required)"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "refresh_token_string",
  "expiresIn": 3600,
  "user": {
    "id": 1,
    "username": "operator1",
    "role": "operator",
    "permissions": ["read", "write", "execute"]
  }
}
```

### POST /api/auth/refresh
Refresh an expired access token.

**Request Body:**
```json
{
  "refreshToken": "string (required)"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "token": "new_jwt_token",
  "expiresIn": 3600
}
```

### POST /api/auth/logout
Invalidate current session and tokens.

**Headers:** `Authorization: Bearer {token}`

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

## Robot Control Endpoints

### GET /api/config
Get current robot configuration.

**Headers:** `Authorization: Bearer {token}`

**Response (200 OK):**
```json
{
  "robotType": "MKS57D",
  "communicationProtocol": "can",
  "serialConfig": {
    "port": "/dev/ttyUSB0",
    "baudRate": 115200
  },
  "canConfig": {
    "interface": "can0"
  },
  "axes": {
    "count": 6,
    "limits": {
      "axis1": { "min": -180, "max": 180 },
      "axis2": { "min": -90, "max": 90 }
    }
  },
  "manipulators": {
    "count": 1,
    "ranges": {
      "manipulator1": { "min": 0, "max": 100 }
    }
  },
  "safetyLimits": {
    "maxSpeed": 1000,
    "maxAcceleration": 500,
    "emergencyStopEnabled": true
  }
}
```

### POST /api/config
Update robot configuration.

**Headers:** `Authorization: Bearer {token}`  
**Required Role:** `admin` or `technician`

**Request Body:**
```json
{
  "robotType": "MKS57D",
  "communicationProtocol": "can",
  "axes": {
    "count": 6,
    "limits": {
      "axis1": { "min": -180, "max": 180 }
    }
  },
  "safetyLimits": {
    "maxSpeed": 1000,
    "emergencyStopEnabled": true
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Configuration updated successfully",
  "config": { /* updated config object */ }
}
```

### POST /api/robot/move
Move robot to specified position.

**Headers:** `Authorization: Bearer {token}`  
**Required Permission:** `execute`

**Request Body:**
```json
{
  "axes": {
    "axis1": 45.5,
    "axis2": -30.0,
    "axis3": 90.0
  },
  "manipulators": {
    "manipulator1": 50
  },
  "speed": 500,
  "acceleration": 200
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Move command executed",
  "commandId": "cmd_123456",
  "estimatedDuration": 2.5
}
```

### POST /api/robot/stop
Emergency stop all robot movement.

**Headers:** `Authorization: Bearer {token}`

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Emergency stop executed",
  "timestamp": "2025-01-21T10:30:00Z"
}
```

### GET /api/robot/status
Get current robot status and position.

**Headers:** `Authorization: Bearer {token}`

**Response (200 OK):**
```json
{
  "status": "idle", // idle, moving, error, emergency_stop
  "position": {
    "axes": {
      "axis1": 45.5,
      "axis2": -30.0,
      "axis3": 90.0
    },
    "manipulators": {
      "manipulator1": 50
    }
  },
  "isHomed": true,
  "temperature": {
    "motor1": 35.2,
    "motor2": 38.1
  },
  "lastUpdate": "2025-01-21T10:30:00Z"
}
```

## Position Management Endpoints

### GET /api/positions
Get all saved positions.

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `group` (optional): Filter by position group
- `limit` (optional): Maximum number of results (default: 100)
- `offset` (optional): Skip first N results (default: 0)

**Response (200 OK):**
```json
{
  "positions": [
    {
      "id": 1,
      "name": "Home Position",
      "description": "Default home position",
      "axes": {
        "axis1": 0,
        "axis2": 0,
        "axis3": 0
      },
      "manipulators": {
        "manipulator1": 0
      },
      "group": "system",
      "createdAt": "2025-01-21T10:00:00Z",
      "createdBy": "operator1"
    }
  ],
  "total": 1,
  "limit": 100,
  "offset": 0
}
```

### POST /api/positions
Save current position.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "name": "Working Position 1",
  "description": "Position for part assembly",
  "group": "assembly",
  "delay": 1.0
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Position saved successfully",
  "position": {
    "id": 2,
    "name": "Working Position 1",
    "description": "Position for part assembly", 
    "axes": { /* current axis positions */ },
    "manipulators": { /* current manipulator positions */ },
    "group": "assembly",
    "delay": 1.0,
    "createdAt": "2025-01-21T10:30:00Z",
    "createdBy": "operator1"
  }
}
```

### PUT /api/positions/:id
Update an existing position.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "name": "Updated Position Name",
  "description": "Updated description",
  "group": "production",
  "delay": 2.0
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Position updated successfully",
  "position": { /* updated position object */ }
}
```

### DELETE /api/positions/:id
Delete a saved position.

**Headers:** `Authorization: Bearer {token}`

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Position deleted successfully"
}
```

### POST /api/positions/replay
Replay a sequence of saved positions.

**Headers:** `Authorization: Bearer {token}`  
**Required Permission:** `execute`

**Request Body:**
```json
{
  "positionIds": [1, 2, 3],
  "loops": 1,
  "speed": 750,
  "pauseBetween": 0.5
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Replay sequence started",
  "sequenceId": "seq_123456",
  "estimatedDuration": 15.5,
  "positions": 3,
  "loops": 1
}
```

## G-Code Management Endpoints

### GET /api/gcode/programs
Get all G-code programs.

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `search` (optional): Search in program names/descriptions
- `category` (optional): Filter by category
- `limit` (optional): Maximum results (default: 50)
- `offset` (optional): Skip first N results (default: 0)

**Response (200 OK):**
```json
{
  "programs": [
    {
      "id": 1,
      "name": "Simple Rectangle",
      "description": "Draws a 100x50mm rectangle",
      "category": "demo",
      "filename": "rectangle.gcode",
      "size": 2048,
      "lineCount": 45,
      "estimatedDuration": 120.5,
      "createdAt": "2025-01-21T09:00:00Z",
      "modifiedAt": "2025-01-21T09:30:00Z"
    }
  ],
  "total": 1,
  "categories": ["demo", "production", "test"]
}
```

### POST /api/gcode/programs
Upload a new G-code program.

**Headers:** 
- `Authorization: Bearer {token}`
- `Content-Type: multipart/form-data`

**Form Data:**
- `file`: G-code file (.gcode, .nc, .txt)
- `name`: Program name
- `description`: Program description
- `category`: Program category

**Response (201 Created):**
```json
{
  "success": true,
  "message": "G-code program uploaded successfully",
  "program": {
    "id": 2,
    "name": "Custom Program",
    "filename": "custom.gcode",
    "size": 4096,
    "lineCount": 120,
    "validationResults": {
      "isValid": true,
      "warnings": [],
      "errors": []
    }
  }
}
```

### POST /api/gcode/execute/:programId
Execute a G-code program.

**Headers:** `Authorization: Bearer {token}`  
**Required Permission:** `execute`

**Request Body:**
```json
{
  "startLine": 1,
  "endLine": -1,
  "speed": 800,
  "dryRun": false
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "G-code execution started",
  "executionId": "exec_123456",
  "programId": 2,
  "totalLines": 120,
  "estimatedDuration": 300.5
}
```

### GET /api/gcode/execution/:executionId/status
Get G-code execution status.

**Headers:** `Authorization: Bearer {token}`

**Response (200 OK):**
```json
{
  "executionId": "exec_123456",
  "status": "running", // queued, running, paused, completed, error, cancelled
  "progress": {
    "currentLine": 45,
    "totalLines": 120,
    "percentage": 37.5,
    "elapsedTime": 112.3,
    "remainingTime": 188.2
  },
  "currentCommand": "G01 X10.5 Y20.0 F800",
  "errors": [],
  "warnings": ["Speed reduced due to safety limits"]
}
```

### POST /api/gcode/execution/:executionId/pause
Pause G-code execution.

**Headers:** `Authorization: Bearer {token}`

**Response (200 OK):**
```json
{
  "success": true,
  "message": "G-code execution paused",
  "executionId": "exec_123456"
}
```

### POST /api/gcode/execution/:executionId/resume
Resume paused G-code execution.

**Headers:** `Authorization: Bearer {token}`

**Response (200 OK):**
```json
{
  "success": true,
  "message": "G-code execution resumed",
  "executionId": "exec_123456"
}
```

### POST /api/gcode/execution/:executionId/cancel
Cancel G-code execution.

**Headers:** `Authorization: Bearer {token}`

**Response (200 OK):**
```json
{
  "success": true,
  "message": "G-code execution cancelled",
  "executionId": "exec_123456"
}
```

## System Monitoring Endpoints

### GET /api/health
System health check (no authentication required).

**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-21T10:30:00Z",
  "version": "1.0.0",
  "uptime": 86400,
  "services": {
    "database": "healthy",
    "robot": "connected",
    "gcode": "ready"
  }
}
```

### GET /api/system/stats
Get system performance statistics.

**Headers:** `Authorization: Bearer {token}`

**Response (200 OK):**
```json
{
  "system": {
    "cpuUsage": 15.2,
    "memoryUsage": 45.6,
    "diskUsage": 23.1,
    "uptime": 86400
  },
  "robot": {
    "status": "connected",
    "commandsExecuted": 1234,
    "errorsCount": 2,
    "averageResponseTime": 12.5
  },
  "gcode": {
    "programsCount": 15,
    "executionsToday": 8,
    "successRate": 98.5
  }
}
```

### GET /api/system/logs
Get system logs.

**Headers:** `Authorization: Bearer {token}`  
**Required Role:** `admin` or `technician`

**Query Parameters:**
- `level` (optional): Log level filter (error, warn, info, debug)
- `limit` (optional): Maximum results (default: 100)
- `since` (optional): Logs since timestamp (ISO 8601)

**Response (200 OK):**
```json
{
  "logs": [
    {
      "timestamp": "2025-01-21T10:30:00Z",
      "level": "info",
      "message": "Robot moved to position successfully",
      "source": "robot-controller",
      "userId": 1,
      "details": {
        "commandId": "cmd_123456",
        "duration": 2.5
      }
    }
  ],
  "total": 1,
  "hasMore": false
}
```

## WebSocket Events

The API also provides real-time communication through WebSocket events on the same port.

### Connection
```javascript
const socket = io('http://localhost:5000', {
  auth: {
    token: 'your_jwt_token'
  }
});
```

### Events from Server

#### `robotStatus`
Real-time robot status updates.
```javascript
socket.on('robotStatus', (data) => {
  // data: { status, position, temperature, timestamp }
});
```

#### `gcodeProgress`
G-code execution progress updates.
```javascript
socket.on('gcodeProgress', (data) => {
  // data: { executionId, currentLine, percentage, elapsedTime }
});
```

#### `positionUpdated`
Position changes from manual control or programs.
```javascript
socket.on('positionUpdated', (data) => {
  // data: { axes, manipulators, timestamp }
});
```

#### `systemAlert`
System alerts and notifications.
```javascript
socket.on('systemAlert', (data) => {
  // data: { type, level, message, timestamp, details }
});
```

### Events to Server

#### `joinRoom`
Join a room for targeted updates.
```javascript
socket.emit('joinRoom', { room: 'robot-operators' });
```

#### `manualMove`
Send manual movement commands.
```javascript
socket.emit('manualMove', {
  axis: 'axis1',
  direction: 'positive',
  amount: 1.0
});
```

## Error Handling

All API endpoints use consistent error response format:

**Error Response (400/401/403/404/500):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "username",
        "message": "Username must be at least 3 characters"
      }
    ],
    "timestamp": "2025-01-21T10:30:00Z",
    "requestId": "req_123456"
  }
}
```

### Common Error Codes

- `VALIDATION_ERROR`: Invalid request data
- `AUTHENTICATION_REQUIRED`: Missing or invalid token
- `AUTHORIZATION_FAILED`: Insufficient permissions
- `ROBOT_NOT_CONNECTED`: Robot communication error
- `GCODE_PARSING_ERROR`: Invalid G-code syntax
- `SYSTEM_ERROR`: Internal server error
- `RATE_LIMIT_EXCEEDED`: Too many requests

## Rate Limiting

API endpoints have different rate limits based on their criticality:

- **Authentication endpoints**: 5 requests per minute
- **Robot control endpoints**: 60 requests per minute
- **Data retrieval endpoints**: 100 requests per minute
- **File upload endpoints**: 10 requests per hour

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Request limit per window
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Time when limit resets

## SDK and Integration Examples

### JavaScript/Node.js Example
```javascript
const axios = require('axios');

class ArctosRobotAPI {
  constructor(baseURL = 'http://localhost:5000/api') {
    this.baseURL = baseURL;
    this.token = null;
  }

  async login(username, password) {
    const response = await axios.post(`${this.baseURL}/auth/login`, {
      username, password
    });
    this.token = response.data.token;
    return response.data;
  }

  async moveRobot(axes, manipulators = {}) {
    return axios.post(`${this.baseURL}/robot/move`, 
      { axes, manipulators },
      { headers: { Authorization: `Bearer ${this.token}` }}
    );
  }

  async getRobotStatus() {
    const response = await axios.get(`${this.baseURL}/robot/status`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    return response.data;
  }
}

// Usage
const robot = new ArctosRobotAPI();
await robot.login('operator1', 'password');
await robot.moveRobot({ axis1: 45, axis2: -30 });
const status = await robot.getRobotStatus();
```

### Python Example
```python
import requests
import json

class ArctosRobotAPI:
    def __init__(self, base_url='http://localhost:5000/api'):
        self.base_url = base_url
        self.token = None
        
    def login(self, username, password):
        response = requests.post(f'{self.base_url}/auth/login', json={
            'username': username,
            'password': password
        })
        self.token = response.json()['token']
        return response.json()
    
    def move_robot(self, axes, manipulators=None):
        headers = {'Authorization': f'Bearer {self.token}'}
        data = {'axes': axes}
        if manipulators:
            data['manipulators'] = manipulators
        return requests.post(f'{self.base_url}/robot/move', 
                           json=data, headers=headers)

# Usage
robot = ArctosRobotAPI()
robot.login('operator1', 'password')
robot.move_robot({'axis1': 45, 'axis2': -30})
```

---

*API Reference - Last updated: January 21, 2025*  
*Version: 1.0.0*