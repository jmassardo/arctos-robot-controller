import React, { useState, useEffect, useCallback } from "react";
import { Socket } from "socket.io-client";
import axios from "axios";

interface Position {
  id: number;
  name: string;
  axes: { [key: string]: number };
  manipulators: { [key: string]: number };
  delay: number;
  groupId?: number | null;
  timestamp: string;
}

interface Group {
  id: number;
  name: string;
  description?: string;
  timestamp: string;
}

interface PositionReplayProps {
  positions: Position[];
  groups: Group[];
  socket: Socket | null;
  config: any;
}

interface ProgressLogEntry {
  id: number;
  message: string;
  timestamp: Date;
  type: "info" | "success" | "error";
}

type ReplayMode = "once" | "count" | "infinite";

const PositionReplay: React.FC<PositionReplayProps> = ({
  positions = [],
  groups = [],
  socket,
  config,
}) => {
  const [selectedPositions, setSelectedPositions] = useState<number[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayProgress, setReplayProgress] = useState(0);
  const [currentPosition, setCurrentPosition] = useState<string>("");
  const [shouldStop, setShouldStop] = useState(false);

  // Advanced replay settings
  const [replayMode, setReplayMode] = useState<ReplayMode>("once");
  const [repeatCount, setRepeatCount] = useState(1);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [globalDelay, setGlobalDelay] = useState(1000);

  // Progress logging
  const [progressLog, setProgressLog] = useState<ProgressLogEntry[]>([]);
  const [showProgressLog, setShowProgressLog] = useState(false);

  // Group management
  const [newGroupName, setNewGroupName] = useState("");
  const [showGroupCreation, setShowGroupCreation] = useState(false);

  const addProgressLogEntry = useCallback(
    (message: string, type: ProgressLogEntry["type"] = "info") => {
      const entry: ProgressLogEntry = {
        id: Date.now(),
        message,
        timestamp: new Date(),
        type,
      };
      setProgressLog((prev) => [entry, ...prev.slice(0, 99)]); // Keep only 100 entries
    },
    []
  );

  const clearProgressLog = () => {
    setProgressLog([]);
  };

  const selectPosition = (positionId: number) => {
    setSelectedPositions((prev) =>
      prev.includes(positionId)
        ? prev.filter((id) => id !== positionId)
        : [...prev, positionId]
    );
  };

  const selectAllPositions = () => {
    if (!positions || positions.length === 0) return;

    if (selectedPositions.length === positions.length) {
      setSelectedPositions([]);
    } else {
      setSelectedPositions(positions.map((p) => p.id));
    }
  };

  const selectGroupPositions = (groupId: number | null) => {
    if (!positions) return;

    const groupPositions = positions.filter((p) => p.groupId === groupId);
    const groupPositionIds = groupPositions.map((p) => p.id);

    // If all group positions are already selected, deselect them
    const allSelected = groupPositionIds.every((id) =>
      selectedPositions.includes(id)
    );

    if (allSelected) {
      setSelectedPositions((prev) =>
        prev.filter((id) => !groupPositionIds.includes(id))
      );
    } else {
      setSelectedPositions((prev) => {
        const combined = [...prev, ...groupPositionIds];
        return Array.from(new Set(combined));
      });
    }
  };

  const replaySequence = async () => {
    if (selectedPositions.length === 0) {
      alert("Please select at least one position to replay");
      return;
    }

    setIsReplaying(true);
    setShouldStop(false);
    setReplayProgress(0);
    setCurrentIteration(0);

    const selectedPositionObjects = positions.filter((p) =>
      selectedPositions.includes(p.id)
    );

    addProgressLogEntry(
      `Starting replay sequence with ${selectedPositionObjects.length} positions`,
      "info"
    );
    addProgressLogEntry(
      `Mode: ${replayMode}${
        replayMode === "count" ? ` (${repeatCount} times)` : ""
      }`,
      "info"
    );

    try {
      const totalIterations =
        replayMode === "infinite"
          ? Number.MAX_SAFE_INTEGER
          : replayMode === "count"
          ? repeatCount
          : 1;

      for (
        let iteration = 0;
        iteration < totalIterations && !shouldStop;
        iteration++
      ) {
        setCurrentIteration(iteration + 1);
        addProgressLogEntry(
          `Starting iteration ${iteration + 1}${
            replayMode === "count" ? ` of ${repeatCount}` : ""
          }`,
          "info"
        );

        for (
          let i = 0;
          i < selectedPositionObjects.length && !shouldStop;
          i++
        ) {
          const position = selectedPositionObjects[i];

          setCurrentPosition(position.name);
          setReplayProgress(
            ((iteration * selectedPositionObjects.length + i + 1) /
              (replayMode === "infinite"
                ? selectedPositionObjects.length
                : totalIterations * selectedPositionObjects.length)) *
              100
          );

          addProgressLogEntry(`Executing position: ${position.name}`, "info");

          try {
            const response = await axios.post(`/api/replay/${position.id}`);

            if (response.data.success) {
              addProgressLogEntry(
                `Successfully executed position: ${position.name}`,
                "success"
              );

              // Emit real-time update via socket
              if (socket) {
                socket.emit("positionReplayed", {
                  position: position.name,
                  axes: position.axes,
                  manipulators: position.manipulators,
                  timestamp: Date.now(),
                });
              }
            } else {
              throw new Error(response.data.error || "Position replay failed");
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            addProgressLogEntry(
              `Failed to execute position ${position.name}: ${errorMessage}`,
              "error"
            );
            console.error("Position replay error:", error);
          }

          // Apply position-specific delay
          if (position.delay > 0 && !shouldStop) {
            addProgressLogEntry(
              `Waiting ${position.delay}ms (position delay)`,
              "info"
            );
            await new Promise((resolve) => setTimeout(resolve, position.delay));
          }

          // Apply global delay
          if (
            globalDelay > 0 &&
            !shouldStop &&
            i < selectedPositionObjects.length - 1
          ) {
            addProgressLogEntry(
              `Waiting ${globalDelay}ms (global delay)`,
              "info"
            );
            await new Promise((resolve) => setTimeout(resolve, globalDelay));
          }
        }

        // For infinite mode, add a longer delay between iterations
        if (
          replayMode === "infinite" &&
          !shouldStop &&
          iteration < totalIterations - 1
        ) {
          addProgressLogEntry(
            "Waiting 2 seconds before next iteration...",
            "info"
          );
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      addProgressLogEntry("Sequence replay completed successfully!", "success");
    } catch (error) {
      console.error("Error during replay:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown error during position replay";
      addProgressLogEntry(`Error: ${errorMessage}`, "error");
    } finally {
      setIsReplaying(false);
      setReplayProgress(100);
      setCurrentPosition("");
      setShouldStop(false);
    }
  };

  const stopReplay = () => {
    setShouldStop(true);
    addProgressLogEntry("Stop requested by user", "info");
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) {
      alert("Please enter a group name");
      return;
    }

    try {
      const response = await axios.post("/api/groups", {
        name: newGroupName,
        description: `Group created for position management`,
      });

      if (response.data.success) {
        setNewGroupName("");
        setShowGroupCreation(false);
        alert("Group created successfully!");
      }
    } catch (error) {
      console.error("Error creating group:", error);
      alert("Error creating group");
    }
  };

  const assignToGroup = async (positionId: number, groupId: number | null) => {
    try {
      if (groupId === null) {
        // Remove from current group
        const position = positions.find((p) => p.id === positionId);
        if (position?.groupId) {
          await axios.delete(
            `/api/groups/${position.groupId}/positions/${positionId}`
          );
        }
      } else {
        // Assign to new group
        await axios.post(`/api/groups/${groupId}/positions/${positionId}`);
      }
    } catch (error) {
      console.error("Error updating group assignment:", error);
      alert("Error updating group assignment");
    }
  };

  const deletePosition = async (positionId: number) => {
    if (window.confirm("Are you sure you want to delete this position?")) {
      try {
        await axios.delete(`/api/positions/${positionId}`);
        setSelectedPositions((prev) => prev.filter((id) => id !== positionId));
      } catch (error) {
        console.error("Error deleting position:", error);
        alert("Error deleting position");
      }
    }
  };

  const duplicatePosition = async (position: Position) => {
    try {
      await axios.post("/api/positions", {
        name: `${position.name} (Copy)`,
        axes: position.axes,
        manipulators: position.manipulators,
        delay: position.delay,
        groupId: position.groupId,
      });
      alert("Position duplicated successfully!");
    } catch (error) {
      console.error("Error duplicating position:", error);
      alert("Error duplicating position");
    }
  };

  // Listen for socket events
  useEffect(() => {
    if (!socket) return;

    const handleReplayStatus = (data: any) => {
      if (data.status === "starting") {
        addProgressLogEntry(
          `Hardware replay starting: ${data.position}`,
          "info"
        );
      } else if (data.status === "completed") {
        addProgressLogEntry(
          `Hardware replay completed: ${data.position}`,
          "success"
        );
      }
    };

    socket.on("replayStatus", handleReplayStatus);

    return () => {
      socket.off("replayStatus", handleReplayStatus);
    };
  }, [socket, addProgressLogEntry]);

  // Group positions by group
  const groupedPositions = (groups || []).reduce((acc, group) => {
    if (positions && group) {
      acc[group.id] = positions.filter((p) => p && p.groupId === group.id);
    }
    return acc;
  }, {} as { [groupId: number]: Position[] });

  const ungroupedPositions = (positions || []).filter((p) => p && !p.groupId);

  return (
    <div className="position-replay">
      <div className="replay-header">
        <h3>Position Replay</h3>
        <div className="replay-controls">
          {!isReplaying ? (
            <button
              onClick={replaySequence}
              disabled={selectedPositions.length === 0}
              className="replay-btn"
            >
              ▶️ Replay Selected ({selectedPositions.length})
            </button>
          ) : (
            <button onClick={stopReplay} className="stop-btn">
              ⏹️ Stop Replay
            </button>
          )}
        </div>
      </div>

      {/* Replay Settings */}
      <div className="replay-settings">
        <h4>Replay Settings</h4>
        <div className="settings-grid">
          <div className="setting-item">
            <label>Mode:</label>
            <select
              value={replayMode}
              onChange={(e) => setReplayMode(e.target.value as ReplayMode)}
              disabled={isReplaying}
            >
              <option value="once">Once</option>
              <option value="count">Repeat Count</option>
              <option value="infinite">Infinite</option>
            </select>
          </div>

          {replayMode === "count" && (
            <div className="setting-item">
              <label>Repeat Count:</label>
              <input
                type="number"
                min="1"
                max="100"
                value={repeatCount}
                onChange={(e) => setRepeatCount(parseInt(e.target.value) || 1)}
                disabled={isReplaying}
              />
            </div>
          )}

          <div className="setting-item">
            <label>Global Delay (ms):</label>
            <input
              type="number"
              min="0"
              step="100"
              value={globalDelay}
              onChange={(e) => setGlobalDelay(parseInt(e.target.value) || 0)}
              disabled={isReplaying}
            />
          </div>
        </div>
      </div>

      {/* Progress Display */}
      {isReplaying && (
        <div className="replay-progress">
          <div className="progress-info">
            <span>Progress: {Math.round(replayProgress)}%</span>
            {replayMode !== "once" && (
              <span>
                Iteration: {currentIteration}
                {replayMode === "count" ? ` / ${repeatCount}` : ""}
              </span>
            )}
            {currentPosition && <span>Current: {currentPosition}</span>}
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${replayProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Position Selection */}
      <div className="position-selection">
        <div className="selection-controls">
          <button onClick={selectAllPositions} disabled={isReplaying}>
            {selectedPositions.length === positions.length
              ? "Deselect All"
              : "Select All"}
          </button>

          <button
            onClick={() => setShowGroupCreation(!showGroupCreation)}
            disabled={isReplaying}
            className="create-group-btn"
          >
            + Create Group
          </button>

          <button
            onClick={() => setShowProgressLog(!showProgressLog)}
            className="toggle-log-btn"
          >
            {showProgressLog ? "Hide" : "Show"} Progress Log
          </button>
        </div>

        {/* Group Creation */}
        {showGroupCreation && (
          <div className="group-creation">
            <input
              type="text"
              placeholder="Group name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
            <button onClick={createGroup}>Create</button>
            <button onClick={() => setShowGroupCreation(false)}>Cancel</button>
          </div>
        )}

        {/* Progress Log */}
        {showProgressLog && (
          <div className="progress-log">
            <div className="log-header">
              <h4>Progress Log</h4>
              <button onClick={clearProgressLog} className="clear-log-btn">
                Clear
              </button>
            </div>
            <div className="log-entries">
              {progressLog.map((entry) => (
                <div key={entry.id} className={`log-entry log-${entry.type}`}>
                  <span className="log-timestamp">
                    {entry.timestamp.toLocaleTimeString()}
                  </span>
                  <span className="log-message">{entry.message}</span>
                </div>
              ))}
              {progressLog.length === 0 && (
                <div className="log-entry log-info">
                  <span className="log-message">No log entries yet</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Groups */}
      {groups.length > 0 && (
        <div className="position-groups">
          <h4>Groups</h4>
          {groups.map((group) => (
            <div key={group.id} className="position-group">
              <div className="group-header">
                <h5>{group.name}</h5>
                <button
                  onClick={() => selectGroupPositions(group.id)}
                  disabled={isReplaying}
                  className="select-group-btn"
                >
                  {groupedPositions[group.id]?.every((p) =>
                    selectedPositions.includes(p.id)
                  )
                    ? "Deselect Group"
                    : "Select Group"}
                </button>
              </div>
              <div className="group-positions">
                {groupedPositions[group.id]?.map((position) => (
                  <div key={position.id} className="position-item">
                    <input
                      type="checkbox"
                      checked={selectedPositions.includes(position.id)}
                      onChange={() => selectPosition(position.id)}
                      disabled={isReplaying}
                    />
                    <span className="position-name">{position.name}</span>
                    <span className="position-delay">
                      {position.delay > 0 && `(${position.delay}ms)`}
                    </span>
                    <div className="position-actions">
                      <button
                        onClick={() => duplicatePosition(position)}
                        disabled={isReplaying}
                        title="Duplicate"
                      >
                        📋
                      </button>
                      <button
                        onClick={() => deletePosition(position.id)}
                        disabled={isReplaying}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ungrouped Positions */}
      {ungroupedPositions.length > 0 && (
        <div className="ungrouped-positions">
          <h4>Ungrouped Positions</h4>
          <div className="positions-grid">
            {ungroupedPositions.map((position) => (
              <div key={position.id} className="position-item">
                <div className="position-header">
                  <input
                    type="checkbox"
                    checked={selectedPositions.includes(position.id)}
                    onChange={() => selectPosition(position.id)}
                    disabled={isReplaying}
                  />
                  <div className="position-info">
                    <span className="position-name">{position.name}</span>
                    <span className="position-timestamp">
                      Saved: {new Date(position.timestamp).toLocaleString()}
                      {position.delay > 0 && ` | Delay: ${position.delay}ms`}
                      {position.axes && ` | Axes: ${Object.keys(position.axes).length}`}
                      {position.manipulators && ` | Manipulators: ${Object.keys(position.manipulators).length}`}
                    </span>
                  </div>
                </div>

                <div className="position-values">
                  <div className="axes-display">
                    <strong>Axes:</strong>
                    {position.axes && Object.keys(position.axes).length > 0 ?
                      Object.entries(position.axes).map(([axis, value]) => (
                        <span key={axis} className="axis-value">
                          {axis}: {value}°
                        </span>
                      )) : <span className="no-data">No axes data</span>
                    }
                  </div>
                  <div className="manipulators-display">
                    <strong>Manipulators:</strong>
                    {position.manipulators && Object.keys(position.manipulators).length > 0 ?
                      Object.entries(position.manipulators).map(
                        ([manipulator, value]) => (
                          <span key={manipulator} className="manipulator-value">
                            {manipulator}: {value}%
                          </span>
                        )
                      ) : <span className="no-data">No manipulator data</span>
                    }
                  </div>
                </div>

                <div className="position-actions">
                  <select
                    onChange={(e) => {
                      const groupId = e.target.value
                        ? parseInt(e.target.value)
                        : null;
                      assignToGroup(position.id, groupId);
                    }}
                    disabled={isReplaying}
                    defaultValue=""
                  >
                    <option value="">Assign to Group</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => duplicatePosition(position)}
                    disabled={isReplaying}
                    title="Duplicate"
                  >
                    📋
                  </button>
                  <button
                    onClick={() => deletePosition(position.id)}
                    disabled={isReplaying}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {positions && positions.length === 0 && (
        <div className="empty-state">
          <p>No saved positions found.</p>
          <p>Use the Manual Control tab to save positions first.</p>
        </div>
      )}
    </div>
  );
};

export default PositionReplay;
