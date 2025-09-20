import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { PerformanceMonitor, MemoryMonitor } from '../utils/performance';
import { PerformanceDashboard } from '../utils/performanceComponents';

interface SystemMetrics {
  system: {
    uptime: number;
    cpu: { usage: number; cores: number };
    memory: { total: number; used: number; available: number; usage_percent: number };
    disk: { total: number; used: number; available: number; usage_percent: number };
    load: { '1': number; '5': number; '15': number };
  };
  robot: {
    connection_status: string;
    last_command: string | null;
    current_position: { x: number; y: number; z: number; a: number; b: number; c: number };
    target_position: { x: number; y: number; z: number; a: number; b: number; c: number };
    execution_state: string;
    temperature: {
      motors: Array<{ id: string; temp: number }>;
      controllers: Array<{ id: string; temp: number }>;
    };
    errors: Array<{ timestamp: string; message: string; code: string; severity: string }>;
    warnings: Array<{ timestamp: string; message: string }>;
  };
  execution: {
    total_executions: number;
    successful_executions: number;
    failed_executions: number;
    average_execution_time: number;
    current_execution: any;
    recent_executions: Array<any>;
  };
  realtime: {
    connected_clients: number;
    active_sessions: number;
    message_rate: number;
    last_updated: string;
  };
  history: {
    cpu: Array<{ timestamp: string; usage: number; cores: number }>;
    memory: Array<{ timestamp: string; usage_percent: number; used: number; total: number }>;
    disk: Array<{ timestamp: string; usage_percent: number; used: number; total: number }>;
  };
}

interface HealthStatus {
  status: string;
  issues: string[];
  warnings: string[];
  score: number;
}

interface Alert {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
}

const MonitoringDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedTab, setSelectedTab] = useState('overview');
  
  // Performance monitoring state
  const [performanceMetrics, setPerformanceMetrics] = useState<any>({});
  const [memoryStats, setMemoryStats] = useState<any>(null);
  const [cacheInfo, setCacheInfo] = useState<any>(null);

  useEffect(() => {
    // Initialize Socket.IO connection
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to monitoring service');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from monitoring service');
    });

    newSocket.on('metrics-update', (data: SystemMetrics) => {
      setMetrics(data);
    });

    newSocket.on('health-update', (data: HealthStatus) => {
      setHealth(data);
    });

    newSocket.on('alerts-update', (data: Alert[]) => {
      setAlerts(data);
    });

    // Request initial data
    newSocket.emit('request-metrics');

    return () => {
      newSocket.close();
    };
  }, []);

  // Performance monitoring useEffect
  useEffect(() => {
    const updatePerformanceMetrics = async () => {
      // Get performance metrics
      const monitor = PerformanceMonitor.getInstance();
      const perfMetrics = monitor.getMetrics();
      setPerformanceMetrics(perfMetrics);

      // Get memory metrics
      const memoryMonitor = MemoryMonitor.getInstance();
      const memStats = memoryMonitor.getCurrentMemoryUsage();
      setMemoryStats(memStats);

      // Get cache information from service worker
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          const channel = new MessageChannel();
          navigator.serviceWorker.controller.postMessage({ type: 'CACHE_STATS' }, [channel.port2]);
          
          channel.port1.onmessage = (event) => {
            setCacheInfo(event.data);
          };
        }
      } catch (error) {
        console.warn('Could not get cache stats:', error);
      }
    };

    updatePerformanceMetrics();
    const performanceInterval = setInterval(updatePerformanceMetrics, 10000);

    return () => {
      clearInterval(performanceInterval);
    };
  }, []);

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 MB';
    const mb = bytes;
    if (mb < 1024) return `${mb} MB`;
    const gb = (mb / 1024).toFixed(1);
    return `${gb} GB`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return '#22c55e';
      case 'good': return '#84cc16';
      case 'warning': return '#eab308';
      case 'critical': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getConnectionColor = (status: string) => {
    switch (status) {
      case 'connected': return '#22c55e';
      case 'connecting': return '#eab308';
      case 'disconnected': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const renderProgressBar = (percentage: number, color: string = '#3b82f6') => (
    <div className="progress-bar-container">
      <div className="progress-bar" style={{ backgroundColor: '#e5e7eb' }}>
        <div
          className="progress-bar-fill"
          style={{
            width: `${Math.min(100, Math.max(0, percentage))}%`,
            backgroundColor: percentage > 80 ? '#ef4444' : percentage > 60 ? '#eab308' : color
          }}
        />
      </div>
      <span className="progress-text">{percentage}%</span>
    </div>
  );

  const renderSystemOverview = () => (
    <div className="dashboard-section">
      <h3>System Overview</h3>
      
      {/* Health Status */}
      <div className="health-status">
        <div className="health-indicator">
          <div
            className="health-circle"
            style={{ backgroundColor: health ? getStatusColor(health.status) : '#6b7280' }}
          />
          <div>
            <h4>System Health</h4>
            <p>{health ? health.status.toUpperCase() : 'Loading...'}</p>
            {health && <span>Score: {health.score}/100</span>}
          </div>
        </div>
      </div>

      {/* System Metrics */}
      {metrics && (
        <div className="metrics-grid">
          <div className="metric-card">
            <h4>Uptime</h4>
            <p className="metric-value">{formatUptime(metrics.system.uptime)}</p>
          </div>

          <div className="metric-card">
            <h4>CPU Usage</h4>
            {renderProgressBar(metrics.system.cpu.usage)}
            <p className="metric-detail">{metrics.system.cpu.cores} cores</p>
          </div>

          <div className="metric-card">
            <h4>Memory Usage</h4>
            {renderProgressBar(metrics.system.memory.usage_percent)}
            <p className="metric-detail">
              {formatBytes(metrics.system.memory.used)} / {formatBytes(metrics.system.memory.total)}
            </p>
          </div>

          <div className="metric-card">
            <h4>Disk Usage</h4>
            {renderProgressBar(metrics.system.disk.usage_percent)}
            <p className="metric-detail">
              {formatBytes(metrics.system.disk.used)} / {formatBytes(metrics.system.disk.total)}
            </p>
          </div>
        </div>
      )}

      {/* Load Averages */}
      {metrics && metrics.system.load && (
        <div className="load-averages">
          <h4>Load Averages</h4>
          <div className="load-metrics">
            <span>1m: {metrics.system.load['1']}</span>
            <span>5m: {metrics.system.load['5']}</span>
            <span>15m: {metrics.system.load['15']}</span>
          </div>
        </div>
      )}
    </div>
  );

  const renderRobotStatus = () => (
    <div className="dashboard-section">
      <h3>Robot Status</h3>
      
      {metrics && (
        <>
          {/* Connection Status */}
          <div className="connection-status">
            <div className="status-indicator">
              <div
                className="status-circle"
                style={{ backgroundColor: getConnectionColor(metrics.robot.connection_status) }}
              />
              <span>{metrics.robot.connection_status.toUpperCase()}</span>
            </div>
            <div className="execution-state">
              <span>State: {metrics.robot.execution_state.toUpperCase()}</span>
            </div>
          </div>

          {/* Position Display */}
          <div className="position-display">
            <h4>Current Position</h4>
            <div className="position-grid">
              <div className="position-axis">
                <label>X</label>
                <span>{metrics.robot.current_position.x.toFixed(2)}</span>
              </div>
              <div className="position-axis">
                <label>Y</label>
                <span>{metrics.robot.current_position.y.toFixed(2)}</span>
              </div>
              <div className="position-axis">
                <label>Z</label>
                <span>{metrics.robot.current_position.z.toFixed(2)}</span>
              </div>
              <div className="position-axis">
                <label>A</label>
                <span>{metrics.robot.current_position.a.toFixed(2)}</span>
              </div>
              <div className="position-axis">
                <label>B</label>
                <span>{metrics.robot.current_position.b.toFixed(2)}</span>
              </div>
              <div className="position-axis">
                <label>C</label>
                <span>{metrics.robot.current_position.c.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Temperature Monitoring */}
          <div className="temperature-monitoring">
            <h4>Temperature Status</h4>
            
            {metrics.robot.temperature.motors.length > 0 && (
              <div className="temperature-group">
                <h5>Motors</h5>
                <div className="temperature-list">
                  {metrics.robot.temperature.motors.map((motor, index) => (
                    <div key={index} className="temperature-item">
                      <span>{motor.id}</span>
                      <span className={motor.temp > 70 ? 'temp-warning' : motor.temp > 80 ? 'temp-critical' : 'temp-normal'}>
                        {motor.temp.toFixed(1)}°C
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {metrics.robot.temperature.controllers.length > 0 && (
              <div className="temperature-group">
                <h5>Controllers</h5>
                <div className="temperature-list">
                  {metrics.robot.temperature.controllers.map((controller, index) => (
                    <div key={index} className="temperature-item">
                      <span>{controller.id}</span>
                      <span className={controller.temp > 70 ? 'temp-warning' : controller.temp > 80 ? 'temp-critical' : 'temp-normal'}>
                        {controller.temp.toFixed(1)}°C
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Robot Errors and Warnings */}
          {(metrics.robot.errors.length > 0 || metrics.robot.warnings.length > 0) && (
            <div className="robot-alerts">
              {metrics.robot.errors.length > 0 && (
                <div className="error-list">
                  <h5>Errors ({metrics.robot.errors.length})</h5>
                  {metrics.robot.errors.slice(0, 5).map((error, index) => (
                    <div key={index} className="alert-item error">
                      <span className="alert-time">
                        {new Date(error.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="alert-message">{error.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {metrics.robot.warnings.length > 0 && (
                <div className="warning-list">
                  <h5>Warnings ({metrics.robot.warnings.length})</h5>
                  {metrics.robot.warnings.slice(0, 5).map((warning, index) => (
                    <div key={index} className="alert-item warning">
                      <span className="alert-time">
                        {new Date(warning.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="alert-message">{warning.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderExecutionStats = () => (
    <div className="dashboard-section">
      <h3>Execution Statistics</h3>
      
      {metrics && (
        <>
          {/* Execution Summary */}
          <div className="execution-summary">
            <div className="stat-card">
              <h4>Total Executions</h4>
              <p className="stat-number">{metrics.execution.total_executions}</p>
            </div>
            <div className="stat-card">
              <h4>Success Rate</h4>
              <p className="stat-number">
                {metrics.execution.total_executions > 0
                  ? Math.round((metrics.execution.successful_executions / metrics.execution.total_executions) * 100)
                  : 0}%
              </p>
            </div>
            <div className="stat-card">
              <h4>Average Duration</h4>
              <p className="stat-number">{Math.round(metrics.execution.average_execution_time / 1000)}s</p>
            </div>
            <div className="stat-card">
              <h4>Failed Executions</h4>
              <p className="stat-number">{metrics.execution.failed_executions}</p>
            </div>
          </div>

          {/* Current Execution */}
          {metrics.execution.current_execution && (
            <div className="current-execution">
              <h4>Current Execution</h4>
              <div className="execution-details">
                <div className="execution-info">
                  <span>Type: {metrics.execution.current_execution.type}</span>
                  <span>Status: {metrics.execution.current_execution.status}</span>
                  <span>Started: {new Date(metrics.execution.current_execution.started_at).toLocaleString()}</span>
                </div>
                <div className="execution-progress">
                  {renderProgressBar(metrics.execution.current_execution.progress || 0)}
                  <span>
                    {metrics.execution.current_execution.lines_executed || 0} / {metrics.execution.current_execution.total_lines || 0} lines
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Recent Executions */}
          {metrics.execution.recent_executions.length > 0 && (
            <div className="recent-executions">
              <h4>Recent Executions</h4>
              <div className="execution-list">
                {metrics.execution.recent_executions.slice(0, 5).map((execution) => (
                  <div key={execution.id} className={`execution-item ${execution.status}`}>
                    <div className="execution-header">
                      <span className="execution-type">{execution.type}</span>
                      <span className={`execution-status ${execution.status}`}>
                        {execution.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="execution-meta">
                      <span>{new Date(execution.started_at).toLocaleString()}</span>
                      {execution.duration && <span>Duration: {Math.round(execution.duration / 1000)}s</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderAlerts = () => (
    <div className="dashboard-section">
      <h3>Active Alerts</h3>
      
      {alerts.length === 0 ? (
        <div className="no-alerts">
          <p>No active alerts</p>
        </div>
      ) : (
        <div className="alerts-list">
          {alerts.map((alert) => (
            <div key={alert.id} className={`alert-card ${alert.type}`}>
              <div className="alert-header">
                <span className={`alert-icon ${alert.type}`}>
                  {alert.type === 'error' ? '⚠️' : alert.type === 'warning' ? '⚡' : 'ℹ️'}
                </span>
                <h5>{alert.title}</h5>
                <span className="alert-time">
                  {new Date(alert.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="alert-message">{alert.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* System Health Issues */}
      {health && (health.issues.length > 0 || health.warnings.length > 0) && (
        <div className="health-alerts">
          <h4>System Health Issues</h4>
          
          {health.issues.map((issue, index) => (
            <div key={`issue-${index}`} className="alert-card error">
              <div className="alert-header">
                <span className="alert-icon error">⚠️</span>
                <h5>System Issue</h5>
              </div>
              <p className="alert-message">{issue}</p>
            </div>
          ))}

          {health.warnings.map((warning, index) => (
            <div key={`warning-${index}`} className="alert-card warning">
              <div className="alert-header">
                <span className="alert-icon warning">⚡</span>
                <h5>System Warning</h5>
              </div>
              <p className="alert-message">{warning}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPerformanceMonitoring = () => (
    <div className="dashboard-section">
      <h3>Client Performance Monitoring</h3>
      
      {/* Core Web Vitals */}
      <div className="performance-section">
        <h4>Core Web Vitals</h4>
        <div className="metrics-grid">
          {performanceMetrics.lcp && (
            <div className="metric-card">
              <div className="metric-header">
                <h5>Largest Contentful Paint</h5>
                <span className={`metric-status ${performanceMetrics.lcp <= 1000 ? 'good' : performanceMetrics.lcp <= 2500 ? 'ok' : 'poor'}`}>
                  {performanceMetrics.lcp <= 1000 ? 'Good' : performanceMetrics.lcp <= 2500 ? 'Needs Improvement' : 'Poor'}
                </span>
              </div>
              <div className="metric-value">{Math.round(performanceMetrics.lcp)} ms</div>
            </div>
          )}
          
          {performanceMetrics.cls && (
            <div className="metric-card">
              <div className="metric-header">
                <h5>Cumulative Layout Shift</h5>
                <span className={`metric-status ${performanceMetrics.cls <= 0.05 ? 'good' : performanceMetrics.cls <= 0.1 ? 'ok' : 'poor'}`}>
                  {performanceMetrics.cls <= 0.05 ? 'Good' : performanceMetrics.cls <= 0.1 ? 'Needs Improvement' : 'Poor'}
                </span>
              </div>
              <div className="metric-value">{performanceMetrics.cls.toFixed(3)}</div>
            </div>
          )}
          
          {performanceMetrics.fcp && (
            <div className="metric-card">
              <div className="metric-header">
                <h5>First Contentful Paint</h5>
                <span className={`metric-status ${performanceMetrics.fcp <= 1000 ? 'good' : performanceMetrics.fcp <= 1800 ? 'ok' : 'poor'}`}>
                  {performanceMetrics.fcp <= 1000 ? 'Good' : performanceMetrics.fcp <= 1800 ? 'Needs Improvement' : 'Poor'}
                </span>
              </div>
              <div className="metric-value">{Math.round(performanceMetrics.fcp)} ms</div>
            </div>
          )}
        </div>
      </div>

      {/* Memory Usage */}
      {memoryStats && (
        <div className="performance-section">
          <h4>Memory Usage</h4>
          <div className="memory-stats">
            <div className="memory-info">
              <span>Used: {memoryStats.used} MB</span>
              <span>Total: {memoryStats.total} MB</span>
              <span>Usage: {memoryStats.percentage}%</span>
            </div>
            <div className="memory-progress">
              <div 
                className="memory-fill"
                style={{ 
                  width: `${memoryStats.percentage}%`,
                  backgroundColor: memoryStats.percentage > 85 ? '#dc3545' : memoryStats.percentage > 70 ? '#ffc107' : '#28a745'
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Cache Information */}
      {cacheInfo && (
        <div className="performance-section">
          <h4>Cache Statistics</h4>
          <div className="cache-overview">
            <div className="cache-summary">
              <span>Total Items: {cacheInfo.totalItems}</span>
              <span>Total Size: {cacheInfo.totalSizeFormatted}</span>
            </div>
          </div>
          <div className="cache-details">
            {Object.entries(cacheInfo.caches).map(([name, stats]: [string, any]) => (
              <div key={name} className="cache-item">
                <span className="cache-name">{name.replace('arctos-', '').replace('-v1.0.0', '')}</span>
                <div className="cache-stats">
                  <span>{stats.items} items</span>
                  <span>{stats.sizeFormatted}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance Dashboard Component */}
      <div className="performance-section">
        <h4>Detailed Performance Metrics</h4>
        <PerformanceDashboard />
      </div>

      {/* Clear Cache Button */}
      <div className="performance-actions">
        <button 
          className="btn btn-secondary"
          onClick={() => {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
              navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
              setTimeout(() => window.location.reload(), 1000);
            }
          }}
        >
          Clear All Caches
        </button>
      </div>
    </div>
  );

  return (
    <div className="monitoring-dashboard">
      <div className="dashboard-header">
        <h2>System Monitoring Dashboard</h2>
        <div className="connection-indicator">
          <div className={`indicator-dot ${isConnected ? 'connected' : 'disconnected'}`} />
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
          {metrics && (
            <span className="last-updated">
              Last updated: {new Date(metrics.realtime.last_updated).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      <div className="dashboard-tabs">
        <button
          className={selectedTab === 'overview' ? 'tab-button active' : 'tab-button'}
          onClick={() => setSelectedTab('overview')}
        >
          System Overview
        </button>
        <button
          className={selectedTab === 'robot' ? 'tab-button active' : 'tab-button'}
          onClick={() => setSelectedTab('robot')}
        >
          Robot Status
        </button>
        <button
          className={selectedTab === 'execution' ? 'tab-button active' : 'tab-button'}
          onClick={() => setSelectedTab('execution')}
        >
          Execution Stats
        </button>
        <button
          className={selectedTab === 'alerts' ? 'tab-button active' : 'tab-button'}
          onClick={() => setSelectedTab('alerts')}
        >
          Alerts {alerts.length > 0 && <span className="alert-count">({alerts.length})</span>}
        </button>
        <button
          className={selectedTab === 'performance' ? 'tab-button active' : 'tab-button'}
          onClick={() => setSelectedTab('performance')}
        >
          Performance
        </button>
      </div>

      <div className="dashboard-content">
        {selectedTab === 'overview' && renderSystemOverview()}
        {selectedTab === 'robot' && renderRobotStatus()}
        {selectedTab === 'execution' && renderExecutionStats()}
        {selectedTab === 'alerts' && renderAlerts()}
        {selectedTab === 'performance' && renderPerformanceMonitoring()}
      </div>
    </div>
  );
};

export default MonitoringDashboard;