import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './modules/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#7c3aed',
          600: '#6c38cc',
          700: '#5b21b6',
          800: '#4c1d95',
          900: '#2e1065',
          navy: '#0e214c',
          navyDark: '#09142e',
          navyLight: '#132043',
        },
      },
    },
  },
  plugins: [],
};

export default config;
