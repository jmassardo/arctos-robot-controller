import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

const UserProfile: React.FC = () => {
  const { state, logout } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [profileData, setProfileData] = useState({
    username: state.user?.username || '',
    email: state.user?.email || ''
  });
  
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    if (state.user) {
      setProfileData({
        username: state.user.username,
        email: state.user.email
      });
    }
  }, [state.user]);

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfileData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
    setSuccess('');
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
    setSuccess('');
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await axios.put('/api/auth/profile', profileData);
      if (response.data.success) {
        setSuccess('Profile updated successfully');
        setIsEditing(false);
        // Update the auth context with new user data
        // Note: In a real app, you might want to refresh the user data
      }
    } catch (error: any) {
      if (error.response?.data?.details) {
        setError(error.response.data.details.map((err: any) => err.msg).join(', '));
      } else {
        setError(error.response?.data?.message || 'Profile update failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setError('New password must be at least 8 characters long');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await axios.post('/api/auth/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });
      
      if (response.data.success) {
        setSuccess('Password changed successfully');
        setIsChangingPassword(false);
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      }
    } catch (error: any) {
      if (error.response?.data?.details) {
        setError(error.response.data.details.map((err: any) => err.msg).join(', '));
      } else {
        setError(error.response?.data?.message || 'Password change failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return '#e74c3c';
      case 'operator': return '#f39c12';
      case 'viewer': return '#3498db';
      default: return '#95a5a6';
    }
  };

  if (!state.user) {
    return <div>Loading user data...</div>;
  }

  return (
    <div className="user-profile">
      <div className="profile-header">
        <h2>User Profile</h2>
        <div className="user-info">
          <div className="user-avatar">
            {state.user.username.charAt(0).toUpperCase()}
          </div>
          <div className="user-details">
            <h3>{state.user.username}</h3>
            <span 
              className="user-role"
              style={{ backgroundColor: getRoleColor(state.user.role) }}
            >
              {state.user.role.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          {error}
        </div>
      )}

      {success && (
        <div className="success-message">
          <span className="success-icon">✅</span>
          {success}
        </div>
      )}

      <div className="profile-sections">
        {/* Profile Information */}
        <div className="profile-section">
          <div className="section-header">
            <h3>Profile Information</h3>
            {!isEditing && (
              <button 
                onClick={() => setIsEditing(true)}
                className="btn-secondary"
              >
                Edit Profile
              </button>
            )}
          </div>
          
          {isEditing ? (
            <form onSubmit={handleProfileSubmit} className="profile-form">
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={profileData.username}
                  onChange={handleProfileChange}
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={profileData.email}
                  onChange={handleProfileChange}
                  required
                />
              </div>
              
              <div className="form-actions">
                <button 
                  type="submit"
                  disabled={isLoading}
                  className="btn-primary"
                >
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setProfileData({
                      username: state.user?.username || '',
                      email: state.user?.email || ''
                    });
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="profile-info">
              <div className="info-row">
                <label>Username:</label>
                <span>{state.user.username}</span>
              </div>
              <div className="info-row">
                <label>Email:</label>
                <span>{state.user.email}</span>
              </div>
              <div className="info-row">
                <label>Role:</label>
                <span 
                  className="role-badge"
                  style={{ backgroundColor: getRoleColor(state.user.role) }}
                >
                  {state.user.role.toUpperCase()}
                </span>
              </div>
              <div className="info-row">
                <label>Account Status:</label>
                <span className={`status-badge ${state.user.isActive ? 'active' : 'inactive'}`}>
                  {state.user.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="info-row">
                <label>Last Login:</label>
                <span>{formatDate(state.user.lastLogin)}</span>
              </div>
              <div className="info-row">
                <label>Account Created:</label>
                <span>{formatDate(state.user.createdAt)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Password Change */}
        <div className="profile-section">
          <div className="section-header">
            <h3>Change Password</h3>
            {!isChangingPassword && (
              <button 
                onClick={() => setIsChangingPassword(true)}
                className="btn-secondary"
              >
                Change Password
              </button>
            )}
          </div>
          
          {isChangingPassword && (
            <form onSubmit={handlePasswordSubmit} className="profile-form">
              <div className="form-group">
                <label htmlFor="currentPassword">Current Password</label>
                <input
                  type="password"
                  id="currentPassword"
                  name="currentPassword"
                  value={passwordData.currentPassword}
                  onChange={handlePasswordChange}
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="newPassword">New Password</label>
                <input
                  type="password"
                  id="newPassword"
                  name="newPassword"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                  required
                  minLength={8}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm New Password</label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  required
                />
              </div>
              
              <div className="form-actions">
                <button 
                  type="submit"
                  disabled={isLoading}
                  className="btn-primary"
                >
                  {isLoading ? 'Changing...' : 'Change Password'}
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setIsChangingPassword(false);
                    setPasswordData({
                      currentPassword: '',
                      newPassword: '',
                      confirmPassword: ''
                    });
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Account Actions */}
        <div className="profile-section">
          <div className="section-header">
            <h3>Account Actions</h3>
          </div>
          <div className="account-actions">
            <button 
              onClick={logout}
              className="btn-danger"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;