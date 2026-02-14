import React, { useState, useEffect, useRef } from 'react';

interface TemperatureReading {
  motorId: string;
  driverTemp: number | null;
  motorTemp: number | null;
  ambientTemp: number | null;
  lastUpdate: Date;
  alertLevel: 'normal' | 'warning' | 'critical' | 'emergency';
}

interface TemperatureAlert {
  id: string;
  motorId: string;
  alertLevel: 'normal' | 'warning' | 'critical' | 'emergency';
  temperature: number;
  timestamp: Date;
}

interface TemperatureMonitorProps {
  socket: any;
}

const TemperatureMonitor: React.FC<TemperatureMonitorProps> = ({ socket }) => {
  const [temperatures, setTemperatures] = useState<Record<string, TemperatureReading>>({});
  const [alerts, setAlerts] = useState<TemperatureAlert[]>([]);
  const [isMonitoring, setIsMonitoring] = useState<boolean>(false);
  const [monitoringInterval, setMonitoringInterval] = useState<number>(1000);
  const [selectedMotors, setSelectedMotors] = useState<string[]>(['1', '2', '3', '4', '5', '6']);
  
  // Chart data for temperature trends
  const [chartData, setChartData] = useState<Record<string, any[]>>({});
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (!socket) return;

    // Listen for temperature updates
    socket.on('temperature:update', handleTemperatureUpdate);
    socket.on('temperature:alert', handleTemperatureAlert);
    socket.on('monitoring:started', handleMonitoringStarted);
    socket.on('monitoring:stopped', handleMonitoringStopped);

    // Load initial data
    loadCurrentTemperatures();

    return () => {
      socket.off('temperature:update');
      socket.off('temperature:alert');
      socket.off('monitoring:started');
      socket.off('monitoring:stopped');
    };
  }, [socket]);

  const handleTemperatureUpdate = (data: any) => {
    const { motorId, driverTemp, motorTemp, ambientTemp, lastUpdate, alertLevel } = data;
    
    setTemperatures(prev => ({
      ...prev,
      [motorId]: {
        motorId,
        driverTemp,
        motorTemp,
        ambientTemp,
        lastUpdate: new Date(lastUpdate),
        alertLevel
      }
    }));

    // Update chart data
    const primaryTemp = motorTemp || driverTemp;
    if (primaryTemp !== null) {
      setChartData(prev => {
        const motorData = prev[motorId] || [];
        const newData = [...motorData, {
          timestamp: new Date(lastUpdate),
          temperature: primaryTemp,
          alertLevel
        }].slice(-50); // Keep last 50 readings

        return {
          ...prev,
          [motorId]: newData
        };
      });
    }
  };

  const handleTemperatureAlert = (data: TemperatureAlert) => {
    setAlerts(prev => {
      // Remove existing alert for this motor and add new one
      const filtered = prev.filter(alert => alert.motorId !== data.motorId);
      return [data, ...filtered].slice(0, 10); // Keep last 10 alerts
    });
  };

  const handleMonitoringStarted = () => {
    setIsMonitoring(true);
  };

  const handleMonitoringStopped = () => {
    setIsMonitoring(false);
  };

  const loadCurrentTemperatures = async () => {
    try {
      const response = await fetch('/api/temperature/current');
      if (response.ok) {
        const data = await response.json();
        setTemperatures(data);
      }
    } catch (error) {
      console.error('Failed to load current temperatures:', error);
    }
  };

  const startMonitoring = async () => {
    try {
      await fetch('/api/temperature/monitoring/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          motorIds: selectedMotors,
          interval: monitoringInterval
        })
      });
    } catch (error) {
      console.error('Failed to start monitoring:', error);
    }
  };

  const stopMonitoring = async () => {
    try {
      await fetch('/api/temperature/monitoring/stop', {
        method: 'POST'
      });
    } catch (error) {
      console.error('Failed to stop monitoring:', error);
    }
  };

  const clearAlert = async (motorId: string) => {
    try {
      await fetch(`/api/temperature/alerts/${motorId}/clear`, {
        method: 'POST'
      });
      setAlerts(prev => prev.filter(alert => alert.motorId !== motorId));
    } catch (error) {
      console.error('Failed to clear alert:', error);
    }
  };

  const getTemperatureColor = (temp: number | null, alertLevel: string) => {
    if (temp === null) return 'text-gray-400';
    
    switch (alertLevel) {
      case 'emergency':
        return 'text-red-600 font-bold animate-pulse';
      case 'critical':
        return 'text-red-500 font-semibold';
      case 'warning':
        return 'text-yellow-500 font-medium';
      default:
        return 'text-green-600';
    }
  };

  const getAlertIcon = (alertLevel: string) => {
    switch (alertLevel) {
      case 'emergency':
        return '🚨';
      case 'critical':
        return '⚠️';
      case 'warning':
        return '⚡';
      default:
        return '✅';
    }
  };

  return (
    <div className="temperature-monitor p-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">Motor Temperature Monitoring</h2>
        
        {/* Control Panel */}
        <div className="bg-white p-4 rounded-lg shadow-md mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Update Interval (ms)</label>
              <input
                type="number"
                value={monitoringInterval}
                onChange={(e) => setMonitoringInterval(Number(e.target.value))}
                className="border rounded px-2 py-1 w-24"
                min="500"
                max="10000"
                step="500"
                disabled={isMonitoring}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Monitor Motors</label>
              <select
                multiple
                value={selectedMotors}
                onChange={(e) => setSelectedMotors(Array.from(e.target.selectedOptions, option => option.value))}
                className="border rounded px-2 py-1 w-32"
                disabled={isMonitoring}
              >
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <option key={i} value={i.toString()}>Motor {i}</option>
                ))}
              </select>
            </div>
            
            <div className="flex items-end gap-2">
              <button
                onClick={isMonitoring ? stopMonitoring : startMonitoring}
                className={`px-4 py-2 rounded text-white font-medium ${
                  isMonitoring 
                    ? 'bg-red-500 hover:bg-red-600' 
                    : 'bg-green-500 hover:bg-green-600'
                }`}
              >
                {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
              </button>
              
              <span className={`px-3 py-2 rounded text-sm font-medium ${
                isMonitoring 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {isMonitoring ? '🔴 Monitoring' : '⚪ Stopped'}
              </span>
            </div>
          </div>
        </div>

        {/* Temperature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {selectedMotors.map(motorId => {
            const reading = temperatures[motorId];
            const primaryTemp = reading?.motorTemp || reading?.driverTemp;
            
            return (
              <div key={motorId} className="bg-white p-4 rounded-lg shadow-md">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-semibold">Motor {motorId}</h3>
                  <div className="flex items-center">
                    <span className="mr-2">{getAlertIcon(reading?.alertLevel || 'normal')}</span>
                    <span className={`text-xs px-2 py-1 rounded uppercase ${
                      reading?.alertLevel === 'emergency' ? 'bg-red-100 text-red-800' :
                      reading?.alertLevel === 'critical' ? 'bg-red-50 text-red-700' :
                      reading?.alertLevel === 'warning' ? 'bg-yellow-50 text-yellow-700' :
                      'bg-green-50 text-green-700'
                    }`}>
                      {reading?.alertLevel || 'normal'}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Motor:</span>
                    <span className={`text-sm ${getTemperatureColor(reading?.motorTemp || null, reading?.alertLevel || 'normal')}`}>
                      {reading?.motorTemp?.toFixed(1) || '---'}°C
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Driver:</span>
                    <span className={`text-sm ${getTemperatureColor(reading?.driverTemp || null, reading?.alertLevel || 'normal')}`}>
                      {reading?.driverTemp?.toFixed(1) || '---'}°C
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Ambient:</span>
                    <span className="text-sm text-gray-600">
                      {reading?.ambientTemp?.toFixed(1) || '---'}°C
                    </span>
                  </div>
                  
                  <div className="text-xs text-gray-500 mt-2">
                    Last: {reading?.lastUpdate ? reading.lastUpdate.toLocaleTimeString() : 'Never'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Active Alerts */}
        {alerts.length > 0 && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-medium text-red-800">Temperature Alerts</h3>
              <span className="text-sm text-red-600">{alerts.length} active</span>
            </div>
            
            <div className="space-y-2">
              {alerts.map(alert => (
                <div key={alert.id} className="flex justify-between items-center bg-white p-2 rounded">
                  <div>
                    <span className="font-medium">Motor {alert.motorId}</span>
                    <span className={`ml-2 px-2 py-1 text-xs rounded uppercase ${
                      alert.alertLevel === 'emergency' ? 'bg-red-200 text-red-800' :
                      alert.alertLevel === 'critical' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {alert.alertLevel}
                    </span>
                    <span className="ml-2 text-sm text-gray-600">
                      {alert.temperature.toFixed(1)}°C at {alert.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  
                  <button
                    onClick={() => clearAlert(alert.motorId)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Clear
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemperatureMonitor;