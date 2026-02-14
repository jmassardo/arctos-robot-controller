import { createLazyComponent, LoadingFallback } from '../utils/performanceComponents';

// Lazy load all major components for better performance
export const LazyManualControl = createLazyComponent(
  () => import('../components/ManualControl'),
  {
    loadingMessage: 'Loading Manual Control...',
    errorBoundary: true
  }
);

export const LazyGCodeControl = createLazyComponent(
  () => import('../components/GCodeControl'),
  {
    loadingMessage: 'Loading G-Code Control...',
    errorBoundary: true
  }
);

export const LazyPositionReplay = createLazyComponent(
  () => import('../components/PositionReplay'),
  {
    loadingMessage: 'Loading Position Replay...',
    errorBoundary: true
  }
);

export const LazyConfiguration = createLazyComponent(
  () => import('../components/Configuration'),
  {
    loadingMessage: 'Loading Configuration...',
    errorBoundary: true
  }
);

export const LazyAdvancedConfiguration = createLazyComponent(
  () => import('../components/AdvancedConfiguration'),
  {
    loadingMessage: 'Loading Advanced Configuration...',
    errorBoundary: true
  }
);

export const LazyMonitoringDashboard = createLazyComponent(
  () => import('../components/MonitoringDashboard'),
  {
    loadingMessage: 'Loading Monitoring Dashboard...',
    errorBoundary: true
  }
);

export const LazyDocumentation = createLazyComponent(
  () => import('../components/Documentation'),
  {
    loadingMessage: 'Loading Documentation...',
    errorBoundary: true
  }
);

export const LazyUserProfile = createLazyComponent(
  () => import('../components/UserProfile'),
  {
    loadingMessage: 'Loading User Profile...',
    errorBoundary: true
  }
);

export const LazyUserManagement = createLazyComponent(
  () => import('../components/UserManagement'),
  {
    loadingMessage: 'Loading User Management...',
    errorBoundary: true
  }
);

export const LazyAuditTrail = createLazyComponent(
  () => import('../components/AuditTrail'),
  {
    loadingMessage: 'Loading Audit Trail...',
    errorBoundary: true
  }
);

export const LazyRobot3DViewer = createLazyComponent(
  () => import('../components/3D/Robot3DViewer'),
  {
    loadingMessage: 'Loading 3D Visualization...',
    errorBoundary: true
  }
);

// Create a simple loading component for tabs
export const TabLoadingFallback = () => (
  <div className="tab-loading">
    <LoadingFallback message="Loading..." />
  </div>
);