import React, { useState, useEffect } from "react";
import axios from "axios";
import { Socket } from "socket.io-client";

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
  axes: {
    count: number;
    limits: { [key: string]: { min: number; max: number } };
  };
  manipulators: {
    count: number;
    [key: string]: any;
  };
}

interface RobotState {
  x: number;
  y: number;
  z: number;
  a: number;
  b: number;
  c: number;
  gripper: number;
  isConnected: boolean;
}

interface ManualControlProps {
  config: RobotConfig;
  socket: Socket | null;
}

const ManualControl: React.FC<ManualControlProps> = ({ config, socket }) => {
  const [robotState, setRobotState] = useState<RobotState>({
    x: 0,
    y: 0,
    z: 0,
    a: 0,
    b: 0,
    c: 0,
    gripper: 0,
    isConnected: true,
  });
  const [jogDistance, setJogDistance] = useState<number>(1);
  const [savedPositionName, setSavedPositionName] = useState<string>("");

  useEffect(() => {
    // Get current position on component mount
    const getCurrentPosition = async () => {
      try {
        const response = await axios.get("/api/positions/current");
        if (response.data) {
          setRobotState({
            x: response.data.axes?.x || 0,
            y: response.data.axes?.y || 0,
            z: response.data.axes?.z || 0,
            a: response.data.axes?.a || 0,
            b: response.data.axes?.b || 0,
            c: response.data.axes?.c || 0,
            gripper: response.data.manipulators?.gripper1 || 0,
            isConnected: true,
          });
        }
      } catch (error) {
        console.error("Error getting current position:", error);
      }
    };

    getCurrentPosition();

    // Listen for robot movement updates from socket
    if (socket) {
      socket.on("robotMovement", (data) => {
        console.log("Robot movement update:", data);
        // Update robot state based on socket data
      });
    }

    return () => {
      if (socket) {
        socket.off("robotMovement");
      }
    };
  }, [socket]);

  const jogAxis = async (axis: string, direction: number) => {
    try {
      const newValue =
        (robotState[axis as keyof RobotState] as number) +
        direction * jogDistance;
      await axios.post("/api/manual/move", {
        axis: axis.toUpperCase(),
        value: newValue,
      });
      // Update the robot state to reflect the move
      setRobotState((prev) => ({ ...prev, [axis]: newValue }));
    } catch (error) {
      console.error("Error jogging axis:", error);
    }
  };

  const setGripper = async (position: number) => {
    try {
      await axios.post("/api/manual/move", {
        manipulator: "gripper1",
        value: position,
      });
      // Update the robot state to reflect gripper change
      setRobotState((prev) => ({ ...prev, gripper: position }));
    } catch (error) {
      console.error("Error setting gripper:", error);
    }
  };

  const homeAll = async () => {
    try {
      const response = await axios.post("/api/home");
      setRobotState(response.data);
    } catch (error) {
      console.error("Error homing:", error);
    }
  };

  const emergencyStop = async () => {
    try {
      await axios.post("/api/emergency-stop");
      alert("Emergency stop activated!");
    } catch (error) {
      console.error("Error activating emergency stop:", error);
    }
  };

  const savePosition = async () => {
    if (!savedPositionName.trim()) {
      alert("Please enter a position name");
      return;
    }

    try {
      await axios.post("/api/positions", {
        name: savedPositionName,
        x: robotState.x,
        y: robotState.y,
        z: robotState.z,
        a: robotState.a,
        b: robotState.b,
        c: robotState.c,
        gripper: robotState.gripper,
      });
      setSavedPositionName("");
      alert("Position saved successfully!");
    } catch (error) {
      console.error("Error saving position:", error);
      alert("Error saving position");
    }
  };

  return (
    <div className="tab-content">
      <div className="control-section">
        <h3>Current Position</h3>
        <div className="position-display">
          <div className="axis-values">
            <div>X: {robotState.x}mm</div>
            <div>Y: {robotState.y}mm</div>
            <div>Z: {robotState.z}mm</div>
            <div>A: {robotState.a}°</div>
            <div>B: {robotState.b}°</div>
            <div>C: {robotState.c}°</div>
            <div>Gripper: {robotState.gripper}%</div>
          </div>
        </div>
      </div>

      <div className="control-section">
        <h3>Jog Distance</h3>
        <div className="jog-distance">
          <label>
            Distance:
            <select
              value={jogDistance}
              onChange={(e) => setJogDistance(Number(e.target.value))}
            >
              <option value={0.1}>0.1mm</option>
              <option value={1}>1mm</option>
              <option value={10}>10mm</option>
              <option value={100}>100mm</option>
            </select>
          </label>
        </div>
      </div>

      <div className="control-section">
        <h3>Axis Control</h3>
        <div className="axis-controls">
          {["x", "y", "z", "a", "b", "c"].map((axis) => (
            <div key={axis} className="axis-control">
              <span className="axis-label">{axis.toUpperCase()}:</span>
              <button onClick={() => jogAxis(axis, -1)}>-</button>
              <span className="axis-value">
                {axis === "a" || axis === "b" || axis === "c"
                  ? `${robotState[axis as keyof RobotState]}°`
                  : `${robotState[axis as keyof RobotState]}mm`}
              </span>
              <button onClick={() => jogAxis(axis, 1)}>+</button>
            </div>
          ))}
        </div>
      </div>

      <div className="control-section">
        <h3>Gripper Control</h3>
        <div className="gripper-controls">
          <button onClick={() => setGripper(0)}>Close</button>
          <button onClick={() => setGripper(50)}>50%</button>
          <button onClick={() => setGripper(100)}>Open</button>
          <div className="gripper-value">Current: {robotState.gripper}%</div>
        </div>
      </div>

      <div className="control-section">
        <h3>System Controls</h3>
        <div className="system-controls">
          <button onClick={homeAll} className="home-button">
            Home All
          </button>
          <button onClick={emergencyStop} className="emergency-button">
            Emergency Stop
          </button>
        </div>
      </div>

      <div className="control-section">
        <h3>Save Position</h3>
        <div className="save-position">
          <input
            type="text"
            placeholder="Position name"
            value={savedPositionName}
            onChange={(e) => setSavedPositionName(e.target.value)}
          />
          <button onClick={savePosition}>Save Current Position</button>
        </div>
      </div>
    </div>
  );
};

export default ManualControl;
