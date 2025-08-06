# Arctos Robot Controller

A comprehensive web-based graphical interface for controlling multi-axis robotic arms. This application provides manual control, G-code execution, and position replay functionality for robotic arms.

## Features

### Manual Control
- Manual axis control for up to 8 axes with configurable limits
- Manual control for up to 2 manipulators (grippers)
- Real-time position feedback
- Position recording and saving

### Automatic Control
- G-code parsing and execution
- Real-time execution status and progress tracking
- Built-in G-code editor with syntax reference
- Execution history

### Position Replay
- Save current arm positions with custom names and delays
- Replay individual positions or create sequences
- Multi-loop execution support
- Configurable delays between positions

### Configuration Management
- Support for multiple robot types (Arctos, Generic, Custom)
- Multiple communication protocols (Serial, CAN Bus, RS485)
- Configurable axis limits and manipulator ranges
- Persistent configuration storage

## Supported Hardware

### Arctos Robotic Arms
- Open loop and closed loop systems
- Compatible with Canable USB-CAN protocol adapter
- Support for MK42 and MKS57D stepper controllers
- End stop limit switch integration

## Technology Stack

- **Backend**: Node.js, Express.js, Socket.IO
- **Frontend**: React with TypeScript
- **Communication**: Serial Port, CAN Bus, RS485
- **Real-time Updates**: WebSocket communication

## Installation

### Prerequisites
- Node.js 16 or higher
- npm or yarn package manager

### Backend Setup
```bash
# Install backend dependencies
npm install

# Start the server
npm start

# For development (with auto-reload)
npm run dev
```

### Frontend Setup
```bash
# Install frontend dependencies
cd client
npm install

# Start the development server
npm start

# Build for production
npm run build
```

## Usage

1. **Start the Backend Server**
   ```bash
   npm start
   ```
   The server will run on `http://localhost:5000`

2. **Start the Frontend (Development)**
   ```bash
   cd client
   npm start
   ```
   The frontend will run on `http://localhost:3000` and proxy API requests to the backend.

3. **Configuration**
   - Navigate to the Configuration tab
   - Select your robot type and communication protocol
   - Configure axis limits and manipulator ranges
   - Save the configuration

4. **Manual Control**
   - Use sliders to control individual axes
   - Control manipulators (grippers)
   - Save positions for later replay

5. **G-code Control**
   - Enter G-code commands in the editor
   - Execute programs with real-time progress tracking
   - View execution history

6. **Position Replay**
   - Select saved positions
   - Configure sequence parameters
   - Execute single positions or complex sequences

## API Endpoints

- `GET /api/config` - Get current configuration
- `POST /api/config` - Update configuration
- `GET /api/positions` - Get saved positions
- `POST /api/positions` - Save new position
- `DELETE /api/positions/:id` - Delete position
- `POST /api/gcode/execute` - Execute G-code
- `POST /api/manual/move` - Manual movement command
- `POST /api/replay/:id` - Replay position

## Development

### Project Structure
```
├── server.js              # Express server and API routes
├── package.json           # Backend dependencies
├── client/                # React frontend application
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── App.tsx        # Main application component
│   │   └── index.tsx      # Application entry point
│   └── package.json       # Frontend dependencies
├── config/                # Configuration files
└── data/                  # Saved positions and data
```

### Adding New Features
1. Add API endpoints in `server.js`
2. Create React components in `client/src/components/`
3. Update the main App component to include new tabs/features
4. Add styles to `client/src/index.css`

## Configuration Files

### Robot Configuration (`config/robot-config.json`)
Contains robot type, communication settings, axis limits, and manipulator ranges.

### Saved Positions (`data/saved-positions.json`)
Contains saved arm positions with names, delays, and timestamps.

## Communication Protocols

### Serial Communication
- Configurable port and baud rate
- Standard RS-232 protocol

### CAN Bus
- Requires CAN interface (e.g., Canable adapter)
- Configurable CAN interface name

### RS485
- Configurable port and baud rate
- Multi-drop communication support

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support and documentation, visit the [Arctos Robotics website](https://arctosrobotics.com/#Assembly)