import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import io, { Socket } from 'socket.io-client';
import axios from 'axios';

import ManualControl from './components/ManualControl';
import GCodeControl from './components/GCodeControl';
import PositionReplay from './components/PositionReplay';
import Configuration from './components/Configuration';

interface RobotConfig {
  robotType: string;
  communicationProtocol: string;
  serialConfig: {
    port: string;
    baudRate: number;
  };
  canConfig: {
    interface: string;
  };
  rs485Config: {
    port: string;
    baudRate: number;
  };
  axes: {
    count: number;
    limits: { [key: string]: { min: number; max: number } };
  };
  manipulators: {
    count: number;
    [key: string]: any;
  };
}

interface SavedPosition {
  id: number;
  name: string;
  axes: { [key: string]: number };
  manipulators: { [key: string]: number };
  delay: number;
  timestamp: string;
}

type TabType = 'manual' | 'gcode' | 'replay' | 'config';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('manual');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [config, setConfig] = useState<RobotConfig | null>(null);
  const [positions, setPositions] = useState<SavedPosition[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');

  useEffect(() => {
    // Initialize socket connection
    const socketConnection = io('http://localhost:5000');
    setSocket(socketConnection);

    socketConnection.on('connect', () => {
      console.log('Connected to server');
      setConnectionStatus('connected');
    });

    socketConnection.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnectionStatus('disconnected');
    });

    socketConnection.on('configUpdated', (newConfig: RobotConfig) => {
      setConfig(newConfig);
    });

    socketConnection.on('positionsUpdated', (newPositions: SavedPosition[]) => {
      setPositions(newPositions);
    });

    // Load initial configuration and positions
    loadConfig();
    loadPositions();

    return () => {
      socketConnection.disconnect();
    };
  }, []);

  const loadConfig = async () => {
    try {
      const response = await axios.get('/api/config');
      setConfig(response.data);
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const loadPositions = async () => {
    try {
      const response = await axios.get('/api/positions');
      setPositions(response.data);
    } catch (error) {
      console.error('Error loading positions:', error);
    }
  };

  const renderTabContent = () => {
    if (!config) {
      return (
        <div className="alert alert-info">
          Loading configuration...
        </div>
      );
    }

    switch (activeTab) {
      case 'manual':
        return <ManualControl config={config} socket={socket} />;
      case 'gcode':
        return <GCodeControl socket={socket} />;
      case 'replay':
        return <PositionReplay positions={positions} socket={socket} config={config} />;
      case 'config':
        return <Configuration config={config} onConfigUpdate={setConfig} />;
      default:
        return null;
    }
  };

  return (
    <Router>
      <div className="container">
        <header style={{ marginBottom: '30px', textAlign: 'center' }}>
          <h1 style={{ color: '#333', marginBottom: '10px' }}>
            Arctos Robot Controller
          </h1>
          <div className={`status-indicator ${connectionStatus === 'connected' ? 'status-connected' : 'status-disconnected'}`}>
            {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
          </div>
        </header>

        <nav className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === 'manual' ? 'active' : ''}`}
            onClick={() => setActiveTab('manual')}
          >
            Manual Control
          </button>
          <button
            className={`nav-tab ${activeTab === 'gcode' ? 'active' : ''}`}
            onClick={() => setActiveTab('gcode')}
          >
            G-Code Control
          </button>
          <button
            className={`nav-tab ${activeTab === 'replay' ? 'active' : ''}`}
            onClick={() => setActiveTab('replay')}
          >
            Position Replay
          </button>
          <button
            className={`nav-tab ${activeTab === 'config' ? 'active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            Configuration
          </button>
        </nav>

        <main className="tab-content">
          {renderTabContent()}
        </main>
      </div>
    </Router>
  );
};

export default App;