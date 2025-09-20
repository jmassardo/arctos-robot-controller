import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter as Router } from "react-router-dom";
import io, { Socket } from "socket.io-client";
import axios from "axios";

// Theme context
import { ThemeProvider } from "./contexts/ThemeContext";

// Authentication components and context
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./components/Login";
import Register from "./components/Register";
import ProtectedRoute from "./components/ProtectedRoute";
import UserProfile from "./components/UserProfile";
import UserManagement from "./components/UserManagement";
import AuditTrail from "./components/AuditTrail";

// Existing components
import {
  LazyManualControl,
  LazyGCodeControl,
  LazyPositionReplay,
  LazyConfiguration,
  LazyAdvancedConfiguration,
  LazyMonitoringDashboard,
  LazyDocumentation,
  LazyUserProfile,
  LazyUserManagement,
  LazyAuditTrail
} from "./config/lazyComponents";
import ThemeToggle from "./components/ThemeToggle";
import { PerformanceMonitor, MemoryMonitor } from "./utils/performance";
import enhancedAxios from "./utils/enhancedAxios";
import { isElectron, initializeElectronListeners, cleanupElectronListeners } from "./utils/electron";

// Mobile components and utilities
import MobileManualControl from "./components/MobileManualControl";
import { MobileLayout, MobileNavigation } from "./components/MobileNavigation";
import { useDeviceInfo, initializeMobileSupport, optimizeForMobile } from "./utils/mobileUtils";

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
  groupId?: number;
}

interface PositionGroup {
  id: number;
  name: string;
  description: string;
  positionIds: number[];
  timestamp: string;
}

type TabType = "manual" | "gcode" | "replay" | "config" | "advanced-config" | "monitoring" | "documentation" | "profile" | "users" | "audit";

const AuthenticatedApp: React.FC = () => {
  const { state, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("manual");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [config, setConfig] = useState<RobotConfig | null>(null);
  const [positions, setPositions] = useState<SavedPosition[]>([]);
  const [groups, setGroups] = useState<PositionGroup[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "disconnected"
  >("disconnected");

  // Mobile device detection
  const deviceInfo = useDeviceInfo();

  // Initialize mobile support and performance monitoring
  useEffect(() => {
    // Initialize mobile support
    if (deviceInfo.isMobile || deviceInfo.isTablet) {
      initializeMobileSupport();
      optimizeForMobile();
    }

    const performanceMonitor = PerformanceMonitor.getInstance();
    const memoryMonitor = MemoryMonitor.getInstance();
    
    // Clean up on unmount
    return () => {
      performanceMonitor.cleanup();
      memoryMonitor.cleanup();
      enhancedAxios.cleanup();
    };
  }, [deviceInfo.isMobile, deviceInfo.isTablet]);

  useEffect(() => {
    if (!state.isAuthenticated) return;

    // Initialize socket connection with authentication
    const socketConnection = io("http://localhost:3001", {
      transports: ["polling", "websocket"],
      timeout: 20000,
      auth: {
        token: state.token
      }
    });
    setSocket(socketConnection);

    socketConnection.on("connect", () => {
      console.log("Connected to server");
      setConnectionStatus("connected");
    });

    socketConnection.on("disconnect", () => {
      console.log("Disconnected from server");
      setConnectionStatus("disconnected");
    });

    socketConnection.on("configUpdated", (newConfig: RobotConfig) => {
      setConfig(newConfig);
    });

    socketConnection.on("positionsUpdated", (newPositions: SavedPosition[]) => {
      setPositions(newPositions);
    });

    socketConnection.on("groupsUpdated", (newGroups: PositionGroup[]) => {
      setGroups(newGroups);
    });

    // Authentication error handling
    socketConnection.on("auth_error", (error) => {
      console.error("Socket authentication error:", error);
      logout();
    });

    // Load initial data
    loadConfig();
    loadPositions();
    loadGroups();

    // Initialize Electron-specific listeners if running in Electron
    if (isElectron()) {
      initializeElectronListeners();
      console.log('Running in Electron environment');
    } else {
      console.log('Running in web browser environment');
    }

    return () => {
      socketConnection.disconnect();
      if (isElectron()) {
        cleanupElectronListeners();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isAuthenticated, state.token]);

  const loadConfig = useCallback(async () => {
    try {
      const response = await axios.get("/api/config");
      setConfig(response.data);
    } catch (error) {
      console.error("Error loading config:", error);
      // Handle authentication errors
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        logout();
      }
    }
  }, [logout]);

  const loadPositions = useCallback(async () => {
    try {
      const response = await axios.get("/api/positions");
      setPositions(response.data);
    } catch (error) {
      console.error("Error loading positions:", error);
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        logout();
      }
    }
  }, [logout]);

  const loadGroups = useCallback(async () => {
    try {
      const response = await axios.get("/api/groups");
      setGroups(response.data);
    } catch (error) {
      console.error("Error loading groups:", error);
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        logout();
      }
    }
  }, [logout]);

  const renderTabContent = () => {
    if (!config && activeTab !== "profile" && activeTab !== "users" && activeTab !== "monitoring") {
      return <div className="alert alert-info">Loading configuration...</div>;
    }

    switch (activeTab) {
      case "manual":
        return (
          <ProtectedRoute requiredRoles={['admin', 'operator']}>
            {deviceInfo.isMobile || deviceInfo.isTablet ? (
              <MobileManualControl config={config!} socket={socket} />
            ) : (
              <LazyManualControl config={config!} socket={socket} />
            )}
          </ProtectedRoute>
        );
      case "gcode":
        return (
          <ProtectedRoute requiredRoles={['admin', 'operator']}>
            <LazyGCodeControl socket={socket} />
          </ProtectedRoute>
        );
      case "replay":
        return (
          <ProtectedRoute requiredRoles={['admin', 'operator']}>
            <LazyPositionReplay
              positions={positions}
              groups={groups}
              socket={socket}
              config={config!}
            />
          </ProtectedRoute>
        );
      case "config":
        return (
          <ProtectedRoute requiredRoles={['admin', 'operator']}>
            <LazyConfiguration config={config!} onConfigUpdate={setConfig} />
          </ProtectedRoute>
        );
      case "advanced-config":
        return (
          <ProtectedRoute requiredRoles={['admin']}>
            <LazyAdvancedConfiguration config={config!} onConfigUpdate={setConfig} />
          </ProtectedRoute>
        );
      case "monitoring":
        return (
          <ProtectedRoute requiredRoles={['admin', 'operator', 'viewer']}>
            <LazyMonitoringDashboard />
          </ProtectedRoute>
        );
      case "documentation":
        return (
          <ProtectedRoute requiredRoles={['admin', 'operator', 'viewer']}>
            <LazyDocumentation />
          </ProtectedRoute>
        );
      case "profile":
        return <LazyUserProfile />;
      case "users":
        return <LazyUserManagement />;
      case "audit":
        return <LazyAuditTrail />;
      default:
        return null;
    }
  };

  const getTabsForUser = () => {
    const baseTabs = [
      { id: "manual" as TabType, label: "Manual Control", roles: ['admin', 'operator'] },
      { id: "gcode" as TabType, label: "G-Code Control", roles: ['admin', 'operator'] },
      { id: "replay" as TabType, label: "Position Replay", roles: ['admin', 'operator'] },
      { id: "config" as TabType, label: "Configuration", roles: ['admin', 'operator'] },
      { id: "advanced-config" as TabType, label: "Advanced Config", roles: ['admin'] },
      { id: "monitoring" as TabType, label: "Monitoring", roles: ['admin', 'operator', 'viewer'] },
      { id: "documentation" as TabType, label: "Documentation", roles: ['admin', 'operator', 'viewer'] },
      { id: "profile" as TabType, label: "Profile", roles: ['admin', 'operator', 'viewer'] },
    ];
    
    // Add admin-only tabs
    if (state.user?.role === 'admin') {
      baseTabs.push({ id: "users" as TabType, label: "User Management", roles: ['admin'] });
      baseTabs.push({ id: "audit" as TabType, label: "Audit Trail", roles: ['admin'] });
    }
    
    return baseTabs.filter(tab => 
      !state.user || tab.roles.includes(state.user.role)
    );
  };

  if (!state.isAuthenticated) {
    return <div>Redirecting to login...</div>;
  }

  const getTabIcon = (tabId: TabType): string => {
    switch (tabId) {
      case "manual": return "🎮";
      case "gcode": return "📝";
      case "replay": return "▶️";
      case "config": return "⚙️";
      case "advanced-config": return "🔧";
      case "monitoring": return "📊";
      case "documentation": return "📚";
      case "profile": return "👤";
      case "users": return "👥";
      case "audit": return "📋";
      default: return "📄";
    }
  };

  const availableTabs = getTabsForUser();

  return (
    <Router>
      {deviceInfo.isMobile || deviceInfo.isTablet ? (
        <MobileLayout
          navigation={
            <MobileNavigation
              tabs={availableTabs.map(tab => ({
                key: tab.id,
                label: tab.label,
                icon: getTabIcon(tab.id),
                disabled: false
              }))}
              activeTab={activeTab}
              onTabChange={(tabKey: string) => setActiveTab(tabKey as TabType)}
              connectionStatus={connectionStatus}
            />
          }
          content={<main className="mobile-content">{renderTabContent()}</main>}
        />
      ) : (
        <div className="container">
          <header style={{ marginBottom: "30px" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <h1 style={{ color: "#333", marginBottom: "10px" }}>
                  Arctos Robot Controller
                </h1>
                <div
                  className={`status-indicator ${
                    connectionStatus === "connected"
                      ? "status-connected"
                      : "status-disconnected"
                  }`}
                >
                  {connectionStatus === "connected" ? "Connected" : "Disconnected"}
                </div>
              </div>
              
              <div className="user-header">
                <div className="theme-toggle-header">
                  <ThemeToggle variant="icon" size="medium" />
                </div>
                <div className="user-info-header">
                  <div className="user-avatar-small">
                    {state.user?.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="user-details-header">
                    <span className="username">{state.user?.username}</span>
                    <span 
                      className="user-role-small"
                      style={{
                        backgroundColor: 
                          state.user?.role === 'admin' ? '#e74c3c' :
                          state.user?.role === 'operator' ? '#f39c12' : '#3498db'
                      }}
                    >
                      {state.user?.role.toUpperCase()}
                    </span>
                  </div>
                </div>
                <button onClick={logout} className="btn-sm btn-secondary">
                  Sign Out
                </button>
              </div>
            </div>
          </header>

          <nav className="nav-tabs">
            {availableTabs.map((tab) => (
              <button
                key={tab.id}
                className={`nav-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <main className="tab-content">{renderTabContent()}</main>
        </div>
      )}
    </Router>
  );
};

const UnauthenticatedApp: React.FC = () => {
  const [showRegister, setShowRegister] = useState(false);
  const { login } = useAuth();

  const handleLogin = (user: any, token: string) => {
    login(user, token);
  };

  const handleRegister = (user: any, token: string) => {
    login(user, token);
  };

  return (
    <div className="unauthenticated-app">
      {showRegister ? (
        <Register 
          onRegister={handleRegister}
          onShowLogin={() => setShowRegister(false)}
        />
      ) : (
        <Login 
          onLogin={handleLogin}
          onShowRegister={() => setShowRegister(true)}
        />
      )}
    </div>
  );
};

const AppContent: React.FC = () => {
  const { state } = useAuth();

  if (state.isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading application...</p>
      </div>
    );
  }

  return state.isAuthenticated ? <AuthenticatedApp /> : <UnauthenticatedApp />;
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
