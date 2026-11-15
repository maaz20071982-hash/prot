/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        industrial: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          850: '#1c1c20',
          900: '#121215',
          950: '#09090b',
        },
        safety: {
          normal: '#059669',    // emerald-600
          elevated: '#d97706',  // amber-600
          high: '#ea580c',      // orange-600
          emergency: '#dc2626', // red-600
        },
        risk: {
          normal: '#10b981',
          elevated: '#f59e0b',
          high: '#f97316',
          emergency: '#ef4444',
        }
      },
      animation: {
        'pulse-subtle': 'pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 1.8s infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        }
      }
    },
  },
  plugins: [],
}


