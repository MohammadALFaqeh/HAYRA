import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: {
          950: "#040720",
          900: "#080d2e",
          850: "#0b1238",
          800: "#101a4a",
          700: "#18245e",
          600: "#233178",
        },
        gold: {
          200: "#ffe9a3",
          300: "#ffdb6e",
          400: "#ffcb3d",
          500: "#f5b41a",
          600: "#d48f07",
        },
        volt: { 400: "#4f93ff", 500: "#2f7bff", 600: "#1c5fe0" },
        violet: { 400: "#a672ff", 500: "#8b45f5", 600: "#6f2ad6" },
        leaf: { 400: "#3bd494", 500: "#1fb978", 600: "#138f5b" },
        wine: { 400: "#d9435c", 500: "#b3263e", 600: "#8a1a2e" },
        ember: { 400: "#ffa24d", 500: "#ff8a1f", 600: "#e06b00" },
      },
      fontFamily: {
        display: ['"Baloo Bhaijaan 2"', '"IBM Plex Sans Arabic"', "system-ui", "sans-serif"],
        sans: ['"IBM Plex Sans Arabic"', "system-ui", "sans-serif"],
        quran: ['"Amiri Quran"', '"Amiri"', "serif"],
      },
      borderRadius: {
        tile: "1.1rem",
        stage: "2rem",
      },
      boxShadow: {
        gold: "0 0 0 1px rgba(255,203,61,.35), 0 10px 40px -10px rgba(255,203,61,.45)",
        volt: "0 0 0 1px rgba(79,147,255,.4), 0 10px 40px -12px rgba(47,123,255,.6)",
        tile: "inset 0 1px 0 rgba(255,255,255,.08), 0 8px 24px -12px rgba(0,0,0,.8)",
      },
      keyframes: {
        "pop-in": {
          "0%": { transform: "scale(.6)", opacity: "0" },
          "60%": { transform: "scale(1.06)", opacity: "1" },
          "100%": { transform: "scale(1)" },
        },
        "pulse-ring": {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(255,203,61,.55)" },
          "50%": { boxShadow: "0 0 0 14px rgba(255,203,61,0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(50%)" },
        },
      },
      animation: {
        "pop-in": "pop-in .45s cubic-bezier(.2,.9,.3,1.3) both",
        "pulse-ring": "pulse-ring 1.6s ease-in-out infinite",
        shimmer: "shimmer 3s linear infinite",
        float: "float 5s ease-in-out infinite",
        marquee: "marquee 40s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
