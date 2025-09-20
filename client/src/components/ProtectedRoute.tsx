import React from 'react';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: string[];
  resource?: string;
  action?: string;
  fallback?: JSX.Element | null;
}

const ProtectedRoute = ({ 
  children, 
  requiredRoles = [], 
  resource,
  action,
  fallback = null 
}: ProtectedRouteProps): JSX.Element => {
  const { state, hasRole, canAccess } = useAuth();
  
  // Show loading while checking authentication
  if (state.isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Checking authentication...</p>
      </div>
    );
  }
  
  // User not authenticated
  if (!state.isAuthenticated) {
    return fallback ? fallback : (
      <div className="auth-required">
        <h3>Authentication Required</h3>
        <p>Please log in to access this feature.</p>
      </div>
    );
  }
  
  // User not active
  if (!state.user?.isActive) {
    return fallback ? fallback : (
      <div className="account-inactive">
        <h3>Account Inactive</h3>
        <p>Your account has been deactivated. Please contact an administrator.</p>
      </div>
    );
  }
  
  // Check role-based access
  if (requiredRoles.length > 0 && !hasRole(requiredRoles)) {
    return fallback ? fallback : (
      <div className="access-denied">
        <h3>Access Denied</h3>
        <p>You don't have the required permissions to access this feature.</p>
        <p>Required roles: {requiredRoles.join(', ')}</p>
        <p>Your role: {state.user?.role}</p>
      </div>
    );
  }
  
  // Check resource-based access
  if (resource && action && !canAccess(resource, action)) {
    return fallback ? fallback : (
      <div className="access-denied">
        <h3>Access Denied</h3>
        <p>You don't have permission to {action} {resource}.</p>
        <p>Your role: {state.user?.role}</p>
      </div>
    );
  }
  
  // All checks passed, render children
  return <>{children}</>;
};

export default ProtectedRoute;