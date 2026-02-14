// Animation Controls for 3D path visualization
import React, { useState, useRef, useEffect } from 'react';

interface AnimationControlsProps {
  isAnimating: boolean;
  progress: number; // 0-100
  animationSpeed: number; // 0.1 - 5.0
  onSpeedChange: (speed: number) => void;
  totalSegments: number;
  onPlayPause?: () => void;
  onStop?: () => void;
  onProgressChange?: (progress: number) => void;
  onStepForward?: () => void;
  onStepBackward?: () => void;
}

const AnimationControls: React.FC<AnimationControlsProps> = ({
  isAnimating,
  progress,
  animationSpeed,
  onSpeedChange,
  totalSegments,
  onPlayPause,
  onStop,
  onProgressChange,
  onStepForward,
  onStepBackward
}) => {
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [localProgress, setLocalProgress] = useState(progress);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Update local progress when external progress changes
  useEffect(() => {
    if (!isDraggingProgress) {
      setLocalProgress(progress);
    }
  }, [progress, isDraggingProgress]);

  // Handle progress bar drag
  const handleProgressMouseDown = (event: React.MouseEvent) => {
    setIsDraggingProgress(true);
    updateProgressFromEvent(event);
    
    const handleMouseMove = (e: MouseEvent) => {
      updateProgressFromEvent(e);
    };
    
    const handleMouseUp = () => {
      setIsDraggingProgress(false);
      if (onProgressChange) {
        onProgressChange(localProgress);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const updateProgressFromEvent = (event: MouseEvent | React.MouseEvent) => {
    if (!progressBarRef.current) return;
    
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setLocalProgress(percentage);
  };

  // Handle speed change
  const handleSpeedChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const speed = parseFloat(event.target.value);
    onSpeedChange(speed);
  };

  // Format progress display
  const formatProgress = (prog: number): string => {
    return `${Math.round(prog)}%`;
  };

  // Format speed display
  const formatSpeed = (speed: number): string => {
    return `${speed.toFixed(1)}x`;
  };

  // Calculate estimated time
  const calculateEstimatedTime = (): string => {
    if (totalSegments === 0 || animationSpeed === 0) return '0s';
    
    const remainingProgress = 100 - progress;
    const remainingTime = (remainingProgress / 100) * (totalSegments / animationSpeed);
    
    if (remainingTime < 60) {
      return `${Math.round(remainingTime)}s`;
    } else {
      const minutes = Math.floor(remainingTime / 60);
      const seconds = Math.round(remainingTime % 60);
      return `${minutes}m ${seconds}s`;
    }
  };

  return (
    <div className="animation-controls">
      <div className="control-section">
        <h4>Animation</h4>
        
        {/* Progress Bar */}
        <div className="progress-container">
          <div className="progress-info">
            <span className="progress-label">Progress</span>
            <span className="progress-value">{formatProgress(localProgress)}</span>
          </div>
          
          <div
            ref={progressBarRef}
            className="progress-bar-container"
            onMouseDown={handleProgressMouseDown}
          >
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${localProgress}%` }}
              />
              <div 
                className="progress-handle"
                style={{ left: `${localProgress}%` }}
              />
            </div>
          </div>
          
          <div className="progress-labels">
            <span>0%</span>
            <span className="progress-segments">
              {totalSegments} segments
            </span>
            <span>100%</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="playback-controls">
          <button
            className="control-btn step-btn"
            onClick={onStepBackward}
            disabled={progress <= 0}
            title="Step Backward"
          >
            ⏮
          </button>
          
          <button
            className={`control-btn play-btn ${isAnimating ? 'playing' : 'paused'}`}
            onClick={onPlayPause}
            title={isAnimating ? 'Pause' : 'Play'}
          >
            {isAnimating ? '⏸' : '▶️'}
          </button>
          
          <button
            className="control-btn stop-btn"
            onClick={onStop}
            disabled={progress === 0 && !isAnimating}
            title="Stop"
          >
            ⏹
          </button>
          
          <button
            className="control-btn step-btn"
            onClick={onStepForward}
            disabled={progress >= 100}
            title="Step Forward"
          >
            ⏭
          </button>
        </div>

        {/* Speed Control */}
        <div className="speed-control">
          <div className="speed-info">
            <span className="speed-label">Speed</span>
            <span className="speed-value">{formatSpeed(animationSpeed)}</span>
          </div>
          
          <div className="speed-slider-container">
            <input
              type="range"
              min="0.1"
              max="5.0"
              step="0.1"
              value={animationSpeed}
              onChange={handleSpeedChange}
              className="speed-slider"
            />
            <div className="speed-marks">
              <span>0.1x</span>
              <span>1x</span>
              <span>2x</span>
              <span>5x</span>
            </div>
          </div>
        </div>

        {/* Animation Info */}
        <div className="animation-info">
          <div className="info-item">
            <span className="info-label">Status:</span>
            <span className={`info-value status ${isAnimating ? 'playing' : 'paused'}`}>
              {isAnimating ? 'Playing' : 'Paused'}
            </span>
          </div>
          
          <div className="info-item">
            <span className="info-label">Remaining:</span>
            <span className="info-value">{calculateEstimatedTime()}</span>
          </div>
          
          <div className="info-item">
            <span className="info-label">Segments:</span>
            <span className="info-value">{totalSegments}</span>
          </div>
        </div>

        {/* Preset Speed Buttons */}
        <div className="speed-presets">
          <span className="presets-label">Quick Speed:</span>
          <div className="preset-buttons">
            {[0.25, 0.5, 1.0, 2.0, 4.0].map(speed => (
              <button
                key={speed}
                className={`preset-btn ${Math.abs(animationSpeed - speed) < 0.05 ? 'active' : ''}`}
                onClick={() => onSpeedChange(speed)}
              >
                {formatSpeed(speed)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Keyboard shortcuts info */}
      <div className="keyboard-shortcuts">
        <details>
          <summary>Keyboard Shortcuts</summary>
          <div className="shortcuts-list">
            <div className="shortcut-item">
              <kbd>Space</kbd> <span>Play/Pause</span>
            </div>
            <div className="shortcut-item">
              <kbd>←</kbd> <span>Step Backward</span>
            </div>
            <div className="shortcut-item">
              <kbd>→</kbd> <span>Step Forward</span>
            </div>
            <div className="shortcut-item">
              <kbd>Home</kbd> <span>Go to Start</span>
            </div>
            <div className="shortcut-item">
              <kbd>End</kbd> <span>Go to End</span>
            </div>
            <div className="shortcut-item">
              <kbd>+/-</kbd> <span>Speed Up/Down</span>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
};

export default AnimationControls;