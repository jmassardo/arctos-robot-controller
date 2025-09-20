import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from './ProtectedRoute';
import axios from 'axios';

interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
  isActive: boolean;
  lastLogin: string;
  createdAt: string;
  failedLoginAttempts: number;
  isLocked: boolean;
}

const UserManagement: React.FC = () => {
  const { state } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    password: '',
    role: 'operator' as const
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get('/api/users');
      if (response.data.success) {
        setUsers(response.data.users);
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const response = await axios.post('/api/auth/register', newUser);
      if (response.data.success) {
        setSuccess('User created successfully');
        setShowCreateForm(false);
        setNewUser({
          username: '',
          email: '',
          password: '',
          role: 'operator'
        });
        loadUsers();
      }
    } catch (error: any) {
      if (error.response?.data?.details) {
        setError(error.response.data.details.map((err: any) => err.msg).join(', '));
      } else {
        setError(error.response?.data?.message || 'Failed to create user');
      }
    }
  };

  const handleUpdateUser = async (userId: string, updates: Partial<User>) => {
    try {
      setError('');
      setSuccess('');
      
      const response = await axios.put(`/api/users/${userId}`, updates);
      if (response.data.success) {
        setSuccess('User updated successfully');
        setEditingUser(null);
        loadUsers();
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to update user');
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!window.confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setError('');
      setSuccess('');
      
      const response = await axios.delete(`/api/users/${userId}`);
      if (response.data.success) {
        setSuccess('User deleted successfully');
        loadUsers();
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleToggleUserStatus = async (user: User) => {
    await handleUpdateUser(user.id, { isActive: !user.isActive });
  };

  const handleUnlockUser = async (user: User) => {
    await handleUpdateUser(user.id, { isLocked: false, failedLoginAttempts: 0 });
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

  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <div className="user-management">
        <div className="page-header">
          <h2>User Management</h2>
          <button 
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="btn-primary"
          >
            {showCreateForm ? 'Cancel' : 'Create User'}
          </button>
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

        {/* Create User Form */}
        {showCreateForm && (
          <div className="create-user-form">
            <h3>Create New User</h3>
            <form onSubmit={handleCreateUser}>
              <div className="form-row">
                <div className="form-group">
                  <label>Username</label>
                  <input
                    type="text"
                    value={newUser.username}
                    onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                    required
                    minLength={3}
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                    required
                    minLength={8}
                  />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({...newUser, role: e.target.value as any})}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="operator">Operator</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary">Create User</button>
                <button 
                  type="button" 
                  onClick={() => setShowCreateForm(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Users Table */}
        {isLoading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading users...</p>
          </div>
        ) : (
          <div className="users-table-container">
            <table className="users-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Failed Logins</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-info">
                        <div className="user-avatar">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="username">{user.username}</div>
                          <div className="email">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {editingUser?.id === user.id ? (
                        <select
                          value={editingUser.role}
                          onChange={(e) => setEditingUser({
                            ...editingUser,
                            role: e.target.value as any
                          })}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="operator">Operator</option>
                          <option value="admin">Administrator</option>
                        </select>
                      ) : (
                        <span 
                          className="role-badge"
                          style={{ backgroundColor: getRoleColor(user.role) }}
                        >
                          {user.role.toUpperCase()}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="status-indicators">
                        <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                        {user.isLocked && (
                          <span className="status-badge locked">Locked</span>
                        )}
                      </div>
                    </td>
                    <td>{user.lastLogin ? formatDate(user.lastLogin) : 'Never'}</td>
                    <td>
                      <span className={user.failedLoginAttempts > 3 ? 'text-warning' : ''}>
                        {user.failedLoginAttempts}
                      </span>
                    </td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>
                      <div className="action-buttons">
                        {editingUser?.id === user.id ? (
                          <>
                            <button
                              onClick={() => handleUpdateUser(user.id, {
                                role: editingUser.role
                              })}
                              className="btn-sm btn-primary"
                              title="Save changes"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingUser(null)}
                              className="btn-sm btn-secondary"
                              title="Cancel edit"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditingUser(user)}
                              className="btn-sm btn-secondary"
                              title="Edit user"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleToggleUserStatus(user)}
                              className={`btn-sm ${user.isActive ? 'btn-warning' : 'btn-success'}`}
                              title={user.isActive ? 'Deactivate user' : 'Activate user'}
                            >
                              {user.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            {user.isLocked && (
                              <button
                                onClick={() => handleUnlockUser(user)}
                                className="btn-sm btn-info"
                                title="Unlock user account"
                              >
                                Unlock
                              </button>
                            )}
                            {user.id !== state.user?.id && (
                              <button
                                onClick={() => handleDeleteUser(user.id, user.username)}
                                className="btn-sm btn-danger"
                                title="Delete user"
                              >
                                Delete
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {users.length === 0 && (
              <div className="empty-state">
                <p>No users found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
};

export default UserManagement;