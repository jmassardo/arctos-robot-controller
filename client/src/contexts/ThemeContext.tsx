import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Define theme types
export type Theme = 'light' | 'dark';

// Theme configuration
export const themes = {
  light: {
    name: 'light',
    displayName: 'Light Theme',
    icon: '☀️'
  },
  dark: {
    name: 'dark',
    displayName: 'Dark Theme',
    icon: '🌙'
  }
} as const;

// Context interface
interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isSystemTheme: boolean;
  setSystemTheme: (useSystem: boolean) => void;
}

// Create context with default values
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Theme provider props
interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

// Local storage key for theme persistence
const THEME_STORAGE_KEY = 'arctos-theme';
const SYSTEM_THEME_KEY = 'arctos-use-system-theme';

// Detect system theme preference
const getSystemTheme = (): Theme => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
};

// Get stored theme or use system preference
const getInitialTheme = (): { theme: Theme; useSystem: boolean } => {
  try {
    const storedUseSystem = localStorage.getItem(SYSTEM_THEME_KEY);
    const useSystem = storedUseSystem === 'true';
    
    if (useSystem) {
      return { theme: getSystemTheme(), useSystem: true };
    }
    
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme;
    return { 
      theme: storedTheme && ['light', 'dark'].includes(storedTheme) ? storedTheme : 'light', 
      useSystem: false 
    };
  } catch (error) {
    console.warn('Failed to load theme from localStorage:', error);
    return { theme: 'light', useSystem: false };
  }
};

// Theme provider component
export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultTheme = 'light',
  storageKey = THEME_STORAGE_KEY
}) => {
  const [isSystemTheme, setIsSystemTheme] = useState(false);
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  
  // Initialize theme from storage on mount
  useEffect(() => {
    const { theme: initialTheme, useSystem } = getInitialTheme();
    setThemeState(initialTheme);
    setIsSystemTheme(useSystem);
    
    // Apply theme to document root immediately
    document.documentElement.setAttribute('data-theme', initialTheme);
  }, []);
  
  // Listen for system theme changes
  useEffect(() => {
    if (!isSystemTheme) return;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const newTheme = e.matches ? 'dark' : 'light';
      setThemeState(newTheme);
      document.documentElement.setAttribute('data-theme', newTheme);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [isSystemTheme]);
  
  // Apply theme changes to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    
    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      const color = theme === 'dark' ? '#1a1a1a' : '#ffffff';
      metaThemeColor.setAttribute('content', color);
    }
  }, [theme]);
  
  // Set theme and persist to storage
  const setTheme = (newTheme: Theme) => {
    try {
      setThemeState(newTheme);
      
      if (!isSystemTheme) {
        localStorage.setItem(storageKey, newTheme);
      }
    } catch (error) {
      console.warn('Failed to save theme to localStorage:', error);
    }
  };
  
  // Toggle between light and dark theme
  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };
  
  // Set whether to use system theme
  const setSystemTheme = (useSystem: boolean) => {
    try {
      setIsSystemTheme(useSystem);
      localStorage.setItem(SYSTEM_THEME_KEY, useSystem.toString());
      
      if (useSystem) {
        // Switch to system theme immediately
        const systemTheme = getSystemTheme();
        setThemeState(systemTheme);
        localStorage.removeItem(storageKey); // Remove manual theme preference
      } else {
        // Keep current theme as manual selection
        localStorage.setItem(storageKey, theme);
      }
    } catch (error) {
      console.warn('Failed to save system theme preference:', error);
    }
  };
  
  const value: ThemeContextType = {
    theme,
    setTheme,
    toggleTheme,
    isSystemTheme,
    setSystemTheme
  };
  
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

// Hook to use theme context
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  
  return context;
};

// Export theme utilities
export { getSystemTheme, getInitialTheme };