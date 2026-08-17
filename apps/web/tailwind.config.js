/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: 'var(--color-text)',
          900: 'var(--color-surface-subtle)',
          800: 'var(--color-surface)',
          700: 'var(--color-surface-subtle)',
        },
        leaf: {
          300: 'var(--color-primary)',
          400: 'var(--color-primary)',
          500: 'var(--color-primary)',
          600: 'var(--color-primary-hover)',
        },
        sun: {
          300: 'var(--color-warning)',
          400: 'var(--color-highlight)',
          500: 'var(--color-highlight)',
        },
        mist: {
          100: 'var(--color-text)',
          200: 'var(--color-text-muted)',
        },
        joy: {
          background: 'var(--color-background)',
          surface: 'var(--color-surface)',
          primary: 'var(--color-primary)',
          highlight: 'var(--color-highlight)',
          coral: 'var(--color-coral)',
          explorer: 'var(--color-explorer-green)',
          navigation: 'var(--color-navigation)',
          success: 'var(--color-success)',
          warning: 'var(--color-warning)',
          error: 'var(--color-error)',
          focus: 'var(--color-focus)',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Nunito"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        studio: 'var(--shadow-studio)',
      },
      backgroundImage: {
        'studio-glow': 'linear-gradient(180deg, var(--color-background) 0%, var(--color-surface-subtle) 100%)',
      },
      minHeight: {
        touch: 'var(--touch-min)',
      },
      minWidth: {
        touch: 'var(--touch-min)',
      },
    },
  },
  plugins: [],
};
