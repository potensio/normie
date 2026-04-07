/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Design System - Purple Scale
        purple: {
          400: "#C084FC",
          500: "#A855F7",
          600: "#9333EA",
        },

        // Design System - Core Colors
        "primary-dark": "#111111",
        "bg-base": "#FAFAFA",
        "text-primary": "#101828",
        "text-secondary": "#4A5565",
        "text-tertiary": "#6A7282",
        surface: {
          DEFAULT: "#FFFFFF",
          secondary: "#F9FAFB",
        },

        // Legacy colors (keeping for backward compatibility)
        cream: "#f5f5f0",
        "cream-light": "#f8f8f6",
        coral: "#c4917b",
        "coral-dark": "#b5826c",
        "user-bubble": "#e8e8e3",

        // Neon colors
        neon: {
          pink: "#ff2a6d",
          "pink-glow": "#ff2a6d",
        },

        // Status colors for tool calls and states
        status: {
          running: {
            DEFAULT: "#f59e0b",
            light: "#fef3c7",
            dark: "#d97706",
          },
          success: {
            DEFAULT: "#10b981",
            light: "#d1fae5",
            dark: "#059669",
          },
          error: {
            DEFAULT: "#ef4444",
            light: "#fee2e2",
            dark: "#dc2626",
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
        lg: "1.3125rem", // 21px - Design system card radius
        xl: "var(--radius-xl)",
        full: "9999px",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        accent: ["Playfair Display", "Georgia", "serif"],
        serif: ['"EB Garamond"', "Georgia", "serif"],
        mono: [
          '"SF Mono"',
          "Monaco",
          '"Cascadia Code"',
          '"Roboto Mono"',
          "monospace",
        ],
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem" }], // 12px
        sm: ["0.875rem", { lineHeight: "1.25rem" }], // 14px
        base: ["1rem", { lineHeight: "1.5rem" }], // 16px
        lg: ["1.125rem", { lineHeight: "1.75rem" }], // 18px
        xl: ["1.25rem", { lineHeight: "1.75rem" }], // 20px
        "2xl": ["1.5rem", { lineHeight: "2rem" }], // 24px
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }], // 30px
        "4xl": ["2.25rem", { lineHeight: "2.5rem" }], // 36px
      },
      spacing: {
        0: "0",
        px: "1px",
        0.5: "0.125rem", // 2px
        1: "0.25rem", // 4px
        1.5: "0.375rem", // 6px
        2: "0.5rem", // 8px
        2.5: "0.625rem", // 10px
        3: "0.75rem", // 12px
        3.5: "0.875rem", // 14px
        4: "1rem", // 16px
        5: "1.25rem", // 20px
        6: "1.5rem", // 24px
        7: "1.75rem", // 28px
        8: "2rem", // 32px
        9: "2.25rem", // 36px
        10: "2.5rem", // 40px
        11: "2.75rem", // 44px
        12: "3rem", // 48px
        14: "3.5rem", // 56px
        16: "4rem", // 64px
        20: "5rem", // 80px
        24: "6rem", // 96px
        28: "7rem", // 112px
        32: "8rem", // 128px
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
        subtle: "0px 2px 10px 0px rgba(0, 0, 0, 0.02)",
        sm: "0px 1px 2px -1px rgba(0, 0, 0, 0.1), 0px 1px 3px 0px rgba(0, 0, 0, 0.1)",
        md: "0px 8px 30px 0px rgba(0, 0, 0, 0.06)",
        purple: "0px 8px 25px 0px rgba(168, 85, 247, 0.35)",
        glass:
          "0px 4px 6px -4px rgba(0, 0, 0, 0.1), 0px 10px 15px -3px rgba(0, 0, 0, 0.1)",
        soft: "0 2px 8px rgba(0, 0, 0, 0.04)",
        input: "0 4px 16px rgba(0, 0, 0, 0.06)",
        dropdown: "0 4px 20px rgba(0, 0, 0, 0.15)",
      },
      backdropBlur: {
        sm: "80px",
        lg: "128px",
      },
    },
  },
  plugins: [],
};
