import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['app/ui/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#4f46e5',
        secondary: '#0ea5e9'
      }
    }
  },
  plugins: []
};

export default config;
