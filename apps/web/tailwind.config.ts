import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
          label: "hsl(var(--sidebar-label))",
        },
        titlebar: {
          DEFAULT: "hsl(var(--titlebar-bg))",
          foreground: "hsl(var(--titlebar-fg))",
        },
        activitybar: {
          DEFAULT: "hsl(var(--activitybar-bg))",
          foreground: "hsl(var(--activitybar-fg))",
          active: "hsl(var(--activitybar-active))",
          indicator: "hsl(var(--activitybar-indicator))",
        },
        statusbar: {
          DEFAULT: "hsl(var(--statusbar-bg))",
          foreground: "hsl(var(--statusbar-fg))",
        },
        tab: {
          "active-bg": "hsl(var(--tab-active-bg))",
          "inactive-bg": "hsl(var(--tab-inactive-bg))",
          "active-fg": "hsl(var(--tab-active-fg))",
          "inactive-fg": "hsl(var(--tab-inactive-fg))",
          border: "hsl(var(--tab-border))",
          modified: "hsl(var(--tab-modified))",
        },
        editor: {
          DEFAULT: "hsl(var(--editor-bg))",
          foreground: "hsl(var(--editor-fg))",
          "line-highlight": "hsl(var(--editor-line-highlight))",
        },
        block: {
          hover: "hsl(var(--block-hover))",
          selected: "hsl(var(--block-selected))",
          "selected-border": "hsl(var(--block-selected-border))",
        },
        gutter: {
          foreground: "hsl(var(--gutter-fg))",
        },
        comment: {
          DEFAULT: "hsl(var(--comment-bg))",
          border: "hsl(var(--comment-border))",
          outdated: "hsl(var(--comment-outdated))",
        },
        review: {
          DEFAULT: "hsl(var(--review-bg))",
        },
        breadcrumb: {
          foreground: "hsl(var(--breadcrumb-fg))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
