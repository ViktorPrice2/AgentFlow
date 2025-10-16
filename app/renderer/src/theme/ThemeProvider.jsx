import { createContext, useContext, useMemo } from 'react';
import PropTypes from 'prop-types';
import { usePersistentState } from '../hooks/usePersistentState.js';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeState, setThemeState] = usePersistentState('af.theme', 'light');

  const value = useMemo(() => {
    const safeTheme = themeState === 'dark' ? 'dark' : 'light';

    const setTheme = (nextTheme) => {
      setThemeState(nextTheme === 'dark' ? 'dark' : 'light');
    };

    const toggleTheme = () => {
      setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
    };

    return {
      theme: safeTheme,
      setTheme,
      toggleTheme
    };
  }, [themeState, setThemeState]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

ThemeProvider.propTypes = {
  children: PropTypes.node.isRequired
};

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
