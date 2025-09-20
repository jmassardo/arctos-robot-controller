import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface RobotProfile {
  id: string;
  name: string;
  type: 'articulated' | 'cartesian' | 'delta' | 'scara' | 'custom';
  manufacturer: string;
  model: string;
  description: string;
  dof: number; // Degrees of freedom
  kinematics: KinematicsConfig;
  workspace: WorkspaceConfig;
  safety: SafetyConfig;
  communication: CommunicationConfig;
  calibration: CalibrationConfig;
  created: Date;
  modified: Date;
}

interface KinematicsConfig {
  type: 'dh' | 'custom' | 'forward' | 'inverse';
  dhParameters?: DHParameter[];
  customFunction?: string;
  toolOffset: { x: number; y: number; z: number; rx: number; ry: number; rz: number };
  baseOffset: { x: number; y: number; z: number; rx: number; ry: number; rz: number };
  linkLengths: number[];
  jointTypes: ('revolute' | 'prismatic')[];
}

interface DHParameter {
  a: number;      // Link length
  alpha: number;  // Link twist
  d: number;      // Joint offset
  theta: number;  // Joint angle
}

interface WorkspaceConfig {
  type: 'cylindrical' | 'rectangular' | 'spherical' | 'custom';
  boundaries: {
    xMin: number; xMax: number;
    yMin: number; yMax: number;
    zMin: number; zMax: number;
  };
  safeZones: SafeZone[];
  restrictedZones: RestrictedZone[];
  workpieceOffset: { x: number; y: number; z: number };
}

interface SafeZone {
  name: string;
  type: 'box' | 'cylinder' | 'sphere';
  dimensions: any;
  priority: number;
}

interface RestrictedZone {
  name: string;
  type: 'box' | 'cylinder' | 'sphere';
  dimensions: any;
  reason: string;
  severity: 'warning' | 'error' | 'critical';
}

interface SafetyConfig {
  emergencyStop: boolean;
  softLimits: boolean;
  collisionDetection: boolean;
  forceLimit: number;
  velocityLimit: number;
  accelerationLimit: number;
  watchdogTimeout: number;
  safetyZones: string[];
  interlocks: InterlockConfig[];
}

interface InterlockConfig {
  name: string;
  type: 'digital_input' | 'safety_relay' | 'light_curtain' | 'pressure_mat';
  pin: number;
  normallyOpen: boolean;
  description: string;
}

interface CommunicationConfig {
  protocol: 'ethernet' | 'can' | 'serial' | 'ethercat' | 'profinet' | 'modbus';
  settings: any;
  redundancy: boolean;
  heartbeatInterval: number;
  timeout: number;
}

interface CalibrationConfig {
  lastCalibrated: Date | null;
  calibrationPoints: CalibrationPoint[];
  accuracy: number;
  repeatability: number;
  backlash: number[];
  temperature: number;
  procedures: CalibrationProcedure[];
}

interface CalibrationPoint {
  id: string;
  name: string;
  targetPosition: number[];
  actualPosition: number[];
  error: number[];
  timestamp: Date;
}

interface CalibrationProcedure {
  name: string;
  description: string;
  steps: CalibrationStep[];
  required: boolean;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'on_demand';
}

interface CalibrationStep {
  instruction: string;
  type: 'move' | 'measure' | 'input' | 'verify';
  parameters: any;
  validation?: (result: any) => boolean;
}

interface AdvancedConfigurationProps {
  config: any;
  onConfigUpdate: (config: any) => void;
}

