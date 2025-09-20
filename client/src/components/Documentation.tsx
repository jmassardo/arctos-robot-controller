import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface DocSection {
  id: string;
  title: string;
  category: 'getting-started' | 'manual-control' | 'gcode' | 'configuration' | 'security' | 'api';
  content: string;
  keywords: string[];
  lastUpdated: string;
}

interface APIEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  parameters?: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  response: {
    type: string;
    description: string;
    example?: string;
  };
  requiresAuth: boolean;
  requiredRoles?: string[];
}

const Documentation: React.FC = () => {
  const { state } = useAuth();
  const [activeCategory, setActiveCategory] = useState<string>('getting-started');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredSections, setFilteredSections] = useState<DocSection[]>([]);
  const [showAPIReference, setShowAPIReference] = useState(false);

  const docSections: DocSection[] = [
    {
      id: 'intro',
      title: 'Introduction to Arctos Robot Controller',
      category: 'getting-started',
      content: `
# Welcome to Arctos Robot Controller

Arctos Robot Controller is a comprehensive web-based interface for controlling multi-axis robotic arms with advanced features including:

- **Manual Control**: Direct axis control with real-time feedback
- **G-Code Execution**: Industry-standard G-code programming support
- **Position Management**: Save and replay complex motion sequences
- **Security Features**: Role-based access control and audit logging
- **2FA Authentication**: Enhanced security with time-based tokens

## Quick Start

1. **Login**: Use your credentials to access the system
2. **Configure Robot**: Set up your robot parameters in the Configuration tab
3. **Manual Control**: Test individual axis movements
4. **G-Code Programs**: Create and execute motion programs
5. **Position Replay**: Save and reuse common positions

## System Requirements

- Modern web browser (Chrome, Firefox, Safari, Edge)
- Network connection to robot controller
- Appropriate user permissions for desired features
      `,
      keywords: ['introduction', 'overview', 'quick start', 'getting started'],
      lastUpdated: '2024-01-19'
    },
    {
      id: 'manual-control-basics',
      title: 'Manual Control Basics',
      category: 'manual-control',
      content: `
# Manual Control Guide

The Manual Control interface provides direct control over individual robot axes and the gripper system.

## Axis Control

### Jog Controls
- **+ Button**: Move axis in positive direction by configured step size
- **- Button**: Move axis in negative direction by configured step size
- **Position Display**: Shows current axis position in degrees or mm

### Step Size Configuration
- Adjust step size for coarse (10°) or fine (0.1°) movements
- Different step sizes available for different precision requirements

## Gripper Control

### Gripper Positions
- **Open**: Fully open gripper (0% closed)
- **50%**: Half-closed position
- **Close**: Fully closed gripper (100% closed)

### Safety Features
- Automatic position limits prevent over-extension
- Real-time feedback shows current position
- Emergency stop functionality available

## Position Saving

### Save Current Position
1. Move robot to desired position using jog controls
2. Enter descriptive name for position
3. Click "Save Current Position"
4. Position stored for later replay

### Best Practices
- Use descriptive position names
- Test positions before saving
- Regular backup of saved positions recommended
      `,
      keywords: ['manual', 'jog', 'axis', 'gripper', 'position', 'control'],
      lastUpdated: '2024-01-19'
    },
    {
      id: 'gcode-programming',
      title: 'G-Code Programming Guide',
      category: 'gcode',
      content: `
# G-Code Programming

G-Code is the standard language for controlling CNC machines and robotic systems. Arctos supports a comprehensive set of G-code commands.

## Supported Commands

### Motion Commands
- **G0**: Rapid positioning (straight line, maximum speed)
- **G1**: Linear interpolation (controlled feed rate)
- **G2**: Clockwise circular interpolation
- **G3**: Counter-clockwise circular interpolation

### Coordinate Systems
- **G90**: Absolute positioning mode (default)
- **G91**: Incremental positioning mode

### Feed Rate and Speed
- **F**: Set feed rate (units per minute)
- **S**: Set spindle/tool speed

## Programming Examples

### Basic Movement
\`\`\`gcode
G90          ; Absolute positioning
G0 X10 Y10   ; Rapid move to (10,10)
G1 X20 Y20 F100  ; Linear move at 100 units/min
\`\`\`

### Circular Motion
\`\`\`gcode
G90              ; Absolute positioning
G0 X0 Y10        ; Move to start position
G2 X10 Y0 I5 J-5 F50  ; Clockwise arc, center at (5,5)
\`\`\`

### Complex Program
\`\`\`gcode
; Square pattern with rounded corners
G90 F100
G0 X0 Y0
G1 X10 Y0
G2 X12 Y2 I2 J0
G1 X12 Y8
G2 X10 Y10 I0 J2
G1 X2 Y10
G2 X0 Y8 I-2 J0
G1 X0 Y2
G2 X2 Y0 I0 J-2
\`\`\`

## Simulation and Validation

### Program Validation
- Syntax checking before execution
- Workspace boundary validation
- Collision detection (if configured)

### Execution Modes
- **Simulation**: Preview program without moving robot
- **Single Step**: Execute one command at a time
- **Continuous**: Run complete program

## Best Practices

1. **Always simulate first**: Test programs in simulation mode
2. **Use comments**: Document your code with ; comments
3. **Check workspace limits**: Ensure all movements are within bounds
4. **Start with low feed rates**: Test with slow speeds initially
5. **Emergency stop ready**: Keep stop button accessible
      `,
      keywords: ['gcode', 'programming', 'G0', 'G1', 'G2', 'G3', 'simulation'],
      lastUpdated: '2024-01-19'
    },
    {
      id: 'security-features',
      title: 'Security and Access Control',
      category: 'security',
      content: `
# Security Features

Arctos Robot Controller includes comprehensive security features to protect your system and control access.

## User Authentication

### Login System
- Secure password-based authentication
- Session management with automatic timeout
- Failed login attempt protection

### Two-Factor Authentication (2FA)
- TOTP-based authentication using apps like Google Authenticator
- Backup codes for account recovery
- Required for admin accounts (configurable)

## Role-Based Access Control

### User Roles
- **Admin**: Full system access and user management
- **Operator**: Robot control and program execution
- **Viewer**: Read-only access to system status

### Permission System
- Granular permissions for different features
- Resource-based access control
- Audit trail for all actions

## Audit Logging

### Logged Activities
- User login/logout events
- Configuration changes
- G-code program execution
- Position modifications
- Security events

### Audit Trail Features
- Comprehensive activity logging
- IP address tracking
- Session tracking
- Searchable log history
- Export functionality

## Security Best Practices

1. **Strong Passwords**: Use complex passwords with mixed characters
2. **Enable 2FA**: Add extra security layer with 2FA
3. **Regular Monitoring**: Review audit logs regularly
4. **Access Reviews**: Periodically review user access rights
5. **Network Security**: Secure network connections to robot
6. **Regular Updates**: Keep system software updated
      `,
      keywords: ['security', 'authentication', '2fa', 'roles', 'permissions', 'audit'],
      lastUpdated: '2024-01-19'
    },
    {
      id: 'configuration-guide',
      title: 'System Configuration',
      category: 'configuration',
      content: `
# System Configuration

Proper configuration ensures optimal robot performance and safety.

## Robot Configuration

### Basic Settings
- **Robot Type**: Select your robot model
- **Communication Protocol**: Serial, TCP/IP, or CAN Bus
- **Connection Settings**: Port, baud rate, IP address
- **Update Rate**: Control loop frequency

### Axis Configuration
- **Axis Count**: Number of controllable axes
- **Axis Names**: Custom names for each axis
- **Position Limits**: Software limits for safety
- **Home Positions**: Reference positions for calibration

### Safety Settings
- **Emergency Stop**: Hardware and software e-stop configuration
- **Speed Limits**: Maximum axis velocities
- **Acceleration Limits**: Maximum axis accelerations
- **Workspace Boundaries**: 3D workspace definition

## Advanced Configuration

### Kinematics
- **Forward Kinematics**: Joint to Cartesian transformation
- **Inverse Kinematics**: Cartesian to joint transformation
- **Tool Offset**: End effector position compensation
- **Base Offset**: Robot mounting position

### Communication
- **Protocol Settings**: Modbus, RS485, or custom protocols
- **Error Handling**: Timeout and retry settings
- **Diagnostic Mode**: Enhanced debugging information

## Configuration Management

### Backup and Restore
- **Export Configuration**: Save settings to file
- **Import Configuration**: Load settings from file
- **Configuration History**: Track changes over time
- **Default Settings**: Reset to factory defaults

### Validation
- **Settings Validation**: Check for valid parameter ranges
- **Connection Testing**: Verify robot communication
- **Calibration Check**: Ensure proper robot calibration
      `,
      keywords: ['configuration', 'setup', 'robot', 'axes', 'safety', 'kinematics'],
      lastUpdated: '2024-01-19'
    }
  ];

  const apiEndpoints: APIEndpoint[] = [
    {
      method: 'POST',
      path: '/api/auth/login',
      description: 'Authenticate user and create session',
      parameters: [
        { name: 'username', type: 'string', required: true, description: 'User login name' },
        { name: 'password', type: 'string', required: true, description: 'User password' },
        { name: 'totp', type: 'string', required: false, description: '2FA token if enabled' }
      ],
      response: {
        type: 'object',
        description: 'Authentication result with user info and token',
        example: '{"success": true, "user": {"id": "123", "username": "admin", "role": "admin"}, "token": "jwt-token"}'
      },
      requiresAuth: false
    },
    {
      method: 'GET',
      path: '/api/robot/status',
      description: 'Get current robot status and position',
      response: {
        type: 'object',
        description: 'Current robot state including axis positions and status',
        example: '{"connected": true, "axes": {"X": 10.5, "Y": 20.0, "Z": 0}, "gripper": {"position": 50}}'
      },
      requiresAuth: true,
      requiredRoles: ['admin', 'operator', 'viewer']
    },
    {
      method: 'POST',
      path: '/api/robot/jog',
      description: 'Jog robot axis by specified amount',
      parameters: [
        { name: 'axis', type: 'string', required: true, description: 'Axis name (X, Y, Z, etc.)' },
        { name: 'direction', type: 'string', required: true, description: 'Direction (positive/negative)' },
        { name: 'step', type: 'number', required: true, description: 'Step size in degrees or mm' }
      ],
      response: {
        type: 'object',
        description: 'Jog operation result',
        example: '{"success": true, "newPosition": 15.5}'
      },
      requiresAuth: true,
      requiredRoles: ['admin', 'operator']
    },
    {
      method: 'POST',
      path: '/api/gcode/execute',
      description: 'Execute G-code program',
      parameters: [
        { name: 'code', type: 'string', required: true, description: 'G-code program text' },
        { name: 'simulate', type: 'boolean', required: false, description: 'Run in simulation mode' }
      ],
      response: {
        type: 'object',
        description: 'Execution status and progress',
        example: '{"success": true, "executionId": "exec-123", "status": "running"}'
      },
      requiresAuth: true,
      requiredRoles: ['admin', 'operator']
    },
    {
      method: 'GET',
      path: '/api/positions',
      description: 'Get saved robot positions',
      response: {
        type: 'array',
        description: 'List of saved positions',
        example: '[{"id": "pos-1", "name": "Home", "axes": {"X": 0, "Y": 0, "Z": 0}}]'
      },
      requiresAuth: true,
      requiredRoles: ['admin', 'operator', 'viewer']
    },
    {
      method: 'POST',
      path: '/api/positions',
      description: 'Save new robot position',
      parameters: [
        { name: 'name', type: 'string', required: true, description: 'Position name' },
        { name: 'axes', type: 'object', required: true, description: 'Axis positions' },
        { name: 'gripper', type: 'object', required: false, description: 'Gripper position' }
      ],
      response: {
        type: 'object',
        description: 'Saved position details',
        example: '{"success": true, "position": {"id": "pos-2", "name": "Pickup", "axes": {...}}}'
      },
      requiresAuth: true,
      requiredRoles: ['admin', 'operator']
    }
  ];

  useEffect(() => {
    let filtered = docSections;
    
    if (activeCategory !== 'all') {
      filtered = filtered.filter(section => section.category === activeCategory);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(section =>
        section.title.toLowerCase().includes(query) ||
        section.content.toLowerCase().includes(query) ||
        section.keywords.some(keyword => keyword.toLowerCase().includes(query))
      );
    }
    
    setFilteredSections(filtered);
  }, [activeCategory, searchQuery]);

  const categories = [
    { id: 'all', name: 'All Topics', icon: '📚' },
    { id: 'getting-started', name: 'Getting Started', icon: '🚀' },
    { id: 'manual-control', name: 'Manual Control', icon: '🎮' },
    { id: 'gcode', name: 'G-Code', icon: '⚙️' },
    { id: 'configuration', name: 'Configuration', icon: '⚙️' },
    { id: 'security', name: 'Security', icon: '🔒' },
    { id: 'api', name: 'API Reference', icon: '🔧' }
  ];

  const renderContent = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let currentElement: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeLanguage = '';

    lines.forEach((line, index) => {
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          // End code block
          elements.push(
            <pre key={`code-${index}`} className="code-block">
              <code className={codeLanguage ? `language-${codeLanguage}` : ''}>
                {currentElement.join('\n')}
              </code>
            </pre>
          );
          currentElement = [];
          inCodeBlock = false;
          codeLanguage = '';
        } else {
          // Start code block
          inCodeBlock = true;
          codeLanguage = line.replace('```', '').trim();
        }
        return;
      }

      if (inCodeBlock) {
        currentElement.push(line);
        return;
      }

      if (line.startsWith('# ')) {
        elements.push(<h1 key={index} className="doc-h1">{line.replace('# ', '')}</h1>);
      } else if (line.startsWith('## ')) {
        elements.push(<h2 key={index} className="doc-h2">{line.replace('## ', '')}</h2>);
      } else if (line.startsWith('### ')) {
        elements.push(<h3 key={index} className="doc-h3">{line.replace('### ', '')}</h3>);
      } else if (line.startsWith('- **')) {
        const match = line.match(/^- \*\*(.*?)\*\*: (.*)$/);
        if (match) {
          elements.push(
            <div key={index} className="doc-list-item">
              <strong>{match[1]}:</strong> {match[2]}
            </div>
          );
        }
      } else if (line.startsWith('- ')) {
        elements.push(<div key={index} className="doc-list-item">{line.replace('- ', '• ')}</div>);
      } else if (line.trim() && !line.match(/^\d+\./)) {
        elements.push(<p key={index} className="doc-paragraph">{line}</p>);
      } else if (line.match(/^\d+\./)) {
        elements.push(<div key={index} className="doc-numbered-item">{line}</div>);
      }
    });

    return elements;
  };

  const renderAPIReference = () => (
    <div className="api-reference">
      <h2 className="doc-h2">API Reference</h2>
      <p className="doc-paragraph">
        Complete REST API documentation for integrating with Arctos Robot Controller.
      </p>
      
      {apiEndpoints.map((endpoint, index) => (
        <div key={index} className="api-endpoint">
          <div className="api-header">
            <span className={`api-method method-${endpoint.method.toLowerCase()}`}>
              {endpoint.method}
            </span>
            <code className="api-path">{endpoint.path}</code>
          </div>
          
          <p className="api-description">{endpoint.description}</p>
          
          <div className="api-auth">
            {endpoint.requiresAuth ? (
              <span className="auth-required">🔒 Authentication Required</span>
            ) : (
              <span className="auth-none">🌐 Public Endpoint</span>
            )}
            {endpoint.requiredRoles && (
              <span className="required-roles">
                Roles: {endpoint.requiredRoles.join(', ')}
              </span>
            )}
          </div>
          
          {endpoint.parameters && (
            <div className="api-section">
              <h4>Parameters</h4>
              <div className="parameter-list">
                {endpoint.parameters.map((param, paramIndex) => (
                  <div key={paramIndex} className="parameter">
                    <code className="param-name">{param.name}</code>
                    <span className={`param-type ${param.required ? 'required' : 'optional'}`}>
                      {param.type} {param.required ? '(required)' : '(optional)'}
                    </span>
                    <div className="param-description">{param.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="api-section">
            <h4>Response</h4>
            <div className="response-info">
              <span className="response-type">Type: {endpoint.response.type}</span>
              <p>{endpoint.response.description}</p>
              {endpoint.response.example && (
                <pre className="response-example">
                  <code>{endpoint.response.example}</code>
                </pre>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="documentation-container">
      <div className="doc-sidebar">
        <div className="doc-search">
          <input
            type="text"
            placeholder="Search documentation..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="doc-search-input"
          />
        </div>
        
        <div className="doc-categories">
          {categories.map(category => (
            <button
              key={category.id}
              className={`doc-category ${activeCategory === category.id ? 'active' : ''}`}
              onClick={() => {
                setActiveCategory(category.id);
                setShowAPIReference(category.id === 'api');
              }}
            >
              <span className="category-icon">{category.icon}</span>
              {category.name}
            </button>
          ))}
        </div>
        
        {state.user && (
          <div className="doc-user-info">
            <div className="user-role">
              Role: {state.user.role}
            </div>
            <div className="access-level">
              {state.user.role === 'admin' ? 'Full Access' :
               state.user.role === 'operator' ? 'Control Access' : 'View Only'}
            </div>
          </div>
        )}
      </div>
      
      <div className="doc-content">
        {showAPIReference ? (
          renderAPIReference()
        ) : filteredSections.length > 0 ? (
          filteredSections.map(section => (
            <div key={section.id} className="doc-section">
              <div className="doc-meta">
                <span className="doc-category-tag">{section.category}</span>
                <span className="doc-updated">Updated: {section.lastUpdated}</span>
              </div>
              {renderContent(section.content)}
            </div>
          ))
        ) : (
          <div className="no-results">
            <h2>No documentation found</h2>
            <p>Try adjusting your search terms or selecting a different category.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Documentation;