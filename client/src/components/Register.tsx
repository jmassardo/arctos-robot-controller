import React, { useState } from 'react';
import axios from 'axios';

interface RegisterProps {
  onRegister: (user: any, token: string) => void;
  onShowLogin: () => void;
}

const Register: React.FC<RegisterProps> = ({ onRegister, onShowLogin }) => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'operator' // Default role
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    message: '',
    color: 'red'
  });

  const calculatePasswordStrength = (password: string) => {
    let score = 0;
    let message = '';
    let color = 'red';

    if (password.length >= 8) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    if (password.length === 0) {
      message = '';
    } else if (score < 2) {
      message = 'Weak';
      color = 'red';
    } else if (score < 4) {
      message = 'Fair';
      color = 'orange';
    } else {
      message = 'Strong';
      color = 'green';
    }

    return { score, message, color };
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError(''); // Clear error when user starts typing
    
    // Update password strength
    if (name === 'password') {
      setPasswordStrength(calculatePasswordStrength(value));
    }
  };

  const validateForm = () => {
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return false;
    }
    
    if (!/[a-zA-Z]/.test(formData.password)) {
      setError('Password must contain at least one letter');
      return false;
    }
    
    if (!/[0-9]/.test(formData.password)) {
      setError('Password must contain at least one number');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsLoading(true);
    setError('');

    try {
      const registrationData = {
        username: formData.username,
        email: formData.email,
        password: formData.password,
        role: formData.role
      };
      
      const response = await axios.post('/api/auth/register', registrationData);
      
      if (response.data.success) {
        const { user, token } = response.data;
        
        // Store token in localStorage
        localStorage.setItem('authToken', token);
        localStorage.setItem('user', JSON.stringify(user));
        
        // Set axios default authorization header
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        
        onRegister(user, token);
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      if (error.response) {
        if (error.response.data.details) {
          // Handle validation errors
          const validationErrors = error.response.data.details;
          setError(validationErrors.map((err: any) => err.msg).join(', '));
        } else {
          setError(error.response.data.message || 'Registration failed');
        }
      } else {
        setError('Network error. Please check your connection.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h2>Create Account</h2>
          <p>Register for Arctos Robot Controller</p>
        </div>
        
        {error && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}
        
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
              placeholder="Choose a username"
              minLength={3}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              autoComplete="email"
              placeholder="Enter your email"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="role">Role</label>
            <select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleChange}
              required
            >
              <option value="operator">Operator</option>
              <option value="viewer">Viewer</option>
              <option value="admin">Administrator</option>
            </select>
            <small className="form-help">
              <strong>Operator:</strong> Can control robot and save positions<br/>
              <strong>Viewer:</strong> Can view data but not control robot<br/>
              <strong>Admin:</strong> Full access to all features and user management
            </small>
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
              autoComplete="new-password"
              placeholder="Enter a strong password"
              minLength={8}
            />
            {formData.password && (
              <div className="password-strength">
                <div 
                  className="strength-bar"
                  style={{
                    width: `${(passwordStrength.score / 5) * 100}%`,
                    backgroundColor: passwordStrength.color
                  }}
                ></div>
                <span 
                  className="strength-text" 
                  style={{ color: passwordStrength.color }}
                >
                  {passwordStrength.message}
                </span>
              </div>
            )}
          </div>
          
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              autoComplete="new-password"
              placeholder="Confirm your password"
            />
          </div>
          
          <button
            type="submit"
            disabled={isLoading || passwordStrength.score < 2}
            className="btn-primary login-btn"
          >
            {isLoading ? (
              <>
                <span className="spinner"></span>
                Creating Account...
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>
        
        <div className="login-footer">
          <p>
            Already have an account?{' '}
            <button onClick={onShowLogin} className="btn-link">
              Sign in here
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;