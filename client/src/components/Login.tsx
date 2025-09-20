import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface LoginProps {
  onLogin: (user: any, token: string) => void;
  onShowRegister: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, onShowRegister }) => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  
  // Auto-login for development with default admin user
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      setFormData({
        username: 'admin',
        password: 'admin123'
      });
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError(''); // Clear error when user starts typing
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/auth/login', formData);
      
      if (response.data.success) {
        const { user, token } = response.data;
        
        // Store token in localStorage
        localStorage.setItem('authToken', token);
        localStorage.setItem('user', JSON.stringify(user));
        
        // Set axios default authorization header
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        
        onLogin(user, token);
      }
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.response) {
        setError(error.response.data.message || 'Login failed');
        
        // Handle account lockout
        if (error.response.status === 423) {
          setError('Account locked due to too many failed attempts. Please try again later.');
        }
      } else {
        setError('Network error. Please check your connection.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setShowForgotPassword(true);
  };

  const handleQuickLogin = () => {
    setFormData({
      username: 'admin',
      password: 'admin123'
    });
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h2>Arctos Robot Controller</h2>
          <p>Please sign in to continue</p>
        </div>
        
        {error && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}
        
        {showForgotPassword ? (
          <div className="forgot-password-info">
            <h3>Password Reset</h3>
            <p>Please contact your system administrator to reset your password.</p>
            <p>Default admin credentials: <strong>admin</strong> / <strong>admin123</strong></p>
            <button 
              type="button"
              onClick={() => setShowForgotPassword(false)}
              className="btn-secondary"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                autoComplete="username"
                placeholder="Enter your username"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </div>
            
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary login-btn"
            >
              {isLoading ? (
                <>
                  <span className="spinner"></span>
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </button>
            
            <div className="login-options">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="btn-link"
              >
                Forgot Password?
              </button>
              
              {process.env.NODE_ENV === 'development' && (
                <button
                  type="button"
                  onClick={handleQuickLogin}
                  className="btn-link quick-login"
                  title="Auto-fill admin credentials for development"
                >
                  Quick Login (Admin)
                </button>
              )}
            </div>
          </form>
        )}
        
        <div className="login-footer">
          <p>
            Don't have an account?{' '}
            <button onClick={onShowRegister} className="btn-link">
              Register here
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;