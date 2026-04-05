/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Legacy colors (keeping for backward compatibility)
        cream: "#f5f5f0",
        "cream-light": "#f8f8f6",
        coral: "#c4917b",
        "coral-dark": "#b5826c",
        "user-bubble": "#e8e8e3",

        // Status colors for tool calls and states
        status: {
          running: {
            DEFAULT: "#f59e0b", // amber-500
            light: "#fef3c7", // amber-100
            dark: "#d97706", // amber-600
          },
          success: {
            DEFAULT: "#10b981", // emerald-500
            light: "#d1fae5", // emerald-100
            dark: "#059669", // emerald-600
          },
          error: {
            DEFAULT: "#ef4444", // red-500
            light: "#fee2e2", // red-100
            dark: "#dc2626", // red-600
          },
        },

        // Theme system colors
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        card: {
          DEFAULT: "var(--color-card)",
          foreground: "var(--color-card-foreground)",
        },
        popover: {
          DEFAULT: "var(--color-popover)",
          foreground: "var(--color-popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--color-primary)",
          foreground: "var(--color-primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--color-secondary)",
          foreground: "var(--color-secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--color-muted)",
          foreground: "var(--color-muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          foreground: "var(--color-accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--color-destructive)",
          foreground: "var(--color-destructive-foreground)",
        },
        border: "var(--color-border)",
        input: {
          DEFAULT: "var(--color-input)",
          background: "var(--color-input-background)",
        },
        ring: "var(--color-ring)",
        chart: {
          1: "var(--color-chart-1)",
          2: "var(--color-chart-2)",
          3: "var(--color-chart-3)",
          4: "var(--color-chart-4)",
          5: "var(--color-chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--color-sidebar)",
          foreground: "var(--color-sidebar-foreground)",
          primary: "var(--color-sidebar-primary)",
          "primary-foreground": "var(--color-sidebar-primary-foreground)",
          accent: "var(--color-sidebar-accent)",
          "accent-foreground": "var(--color-sidebar-accent-foreground)",
          border: "var(--color-sidebar-border)",
          ring: "var(--color-sidebar-ring)",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        serif: ['"EB Garamond"', "Georgia", "serif"],
        mono: ['"SF Mono"', "Monaco", '"Cascadia Code"', '"Roboto Mono"', "monospace"],
      },
      fontWeight: {
        light: "300",
        normal: "400",
        medium: "500",
        semibold: "600",
      },
      letterSpacing: {
        tighter: "-0.05em",
        tight: "-0.025em",
        normal: "0",
        wide: "0.025em",
        wider: "0.05em",
        widest: "0.1em",
      },
      boxShadow: {
        soft: "0 2px 8px rgba(0, 0, 0, 0.04)",
        input: "0 4px 16px rgba(0, 0, 0, 0.06)",
        dropdown: "0 4px 20px rgba(0, 0, 0, 0.15)",
      },
    },
  },
  plugins: [],
};
