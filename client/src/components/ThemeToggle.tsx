import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface ThemeToggleProps {
  className?: string;
  size?: 'small' | 'medium' | 'large';
  variant?: 'icon' | 'button' | 'dropdown';
  showLabel?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = '',
  size = 'medium',
  variant = 'button',
  showLabel = false
}) => {
  const { theme, toggleTheme, isSystemTheme, setSystemTheme } = useTheme();
  
  const sizeClasses = {
    small: 'theme-toggle--small',
    medium: 'theme-toggle--medium',
    large: 'theme-toggle--large'
  };
  
  if (variant === 'dropdown') {
    return (
      <div className={`theme-toggle-dropdown ${sizeClasses[size]} ${className}`}>
        <button
          className="theme-toggle-dropdown__trigger"
          aria-label="Theme options"
          aria-haspopup="true"
          aria-expanded="false"
        >
          <span className="theme-toggle-dropdown__icon">
            {theme === 'dark' ? '🌙' : '☀️'}
          </span>
          {showLabel && (
            <span className="theme-toggle-dropdown__label">
              {theme === 'dark' ? 'Dark' : 'Light'}
            </span>
          )}
          <span className="theme-toggle-dropdown__arrow">▼</span>
        </button>
        
        <div className="theme-toggle-dropdown__menu" role="menu">
          <button
            className={`theme-toggle-dropdown__option ${theme === 'light' && !isSystemTheme ? 'active' : ''}`}
            role="menuitem"
            onClick={() => {
              setSystemTheme(false);
              if (theme !== 'light') toggleTheme();
            }}
          >
            <span className="theme-toggle-dropdown__option-icon">☀️</span>
            <span className="theme-toggle-dropdown__option-label">Light</span>
          </button>
          
          <button
            className={`theme-toggle-dropdown__option ${theme === 'dark' && !isSystemTheme ? 'active' : ''}`}
            role="menuitem"
            onClick={() => {
              setSystemTheme(false);
              if (theme !== 'dark') toggleTheme();
            }}
          >
            <span className="theme-toggle-dropdown__option-icon">🌙</span>
            <span className="theme-toggle-dropdown__option-label">Dark</span>
          </button>
          
          <button
            className={`theme-toggle-dropdown__option ${isSystemTheme ? 'active' : ''}`}
            role="menuitem"
            onClick={() => setSystemTheme(true)}
          >
            <span className="theme-toggle-dropdown__option-icon">🔄</span>
            <span className="theme-toggle-dropdown__option-label">System</span>
          </button>
        </div>
      </div>
    );
  }
  
  if (variant === 'icon') {
    return (
      <button
        className={`theme-toggle theme-toggle--icon ${sizeClasses[size]} ${className}`}
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        title={`Currently ${theme} theme. Click to switch to ${theme === 'light' ? 'dark' : 'light'} theme.`}
      >
        <span className="theme-toggle__icon" aria-hidden="true">
          {theme === 'dark' ? '☀️' : '🌙'}
        </span>
      </button>
    );
  }
  
  // Default button variant
  return (
    <button
      className={`theme-toggle theme-toggle--button ${sizeClasses[size]} ${className}`}
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
      title={`Currently ${theme} theme. Click to switch to ${theme === 'light' ? 'dark' : 'light'} theme.`}
    >
      <span className="theme-toggle__icon" aria-hidden="true">
        {theme === 'dark' ? '☀️' : '🌙'}
      </span>
      
      {showLabel && (
        <span className="theme-toggle__label">
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </span>
      )}
      
      {isSystemTheme && (
        <span className="theme-toggle__indicator" title="Using system theme">
          🔄
        </span>
      )}
    </button>
  );
};

export default ThemeToggle;