const AdvancedConfiguration: React.FC<AdvancedConfigurationProps> = ({ config, onConfigUpdate }) => {
  const [robotProfiles, setRobotProfiles] = useState<RobotProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>('');
  const [currentProfile, setCurrentProfile] = useState<RobotProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'kinematics' | 'workspace' | 'safety' | 'communication' | 'calibration'>('basic');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  // Predefined robot templates
  const robotTemplates: Partial<RobotProfile>[] = [
    {
      name: "6-DOF Articulated Arm",
      type: "articulated",
      manufacturer: "Generic",
      description: "Standard 6-axis articulated robotic arm",
      dof: 6,
      kinematics: {
        type: 'dh',
        dhParameters: [
          { a: 0, alpha: 0, d: 330, theta: 0 },
          { a: 270, alpha: -90, d: 0, theta: 0 },
          { a: 70, alpha: 0, d: 0, theta: 0 },
          { a: 0, alpha: 90, d: 302, theta: 0 },
          { a: 0, alpha: -90, d: 0, theta: 0 },
          { a: 0, alpha: 90, d: 72, theta: 0 }
        ],
        toolOffset: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
        baseOffset: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
        linkLengths: [330, 270, 70, 302, 0, 72],
        jointTypes: ['revolute', 'revolute', 'revolute', 'revolute', 'revolute', 'revolute']
      }
    },
    {
      name: "Cartesian Gantry",
      type: "cartesian",
      manufacturer: "Generic",
      description: "Linear XYZ gantry system",
      dof: 3,
      kinematics: {
        type: 'forward',
        toolOffset: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
        baseOffset: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
        linkLengths: [1000, 600, 300],
        jointTypes: ['prismatic', 'prismatic', 'prismatic']
      }
    },
    {
      name: "Delta Robot",
      type: "delta",
      manufacturer: "Generic", 
      description: "Parallel delta configuration",
      dof: 3,
      kinematics: {
        type: 'custom',
        toolOffset: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
        baseOffset: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
        linkLengths: [200, 460, 100],
        jointTypes: ['revolute', 'revolute', 'revolute']
      }
    }
  ];

  useEffect(() => {
    loadRobotProfiles();
  }, []);

  const loadRobotProfiles = async () => {
    try {
      const response = await axios.get('/api/robot-profiles');
      if (response.data.success) {
        setRobotProfiles(response.data.profiles);
        const activeId = response.data.activeProfile;
        if (activeId) {
          setActiveProfileId(activeId);
          const profile = response.data.profiles.find((p: RobotProfile) => p.id === activeId);
          setCurrentProfile(profile || null);
        }
      }
    } catch (error) {
      console.error('Error loading robot profiles:', error);
    }
  };

  const createNewProfile = (template?: Partial<RobotProfile>) => {
    const newProfile: RobotProfile = {
      id: Date.now().toString(),
      name: template?.name || 'New Robot Profile',
      type: template?.type || 'custom',
      manufacturer: template?.manufacturer || 'Custom',
      model: 'Custom Model',
      description: template?.description || 'Custom robot configuration',
      dof: template?.dof || 6,
      kinematics: template?.kinematics || {
        type: 'dh',
        toolOffset: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
        baseOffset: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
        linkLengths: [],
        jointTypes: []
      },
      workspace: {
        type: 'cylindrical',
        boundaries: { xMin: -500, xMax: 500, yMin: -500, yMax: 500, zMin: 0, zMax: 800 },
        safeZones: [],
        restrictedZones: [],
        workpieceOffset: { x: 0, y: 0, z: 0 }
      },
      safety: {
        emergencyStop: true,
        softLimits: true,
        collisionDetection: false,
        forceLimit: 100,
        velocityLimit: 1000,
        accelerationLimit: 5000,
        watchdogTimeout: 1000,
        safetyZones: [],
        interlocks: []
      },
      communication: {
        protocol: 'can',
        settings: {},
        redundancy: false,
        heartbeatInterval: 100,
        timeout: 5000
      },
      calibration: {
        lastCalibrated: null,
        calibrationPoints: [],
        accuracy: 0.1,
        repeatability: 0.05,
        backlash: [],
        temperature: 20,
        procedures: []
      },
      created: new Date(),
      modified: new Date()
    };

    setCurrentProfile(newProfile);
    setRobotProfiles(prev => [...prev, newProfile]);
  };

  const saveProfile = async () => {
    if (!currentProfile) return;

    setIsSaving(true);
    setSaveStatus('saving');

    try {
      const updatedProfile = { ...currentProfile, modified: new Date() };
      const response = await axios.post('/api/robot-profiles', updatedProfile);
      
      if (response.data.success) {
        setRobotProfiles(prev => 
          prev.map(p => p.id === updatedProfile.id ? updatedProfile : p)
        );
        setCurrentProfile(updatedProfile);
        setSaveStatus('success');
        
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        throw new Error(response.data.error);
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const activateProfile = async (profileId: string) => {
    try {
      const response = await axios.post('/api/robot-profiles/activate', { profileId });
      if (response.data.success) {
        setActiveProfileId(profileId);
        const profile = robotProfiles.find(p => p.id === profileId);
        setCurrentProfile(profile || null);
        onConfigUpdate(response.data.config);
      }
    } catch (error) {
      console.error('Error activating profile:', error);
    }
  };

  const exportProfile = () => {
    if (!currentProfile) return;
    
    const dataStr = JSON.stringify(currentProfile, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `${currentProfile.name.replace(/\s+/g, '_')}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const importProfile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const profile = JSON.parse(e.target?.result as string) as RobotProfile;
        profile.id = Date.now().toString();
        profile.created = new Date();
        profile.modified = new Date();
        
        setRobotProfiles(prev => [...prev, profile]);
        setCurrentProfile(profile);
      } catch (error) {
        alert('Error importing profile: Invalid JSON format');
      }
    };
    reader.readAsText(file);
  };

  const updateProfile = (section: keyof RobotProfile, updates: any) => {
    if (!currentProfile) return;
    
    setCurrentProfile(prev => prev ? {
      ...prev,
      [section]: typeof updates === 'function' ? updates(prev[section]) : { ...(prev[section] as any), ...updates },
      modified: new Date()
    } : null);
  };

  const renderBasicConfig = () => (
    <div className="config-section">
      <h3>Basic Configuration</h3>
      
      <div className="form-group">
        <label>Robot Name:</label>
        <input
          type="text"
          className="form-control"
          value={currentProfile?.name || ''}
          onChange={(e) => updateProfile('name', e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>Robot Type:</label>
        <select
          className="form-control"
          value={currentProfile?.type || ''}
          onChange={(e) => updateProfile('type', e.target.value)}
        >
          <option value="articulated">Articulated</option>
          <option value="cartesian">Cartesian</option>
          <option value="delta">Delta</option>
          <option value="scara">SCARA</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      <div className="form-group">
        <label>Manufacturer:</label>
        <input
          type="text"
          className="form-control"
          value={currentProfile?.manufacturer || ''}
          onChange={(e) => updateProfile('manufacturer', e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>Model:</label>
        <input
          type="text"
          className="form-control"
          value={currentProfile?.model || ''}
          onChange={(e) => updateProfile('model', e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>Description:</label>
        <textarea
          className="form-control"
          rows={3}
          value={currentProfile?.description || ''}
          onChange={(e) => updateProfile('description', e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>Degrees of Freedom:</label>
        <input
          type="number"
          className="form-control"
          min="1"
          max="12"
          value={currentProfile?.dof || 6}
          onChange={(e) => updateProfile('dof', parseInt(e.target.value))}
        />
      </div>
    </div>
  );

  const renderKinematicsConfig = () => (
    <div className="config-section">
      <h3>Kinematics Configuration</h3>
      
      <div className="form-group">
        <label>Kinematics Type:</label>
        <select
          className="form-control"
          value={currentProfile?.kinematics.type || 'dh'}
          onChange={(e) => updateProfile('kinematics', { type: e.target.value })}
        >
          <option value="dh">Denavit-Hartenberg Parameters</option>
          <option value="custom">Custom Function</option>
          <option value="forward">Forward Kinematics Only</option>
          <option value="inverse">Inverse Kinematics Only</option>
        </select>
      </div>

      {currentProfile?.kinematics.type === 'dh' && (
        <div>
          <h4>D-H Parameters</h4>
          <table className="dh-table">
            <thead>
              <tr>
                <th>Joint</th>
                <th>a (mm)</th>
                <th>α (deg)</th>
                <th>d (mm)</th>
                <th>θ (deg)</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: currentProfile.dof }, (_, i) => (
                <tr key={i}>
                  <td>J{i + 1}</td>
                  <td>
                    <input
                      type="number"
                      className="form-control"
                      value={currentProfile.kinematics.dhParameters?.[i]?.a || 0}
                      onChange={(e) => {
                        const newParams = [...(currentProfile.kinematics.dhParameters || [])];
                        newParams[i] = { ...(newParams[i] || {}), a: parseFloat(e.target.value) };
                        updateProfile('kinematics', { dhParameters: newParams });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="form-control"
                      value={currentProfile.kinematics.dhParameters?.[i]?.alpha || 0}
                      onChange={(e) => {
                        const newParams = [...(currentProfile.kinematics.dhParameters || [])];
                        newParams[i] = { ...(newParams[i] || {}), alpha: parseFloat(e.target.value) };
                        updateProfile('kinematics', { dhParameters: newParams });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="form-control"
                      value={currentProfile.kinematics.dhParameters?.[i]?.d || 0}
                      onChange={(e) => {
                        const newParams = [...(currentProfile.kinematics.dhParameters || [])];
                        newParams[i] = { ...(newParams[i] || {}), d: parseFloat(e.target.value) };
                        updateProfile('kinematics', { dhParameters: newParams });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="form-control"
                      value={currentProfile.kinematics.dhParameters?.[i]?.theta || 0}
                      onChange={(e) => {
                        const newParams = [...(currentProfile.kinematics.dhParameters || [])];
                        newParams[i] = { ...(newParams[i] || {}), theta: parseFloat(e.target.value) };
                        updateProfile('kinematics', { dhParameters: newParams });
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '20px' }}>
        <h4>Tool and Base Offsets</h4>
        <div className="offset-grid">
          <div>
            <h5>Tool Offset</h5>
            {['x', 'y', 'z', 'rx', 'ry', 'rz'].map(axis => (
              <div key={axis} className="form-group">
                <label>{axis.toUpperCase()}:</label>
                <input
                  type="number"
                  className="form-control"
                  step="0.1"
                  value={currentProfile?.kinematics.toolOffset?.[axis as keyof typeof currentProfile.kinematics.toolOffset] || 0}
                  onChange={(e) => updateProfile('kinematics', {
                    toolOffset: {
                      ...currentProfile?.kinematics.toolOffset,
                      [axis]: parseFloat(e.target.value)
                    }
                  })}
                />
              </div>
            ))}
          </div>
          
          <div>
            <h5>Base Offset</h5>
            {['x', 'y', 'z', 'rx', 'ry', 'rz'].map(axis => (
              <div key={axis} className="form-group">
                <label>{axis.toUpperCase()}:</label>
                <input
                  type="number"
                  className="form-control"
                  step="0.1"
                  value={currentProfile?.kinematics.baseOffset?.[axis as keyof typeof currentProfile.kinematics.baseOffset] || 0}
                  onChange={(e) => updateProfile('kinematics', {
                    baseOffset: {
                      ...currentProfile?.kinematics.baseOffset,
                      [axis]: parseFloat(e.target.value)
                    }
                  })}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderWorkspaceConfig = () => (
    <div className="config-section">
      <h3>Workspace Configuration</h3>
      
      <div className="form-group">
        <label>Workspace Type:</label>
        <select
          className="form-control"
          value={currentProfile?.workspace.type || 'rectangular'}
          onChange={(e) => updateProfile('workspace', { type: e.target.value })}
        >
          <option value="rectangular">Rectangular</option>
          <option value="cylindrical">Cylindrical</option>
          <option value="spherical">Spherical</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      <h4>Workspace Boundaries</h4>
      <div className="boundary-grid">
        {['x', 'y', 'z'].map(axis => (
          <div key={axis} className="boundary-pair">
            <h5>{axis.toUpperCase()}-Axis</h5>
            <div className="form-group">
              <label>Min:</label>
              <input
                type="number"
                className="form-control"
                value={currentProfile?.workspace.boundaries?.[`${axis}Min` as keyof typeof currentProfile.workspace.boundaries] || 0}
                onChange={(e) => updateProfile('workspace', {
                  boundaries: {
                    ...currentProfile?.workspace.boundaries,
                    [`${axis}Min`]: parseFloat(e.target.value)
                  }
                })}
              />
            </div>
            <div className="form-group">
              <label>Max:</label>
              <input
                type="number"
                className="form-control"
                value={currentProfile?.workspace.boundaries?.[`${axis}Max` as keyof typeof currentProfile.workspace.boundaries] || 0}
                onChange={(e) => updateProfile('workspace', {
                  boundaries: {
                    ...currentProfile?.workspace.boundaries,
                    [`${axis}Max`]: parseFloat(e.target.value)
                  }
                })}
              />
            </div>
          </div>
        ))}
      </div>

      <h4>Workpiece Offset</h4>
      <div className="offset-grid">
        {['x', 'y', 'z'].map(axis => (
          <div key={axis} className="form-group">
            <label>{axis.toUpperCase()}:</label>
            <input
              type="number"
              className="form-control"
              step="0.1"
              value={currentProfile?.workspace.workpieceOffset?.[axis as keyof typeof currentProfile.workspace.workpieceOffset] || 0}
              onChange={(e) => updateProfile('workspace', {
                workpieceOffset: {
                  ...currentProfile?.workspace.workpieceOffset,
                  [axis]: parseFloat(e.target.value)
                }
              })}
            />
          </div>
        ))}
      </div>
    </div>
  );

  const renderSafetyConfig = () => (
    <div className="config-section">
      <h3>Safety Configuration</h3>
      
      <div className="safety-checks">
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={currentProfile?.safety.emergencyStop || false}
              onChange={(e) => updateProfile('safety', { emergencyStop: e.target.checked })}
            />
            Emergency Stop Enabled
          </label>
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={currentProfile?.safety.softLimits || false}
              onChange={(e) => updateProfile('safety', { softLimits: e.target.checked })}
            />
            Software Limits Enabled
          </label>
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={currentProfile?.safety.collisionDetection || false}
              onChange={(e) => updateProfile('safety', { collisionDetection: e.target.checked })}
            />
            Collision Detection Enabled
          </label>
        </div>
      </div>

      <h4>Safety Limits</h4>
      <div className="safety-limits">
        <div className="form-group">
          <label>Force Limit (N):</label>
          <input
            type="number"
            className="form-control"
            value={currentProfile?.safety.forceLimit || 100}
            onChange={(e) => updateProfile('safety', { forceLimit: parseFloat(e.target.value) })}
          />
        </div>

        <div className="form-group">
          <label>Velocity Limit (mm/s):</label>
          <input
            type="number"
            className="form-control"
            value={currentProfile?.safety.velocityLimit || 1000}
            onChange={(e) => updateProfile('safety', { velocityLimit: parseFloat(e.target.value) })}
          />
        </div>

        <div className="form-group">
          <label>Acceleration Limit (mm/s²):</label>
          <input
            type="number"
            className="form-control"
            value={currentProfile?.safety.accelerationLimit || 5000}
            onChange={(e) => updateProfile('safety', { accelerationLimit: parseFloat(e.target.value) })}
          />
        </div>

        <div className="form-group">
          <label>Watchdog Timeout (ms):</label>
          <input
            type="number"
            className="form-control"
            value={currentProfile?.safety.watchdogTimeout || 1000}
            onChange={(e) => updateProfile('safety', { watchdogTimeout: parseInt(e.target.value) })}
          />
        </div>
      </div>

      <h4>Safety Interlocks</h4>
      <div className="interlocks-section">
        {currentProfile?.safety.interlocks?.map((interlock, index) => (
          <div key={index} className="interlock-config">
            <div className="form-group">
              <label>Name:</label>
              <input
                type="text"
                className="form-control"
                value={interlock.name}
                onChange={(e) => {
                  const newInterlocks = [...(currentProfile.safety.interlocks || [])];
                  newInterlocks[index] = { ...interlock, name: e.target.value };
                  updateProfile('safety', { interlocks: newInterlocks });
                }}
              />
            </div>
            <div className="form-group">
              <label>Type:</label>
              <select
                className="form-control"
                value={interlock.type}
                onChange={(e) => {
                  const newInterlocks = [...(currentProfile.safety.interlocks || [])];
                  newInterlocks[index] = { ...interlock, type: e.target.value as any };
                  updateProfile('safety', { interlocks: newInterlocks });
                }}
              >
                <option value="digital_input">Digital Input</option>
                <option value="safety_relay">Safety Relay</option>
                <option value="light_curtain">Light Curtain</option>
                <option value="pressure_mat">Pressure Mat</option>
              </select>
            </div>
          </div>
        )) || []}
        
        <button
          className="btn btn-secondary"
          onClick={() => {
            const newInterlock: InterlockConfig = {
              name: 'New Interlock',
              type: 'digital_input',
              pin: 0,
              normallyOpen: true,
              description: ''
            };
            updateProfile('safety', {
              interlocks: [...(currentProfile?.safety.interlocks || []), newInterlock]
            });
          }}
        >
          Add Interlock
        </button>
      </div>
    </div>
  );

  const renderCommunicationConfig = () => (
    <div className="config-section">
      <h3>Communication Configuration</h3>
      
      <div className="form-group">
        <label>Protocol:</label>
        <select
          className="form-control"
          value={currentProfile?.communication.protocol || 'can'}
          onChange={(e) => updateProfile('communication', { protocol: e.target.value })}
        >
          <option value="ethernet">Ethernet</option>
          <option value="can">CAN Bus</option>
          <option value="serial">Serial</option>
          <option value="ethercat">EtherCAT</option>
          <option value="profinet">PROFINET</option>
          <option value="modbus">Modbus</option>
        </select>
      </div>

      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={currentProfile?.communication.redundancy || false}
            onChange={(e) => updateProfile('communication', { redundancy: e.target.checked })}
          />
          Enable Redundant Communication
        </label>
      </div>

      <div className="form-group">
        <label>Heartbeat Interval (ms):</label>
        <input
          type="number"
          className="form-control"
          value={currentProfile?.communication.heartbeatInterval || 100}
          onChange={(e) => updateProfile('communication', { heartbeatInterval: parseInt(e.target.value) })}
        />
      </div>

      <div className="form-group">
        <label>Timeout (ms):</label>
        <input
          type="number"
          className="form-control"
          value={currentProfile?.communication.timeout || 5000}
          onChange={(e) => updateProfile('communication', { timeout: parseInt(e.target.value) })}
        />
      </div>
    </div>
  );

  const renderCalibrationConfig = () => (
    <div className="config-section">
      <h3>Calibration Configuration</h3>
      
      {currentProfile?.calibration.lastCalibrated && (
        <div className="calibration-status">
          <h4>Last Calibration: {new Date(currentProfile.calibration.lastCalibrated).toLocaleDateString()}</h4>
        </div>
      )}

      <div className="calibration-metrics">
        <div className="form-group">
          <label>Required Accuracy (mm):</label>
          <input
            type="number"
            className="form-control"
            step="0.01"
            value={currentProfile?.calibration.accuracy || 0.1}
            onChange={(e) => updateProfile('calibration', { accuracy: parseFloat(e.target.value) })}
          />
        </div>

        <div className="form-group">
          <label>Required Repeatability (mm):</label>
          <input
            type="number"
            className="form-control"
            step="0.01"
            value={currentProfile?.calibration.repeatability || 0.05}
            onChange={(e) => updateProfile('calibration', { repeatability: parseFloat(e.target.value) })}
          />
        </div>

        <div className="form-group">
          <label>Operating Temperature (°C):</label>
          <input
            type="number"
            className="form-control"
            value={currentProfile?.calibration.temperature || 20}
            onChange={(e) => updateProfile('calibration', { temperature: parseFloat(e.target.value) })}
          />
        </div>
      </div>

      <div className="calibration-actions">
        <button
          className="btn btn-primary"
          onClick={() => alert('Calibration wizard not yet implemented')}
        >
          Start Calibration Wizard
        </button>
        
        <button
          className="btn btn-secondary"
          onClick={() => alert('Accuracy test not yet implemented')}
        >
          Run Accuracy Test
        </button>
      </div>
    </div>
  );

  if (!currentProfile) {
    return (
      <div className="advanced-config">
        <h2>Advanced Robot Configuration</h2>
        
        <div className="profile-manager">
          <h3>Robot Profiles</h3>
          
          <div className="profiles-list">
            {robotProfiles.map(profile => (
              <div key={profile.id} className={`profile-card ${activeProfileId === profile.id ? 'active' : ''}`}>
                <h4>{profile.name}</h4>
                <p>{profile.description}</p>
                <div className="profile-actions">
                  <button onClick={() => setCurrentProfile(profile)}>Edit</button>
                  <button onClick={() => activateProfile(profile.id)}>
                    {activeProfileId === profile.id ? 'Active' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          <div className="new-profile-section">
            <h4>Create New Profile</h4>
            <div className="template-buttons">
              <button onClick={() => createNewProfile()}>From Scratch</button>
              {robotTemplates.map((template, index) => (
                <button key={index} onClick={() => createNewProfile(template)}>
                  {template.name}
                </button>
              ))}
            </div>
          </div>
          
          <div className="import-section">
            <label>Import Profile:</label>
            <input type="file" accept=".json" onChange={importProfile} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="advanced-config">
      <div className="config-header">
        <h2>Advanced Configuration - {currentProfile.name}</h2>
        
        {saveStatus === 'success' && (
          <div className="alert alert-success">Profile saved successfully!</div>
        )}
        {saveStatus === 'error' && (
          <div className="alert alert-danger">Error saving profile. Please try again.</div>
        )}
        
        <div className="header-actions">
          <button onClick={() => setCurrentProfile(null)}>← Back to Profiles</button>
          <button onClick={exportProfile}>Export Profile</button>
          <button onClick={saveProfile} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>

      <div className="config-tabs">
        {(['basic', 'kinematics', 'workspace', 'safety', 'communication', 'calibration'] as const).map(tab => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="config-content">
        {activeTab === 'basic' && renderBasicConfig()}
        {activeTab === 'kinematics' && renderKinematicsConfig()}
        {activeTab === 'workspace' && renderWorkspaceConfig()}
        {activeTab === 'safety' && renderSafetyConfig()}
        {activeTab === 'communication' && renderCommunicationConfig()}
        {activeTab === 'calibration' && renderCalibrationConfig()}
      </div>
    </div>
  );
};

export default AdvancedConfiguration;