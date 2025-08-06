# Arctos Robot Controller
Web-based graphical interface for controlling multi-axis robotic arms with manual control, G-code execution, and position replay functionality.

**ALWAYS reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Working Effectively

### Bootstrap, Build, and Test the Repository
Run these commands in sequence to set up the development environment:

1. **Install backend dependencies**:
   ```bash
   npm install
   ```
   - Takes ~30 seconds
   - No issues expected

2. **Install frontend dependencies**:
   ```bash
   cd client && npm install
   ```
   - **NEVER CANCEL: Takes 6+ minutes. Set timeout to 10+ minutes.**
   - Expect many deprecation warnings - these are normal and do not affect functionality
   - Dependencies include React 18, TypeScript, Socket.IO client, Axios

3. **Build the frontend for production**:
   ```bash
   cd client && npm run build
   ```
   - Takes ~30 seconds
   - Creates optimized build in `client/build/`
   - Alternative: `npm run build` from root also works

4. **Run linting (frontend only)**:
   ```bash
   cd client && npx eslint src/ --ext .ts,.tsx
   ```
   - Takes a few seconds
   - Currently no linting errors expected

### Run the Application

**ALWAYS run both backend and frontend servers for full functionality.**

1. **Start the backend server** (in first terminal):
   ```bash
   npm start
   ```
   - Starts immediately on `http://localhost:5000`
   - For development with auto-reload: `npm run dev` (requires nodemon)

2. **Start the frontend development server** (in second terminal):
   ```bash
   cd client && npm start
   ```
   - Takes ~30 seconds to compile and start
   - Runs on `http://localhost:3000`
   - Proxies API requests to backend on port 5000
   - Hot reload enabled for development

3. **Access the application**:
   - Navigate to `http://localhost:3000`
   - Verify "Connected" status appears in the header
   - All 4 tabs should be functional: Manual Control, G-Code Control, Position Replay, Configuration

## Validation

**ALWAYS manually validate any changes through complete end-to-end scenarios.**

### Required End-to-End Validation Workflow
After making any code changes, run through this complete validation:

1. **Start both servers** as described above
2. **Manual Control Tab**:
   - Click jog buttons (+/-) for any axis - verify axis values change
   - Click gripper buttons (Open/50%/Close) - verify gripper values change  
   - Enter a position name and click "Save Current Position" - verify success alert
3. **Position Replay Tab**:
   - Verify saved position appears with correct details
   - Select the position checkbox and click "Replay" - verify replay works
4. **G-Code Control Tab**:
   - Click "Load Sample" to load sample G-code
   - Click "Execute G-Code" - verify status changes to "EXECUTING" with progress
5. **Configuration Tab**:
   - Change any setting (robot type, communication protocol, axis limits)
   - Click "Save Configuration" - verify success

### Real-time WebSocket Validation
- **CRITICAL**: All changes should update in real-time across browser tabs
- Open multiple tabs to `http://localhost:3000` 
- Make changes in one tab, verify they appear immediately in other tabs
- This validates the Socket.IO real-time communication

### Build and Production Validation
```bash
npm run build
NODE_ENV=production npm start
```
- Navigate to `http://localhost:5000` (note: port 5000, not 3000)
- Verify application works identically to development mode

## Common Tasks

### Adding New API Endpoints
1. **Add route in `server.js`** around line 100-200 with other API routes
2. **Add error handling** - follow pattern of existing endpoints
3. **Emit Socket.IO events** for real-time updates if needed
4. **Test the endpoint** using browser dev tools or manual testing

### Adding New React Components  
1. **Create component** in `client/src/components/`
2. **Import in `client/src/App.tsx`** 
3. **Add to tab system** if needed (modify `renderTabContent()` function)
4. **Update styles** in `client/src/index.css`

### Configuration and Data Files
- **Robot config**: `config/robot-config.json` (auto-created)
- **Saved positions**: `data/saved-positions.json` (auto-created)
- Both directories are auto-created by the server if they don't exist

## Repository Structure

```
├── server.js              # Express server, API routes, Socket.IO
├── package.json           # Backend dependencies and scripts
├── client/                # React frontend application
│   ├── src/
│   │   ├── App.tsx        # Main application with tab system
│   │   ├── index.tsx      # Application entry point
│   │   ├── index.css      # All application styles
│   │   └── components/    # React components for each tab
│   │       ├── ManualControl.tsx
│   │       ├── GCodeControl.tsx
│   │       ├── PositionReplay.tsx
│   │       └── Configuration.tsx
│   ├── package.json       # Frontend dependencies
│   └── public/            # Static assets
├── config/                # Robot configuration (auto-created)
├── data/                  # Saved positions data (auto-created)
└── .github/               # GitHub configuration
```

## Key Project Files

### Backend (`server.js`)
- **Lines 1-35**: Dependencies and middleware setup
- **Lines 36-65**: Configuration and data file handling
- **Lines 66-104**: Default robot configuration
- **Lines 105-200**: API routes (`/api/config`, `/api/positions`, `/api/gcode/execute`, etc.)
- **Lines 250-284**: Socket.IO real-time communication handling

### Frontend (`client/src/App.tsx`)
- **Lines 1-30**: TypeScript interfaces and imports
- **Lines 31-50**: Socket.IO connection setup
- **Lines 51-80**: Configuration and position loading
- **Lines 81-120**: Tab rendering logic
- **Lines 121-163**: Main application JSX with tab navigation

## Build and Deployment Commands

```bash
# Development
npm start                    # Start backend
cd client && npm start      # Start frontend

# Production build
npm run build               # Build frontend
NODE_ENV=production npm start  # Start in production mode

# Linting
cd client && npx eslint src/ --ext .ts,.tsx

# Testing
cd client && npm test --passWithNoTests   # No tests currently exist
```

## Technology Stack
- **Backend**: Node.js 16+, Express.js, Socket.IO for real-time communication
- **Frontend**: React 18, TypeScript, Socket.IO client, Axios for API calls  
- **Communication**: WebSocket (Socket.IO) for real-time updates
- **Hardware Support**: Serial Port, CAN Bus, RS485 protocols (simulated in demo mode)

## Troubleshooting

### Frontend Install Issues
- **Problem**: Long install time or warnings
- **Solution**: This is normal - 6+ minutes with many deprecation warnings is expected

### Cannot Connect to Backend  
- **Problem**: "Disconnected" status in browser
- **Solution**: Ensure backend server is running on port 5000 (`npm start`)

### Real-time Updates Not Working
- **Problem**: Changes not appearing across tabs
- **Solution**: Check Socket.IO connection, verify both servers are running

### Build Failures
- **Problem**: Build errors in production
- **Solution**: Ensure `cd client && npm run build` runs successfully first

## Important Notes
- **No existing tests** - rely on manual validation workflows above
- **Development requires two terminals** - one for backend, one for frontend
- **Configuration is persistent** - stored in `config/robot-config.json`
- **Positions are persistent** - stored in `data/saved-positions.json`  
- **Hardware communication is simulated** - actual hardware integration would replace TODO comments in server.js