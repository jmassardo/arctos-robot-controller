import React, { createContext, useContext, useReducer, useEffect } from 'react';
import axios from 'axios';

interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
  isActive: boolean;
  lastLogin: string;
  createdAt: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthAction {
  type: 'AUTH_START' | 'AUTH_SUCCESS' | 'AUTH_ERROR' | 'AUTH_LOGOUT' | 'CLEAR_ERROR';
  payload?: any;
}

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  error: null
};

const AuthContext = createContext<{
  state: AuthState;
  login: (user: User, token: string) => void;
  logout: () => void;
  refreshToken: () => Promise<boolean>;
  clearError: () => void;
  hasRole: (roles: string[]) => boolean;
  canAccess: (resource: string, action: string) => boolean;
}>({
  state: initialState,
  login: () => {},
  logout: () => {},
  refreshToken: async () => false,
  clearError: () => {},
  hasRole: () => false,
  canAccess: () => false
});

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true,
        error: null
      };
    case 'AUTH_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
        error: null
      };
    case 'AUTH_ERROR':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload
      };
    case 'AUTH_LOGOUT':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null
      };
    default:
      return state;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check for existing token on app start
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('authToken');
      const userStr = localStorage.getItem('user');
      
      if (token && userStr) {
        try {
          const user = JSON.parse(userStr);
          
          // Set axios default header
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          
          // Verify token is still valid
          const response = await axios.get('/api/auth/profile');
          if (response.data.success) {
            dispatch({
              type: 'AUTH_SUCCESS',
              payload: { user: response.data.user, token }
            });
          } else {
            // Token invalid, clear storage
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            dispatch({ type: 'AUTH_LOGOUT' });
          }
        } catch (error) {
          console.error('Token validation failed:', error);
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          delete axios.defaults.headers.common['Authorization'];
          dispatch({ type: 'AUTH_LOGOUT' });
        }
      } else {
        dispatch({ type: 'AUTH_LOGOUT' });
      }
    };

    initAuth();
  }, []);

  // Setup axios interceptor for token refresh
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          const refreshSuccess = await refreshToken();
          if (refreshSuccess) {
            // Retry the original request with new token
            return axios(originalRequest);
          } else {
            // Refresh failed, logout user
            logout();
          }
        }
        
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [state.token]);

  const login = (user: User, token: string) => {
    localStorage.setItem('authToken', token);
    localStorage.setItem('user', JSON.stringify(user));
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    
    dispatch({
      type: 'AUTH_SUCCESS',
      payload: { user, token }
    });
  };

  const logout = async () => {
    try {
      // Call logout endpoint to invalidate token on server
      if (state.token) {
        await axios.post('/api/auth/logout');
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local storage and state regardless of API call result
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      delete axios.defaults.headers.common['Authorization'];
      dispatch({ type: 'AUTH_LOGOUT' });
    }
  };

  const refreshToken = async (): Promise<boolean> => {
    try {
      const response = await axios.post('/api/auth/refresh');
      if (response.data.success) {
        const { token, user } = response.data;
        login(user, token);
        return true;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
    }
    return false;
  };

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const hasRole = (roles: string[]): boolean => {
    return state.user ? roles.includes(state.user.role) : false;
  };

  const canAccess = (resource: string, action: string): boolean => {
    if (!state.user || !state.user.isActive) return false;
    
    const { role } = state.user;
    
    // Admin can do everything
    if (role === 'admin') return true;
    
    // Define role-based permissions
    const permissions = {
      operator: {
        robot: ['read', 'control', 'execute'],
        positions: ['read', 'create', 'update', 'delete'],
        config: ['read', 'update'],
        gcode: ['read', 'execute'],
        groups: ['read', 'create', 'update', 'delete']
      },
      viewer: {
        robot: ['read'],
        positions: ['read'],
        config: ['read'],
        gcode: ['read'],
        groups: ['read']
      }
    };
    
    const rolePerms = permissions[role as keyof typeof permissions];
    if (!rolePerms) return false;
    
    const resourcePerms = rolePerms[resource as keyof typeof rolePerms];
    if (!resourcePerms) return false;
    
    return resourcePerms.includes(action);
  };

  const value = {
    state,
    login,
    logout,
    refreshToken,
    clearError,
    hasRole,
    canAccess
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;