import React, { useState, useEffect } from 'react';
import { useDeviceInfo } from '../utils/mobileUtils';

interface MobileNavigationProps {
  tabs: Array<{
    key: string;
    label: string;
    icon?: string;
    disabled?: boolean;
  }>;
  activeTab: string;
  onTabChange: (tabKey: string) => void;
  connectionStatus: 'connected' | 'disconnected';
}

export const MobileNavigation: React.FC<MobileNavigationProps> = ({
  tabs,
  activeTab,
  onTabChange,
  connectionStatus
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showFullLabels, setShowFullLabels] = useState(false);
  const deviceInfo = useDeviceInfo();

  useEffect(() => {
    // Show full labels on tablets in landscape mode
    setShowFullLabels(
      deviceInfo.isTablet || 
      (deviceInfo.isDesktop) || 
      (deviceInfo.orientation === 'landscape' && deviceInfo.screenWidth > 600)
    );
  }, [deviceInfo]);

  const handleTabClick = (tabKey: string) => {
    onTabChange(tabKey);
    setIsMenuOpen(false); // Close menu after selection on mobile
  };

  // Mobile hamburger menu for very small screens
  if (deviceInfo.isMobile && deviceInfo.screenWidth < 400) {
    return (
      <div className="mobile-navigation mobile-hamburger">
        <div className="nav-header">
          <div className={`connection-indicator ${connectionStatus}`}>
            <div className="status-dot" />
            <span>{connectionStatus}</span>
          </div>
          <button
            className={`hamburger-button ${isMenuOpen ? 'open' : ''}`}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
        
        {isMenuOpen && (
          <div className="hamburger-menu">
            <div className="menu-overlay" onClick={() => setIsMenuOpen(false)} />
            <div className="menu-content">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`menu-item ${activeTab === tab.key ? 'active' : ''} ${tab.disabled ? 'disabled' : ''}`}
                  onClick={() => handleTabClick(tab.key)}
                  disabled={tab.disabled}
                >
                  {tab.icon && <span className="tab-icon">{tab.icon}</span>}
                  <span className="tab-label">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Bottom navigation for mobile phones
  if (deviceInfo.isMobile) {
    return (
      <div className="mobile-navigation mobile-bottom-nav">
        <div className="nav-header">
          <div className={`connection-indicator ${connectionStatus}`}>
            <div className="status-dot" />
            <span>{connectionStatus}</span>
          </div>
        </div>
        
        <div className="bottom-nav-tabs">
          {tabs.slice(0, 5).map((tab) => ( // Limit to 5 tabs for bottom nav
            <button
              key={tab.key}
              className={`bottom-nav-tab ${activeTab === tab.key ? 'active' : ''} ${tab.disabled ? 'disabled' : ''}`}
              onClick={() => handleTabClick(tab.key)}
              disabled={tab.disabled}
            >
              {tab.icon && <span className="tab-icon">{tab.icon}</span>}
              <span className="tab-label">{showFullLabels ? tab.label : tab.label.substring(0, 3)}</span>
            </button>
          ))}
          
          {/* More button if there are additional tabs */}
          {tabs.length > 5 && (
            <button
              className="bottom-nav-tab more-button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <span className="tab-icon">⋯</span>
              <span className="tab-label">More</span>
            </button>
          )}
        </div>
        
        {/* More menu for additional tabs */}
        {isMenuOpen && tabs.length > 5 && (
          <div className="more-menu">
            <div className="menu-overlay" onClick={() => setIsMenuOpen(false)} />
            <div className="menu-content">
              {tabs.slice(5).map((tab) => (
                <button
                  key={tab.key}
                  className={`menu-item ${activeTab === tab.key ? 'active' : ''} ${tab.disabled ? 'disabled' : ''}`}
                  onClick={() => handleTabClick(tab.key)}
                  disabled={tab.disabled}
                >
                  {tab.icon && <span className="tab-icon">{tab.icon}</span>}
                  <span className="tab-label">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Tablet horizontal navigation
  return (
    <div className="mobile-navigation tablet-nav">
      <div className="nav-header">
        <div className={`connection-indicator ${connectionStatus}`}>
          <div className="status-dot" />
          <span>{connectionStatus}</span>
        </div>
      </div>
      
      <div className="tablet-nav-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`tablet-nav-tab ${activeTab === tab.key ? 'active' : ''} ${tab.disabled ? 'disabled' : ''}`}
            onClick={() => handleTabClick(tab.key)}
            disabled={tab.disabled}
          >
            {tab.icon && <span className="tab-icon">{tab.icon}</span>}
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

interface MobileLayoutProps {
  navigation: React.ReactNode;
  content: React.ReactNode;
  footer?: React.ReactNode;
}

export const MobileLayout: React.FC<MobileLayoutProps> = ({
  navigation,
  content,
  footer
}) => {
  const deviceInfo = useDeviceInfo();
  
  return (
    <div className={`mobile-layout ${deviceInfo.orientation} ${deviceInfo.isMobile ? 'mobile' : deviceInfo.isTablet ? 'tablet' : 'desktop'}`}>
      <div className="mobile-navigation-container">
        {navigation}
      </div>
      
      <main className="mobile-content">
        {content}
      </main>
      
      {footer && (
        <footer className="mobile-footer">
          {footer}
        </footer>
      )}
    </div>
  );
};

interface FloatingActionButtonProps {
  icon: string;
  label?: string;
  onClick: () => void;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  icon,
  label,
  onClick,
  position = 'bottom-right',
  variant = 'primary',
  size = 'medium',
  disabled = false
}) => {
  return (
    <button
      className={`floating-action-button ${position} ${variant} ${size} ${disabled ? 'disabled' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label || 'Action button'}
    >
      <span className="fab-icon">{icon}</span>
      {label && <span className="fab-label">{label}</span>}
    </button>
  );
};

interface QuickActionsProps {
  actions: Array<{
    key: string;
    icon: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    color?: string;
  }>;
  position?: 'top' | 'bottom';
  collapsed?: boolean;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  actions,
  position = 'bottom',
  collapsed = false
}) => {
  const [isExpanded, setIsExpanded] = useState(!collapsed);
  const deviceInfo = useDeviceInfo();

  // Auto-collapse on mobile portrait
  useEffect(() => {
    if (deviceInfo.isMobile && deviceInfo.orientation === 'portrait') {
      setIsExpanded(false);
    }
  }, [deviceInfo.isMobile, deviceInfo.orientation]);

  return (
    <div className={`quick-actions ${position} ${isExpanded ? 'expanded' : 'collapsed'}`}>
      {collapsed && (
        <button
          className="quick-actions-toggle"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span>{isExpanded ? '×' : '+'}</span>
        </button>
      )}
      
      <div className="quick-actions-list">
        {actions.map((action) => (
          <button
            key={action.key}
            className={`quick-action ${action.disabled ? 'disabled' : ''}`}
            onClick={action.onClick}
            disabled={action.disabled}
            style={action.color ? { backgroundColor: action.color } : undefined}
            title={action.label}
          >
            <span className="action-icon">{action.icon}</span>
            {(isExpanded || !deviceInfo.isMobile) && (
              <span className="action-label">{action.label}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

interface MobileModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large' | 'fullscreen';
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
}

export const MobileModal: React.FC<MobileModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
  closeOnBackdrop = true,
  showCloseButton = true
}) => {
  const deviceInfo = useDeviceInfo();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Prevent scrolling behind modal on iOS
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Use fullscreen on mobile portrait
  const modalSize = deviceInfo.isMobile && deviceInfo.orientation === 'portrait' ? 'fullscreen' : size;

  return (
    <div className="mobile-modal-overlay">
      {closeOnBackdrop && (
        <div className="modal-backdrop" onClick={onClose} />
      )}
      
      <div className={`mobile-modal ${modalSize}`}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          {showCloseButton && (
            <button className="modal-close" onClick={onClose}>
              ×
            </button>
          )}
        </div>
        
        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  );
};