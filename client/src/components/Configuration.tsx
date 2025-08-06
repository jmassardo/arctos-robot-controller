import React, { useState } from 'react';
import axios from 'axios';

interface ConfigurationProps {
  config: any;
  onConfigUpdate: (config: any) => void;
}

const Configuration: React.FC<ConfigurationProps> = ({ config, onConfigUpdate }) => {
  const [localConfig, setLocalConfig] = useState(config);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  const handleConfigChange = (section: string, field: string, value: any) => {
    setLocalConfig((prev: any) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const handleAxisLimitChange = (axis: string, limitType: 'min' | 'max', value: number) => {
    setLocalConfig((prev: any) => ({
      ...prev,
      axes: {
        ...prev.axes,
        limits: {
          ...prev.axes.limits,
          [axis]: {
            ...prev.axes.limits[axis],
            [limitType]: value
          }
        }
      }
    }));
  };

  const handleManipulatorLimitChange = (manipulator: string, limitType: 'min' | 'max', value: number) => {
    setLocalConfig((prev: any) => ({
      ...prev,
      manipulators: {
        ...prev.manipulators,
        [manipulator]: {
          ...prev.manipulators[manipulator],
          [limitType]: value
        }
      }
    }));
  };

  const saveConfiguration = async () => {
    setIsSaving(true);
    setSaveStatus('saving');

    try {
      const response = await axios.post('/api/config', localConfig);
      
      if (response.data.success) {
        onConfigUpdate(response.data.config);
        setSaveStatus('success');
        
        setTimeout(() => {
          setSaveStatus('idle');
        }, 3000);
      } else {
        throw new Error(response.data.error);
      }
    } catch (error) {
      console.error('Error saving configuration:', error);
      setSaveStatus('error');
      
      setTimeout(() => {
        setSaveStatus('idle');
      }, 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const resetToDefaults = () => {
    if (window.confirm('Are you sure you want to reset to default configuration? This will overwrite all current settings.')) {
      setLocalConfig(config);
    }
  };

  return (
    <div>
      <h2>Configuration</h2>
      <p>Configure your robotic arm settings, communication protocols, and axis limits.</p>

      {saveStatus === 'success' && (
        <div className="alert alert-success">
          Configuration saved successfully!
        </div>
      )}

      {saveStatus === 'error' && (
        <div className="alert alert-danger">
          Error saving configuration. Please try again.
        </div>
      )}

      <div className="control-grid">
        <div className="control-section">
          <h3>Robot Configuration</h3>
          
          <div className="form-group">
            <label htmlFor="robotType">Robot Type:</label>
            <select
              id="robotType"
              className="form-control"
              value={localConfig.robotType}
              onChange={(e) => handleConfigChange('robotType', 'robotType', e.target.value)}
            >
              <option value="arctos">Arctos</option>
              <option value="generic">Generic</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="communicationProtocol">Communication Protocol:</label>
            <select
              id="communicationProtocol"
              className="form-control"
              value={localConfig.communicationProtocol}
              onChange={(e) => handleConfigChange('communicationProtocol', 'communicationProtocol', e.target.value)}
            >
              <option value="serial">Serial</option>
              <option value="can">CAN Bus</option>
              <option value="rs485">RS485</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="axesCount">Number of Axes:</label>
            <input
              type="number"
              id="axesCount"
              className="form-control"
              value={localConfig.axes.count}
              onChange={(e) => handleConfigChange('axes', 'count', parseInt(e.target.value))}
              min="1"
              max="8"
            />
          </div>

          <div className="form-group">
            <label htmlFor="manipulatorsCount">Number of Manipulators:</label>
            <input
              type="number"
              id="manipulatorsCount"
              className="form-control"
              value={localConfig.manipulators.count}
              onChange={(e) => handleConfigChange('manipulators', 'count', parseInt(e.target.value))}
              min="0"
              max="2"
            />
          </div>
        </div>

        <div className="control-section">
          <h3>Communication Settings</h3>
          
          {localConfig.communicationProtocol === 'serial' && (
            <>
              <div className="form-group">
                <label htmlFor="serialPort">Serial Port:</label>
                <input
                  type="text"
                  id="serialPort"
                  className="form-control"
                  value={localConfig.serialConfig.port}
                  onChange={(e) => handleConfigChange('serialConfig', 'port', e.target.value)}
                  placeholder="/dev/ttyUSB0"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="serialBaudRate">Baud Rate:</label>
                <select
                  id="serialBaudRate"
                  className="form-control"
                  value={localConfig.serialConfig.baudRate}
                  onChange={(e) => handleConfigChange('serialConfig', 'baudRate', parseInt(e.target.value))}
                >
                  <option value="9600">9600</option>
                  <option value="19200">19200</option>
                  <option value="38400">38400</option>
                  <option value="57600">57600</option>
                  <option value="115200">115200</option>
                  <option value="250000">250000</option>
                </select>
              </div>
            </>
          )}

          {localConfig.communicationProtocol === 'can' && (
            <div className="form-group">
              <label htmlFor="canInterface">CAN Interface:</label>
              <input
                type="text"
                id="canInterface"
                className="form-control"
                value={localConfig.canConfig.interface}
                onChange={(e) => handleConfigChange('canConfig', 'interface', e.target.value)}
                placeholder="can0"
              />
            </div>
          )}

          {localConfig.communicationProtocol === 'rs485' && (
            <>
              <div className="form-group">
                <label htmlFor="rs485Port">RS485 Port:</label>
                <input
                  type="text"
                  id="rs485Port"
                  className="form-control"
                  value={localConfig.rs485Config.port}
                  onChange={(e) => handleConfigChange('rs485Config', 'port', e.target.value)}
                  placeholder="/dev/ttyUSB1"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="rs485BaudRate">Baud Rate:</label>
                <select
                  id="rs485BaudRate"
                  className="form-control"
                  value={localConfig.rs485Config.baudRate}
                  onChange={(e) => handleConfigChange('rs485Config', 'baudRate', parseInt(e.target.value))}
                >
                  <option value="9600">9600</option>
                  <option value="19200">19200</option>
                  <option value="38400">38400</option>
                  <option value="57600">57600</option>
                  <option value="115200">115200</option>
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="control-section" style={{ marginTop: '30px' }}>
        <h3>Axis Limits</h3>
        <div className="control-grid">
          {Array.from({ length: localConfig.axes.count }, (_, i) => {
            const axisName = `axis${i + 1}`;
            const limits = localConfig.axes.limits[axisName] || { min: -180, max: 180 };
            
            return (
              <div key={axisName} style={{ marginBottom: '20px' }}>
                <h4>Axis {i + 1}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label>Min (°):</label>
                    <input
                      type="number"
                      className="form-control"
                      value={limits.min}
                      onChange={(e) => handleAxisLimitChange(axisName, 'min', parseInt(e.target.value))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Max (°):</label>
                    <input
                      type="number"
                      className="form-control"
                      value={limits.max}
                      onChange={(e) => handleAxisLimitChange(axisName, 'max', parseInt(e.target.value))}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {localConfig.manipulators.count > 0 && (
        <div className="control-section" style={{ marginTop: '30px' }}>
          <h3>Manipulator Limits</h3>
          <div className="control-grid">
            {Array.from({ length: localConfig.manipulators.count }, (_, i) => {
              const manipulatorName = `gripper${i + 1}`;
              const limits = localConfig.manipulators[manipulatorName] || { min: 0, max: 100 };
              
              return (
                <div key={manipulatorName} style={{ marginBottom: '20px' }}>
                  <h4>Gripper {i + 1}</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="form-group">
                      <label>Min (%):</label>
                      <input
                        type="number"
                        className="form-control"
                        value={limits.min}
                        onChange={(e) => handleManipulatorLimitChange(manipulatorName, 'min', parseInt(e.target.value))}
                      />
                    </div>
                    <div className="form-group">
                      <label>Max (%):</label>
                      <input
                        type="number"
                        className="form-control"
                        value={limits.max}
                        onChange={(e) => handleManipulatorLimitChange(manipulatorName, 'max', parseInt(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="button-group" style={{ marginTop: '30px' }}>
        <button 
          className="btn btn-success" 
          onClick={saveConfiguration}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Configuration'}
        </button>
        
        <button 
          className="btn btn-secondary" 
          onClick={resetToDefaults}
          disabled={isSaving}
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
};

export default Configuration;