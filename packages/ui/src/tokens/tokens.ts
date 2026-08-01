// TypeScript mirror of tokens.css for components that need raw values
// (e.g. motion durations for JS-driven transitions). CSS custom properties
// remain the source of truth for styling; keep both in sync by hand since R0-B
// does not add a token build step.
export const colorTokens = {
  ink950: "#030405",
  ink900: "#080A0D",
  surface800: "#0D1015",
  surface700: "#151A22",
  paper50: "#F7F7F5",
  muted400: "rgba(247,247,245,.62)",
  brand500: "#E32025",
  brand400: "#FF3B3F",
  success400: "#6FE3B8",
  warning400: "#FFBA56",
  info400: "#61A8FF",
  danger400: "#FF6C70",
} as const;

export const radiusTokens = {
  input: 10,
  control: 14,
  card: 20,
  hero: 28,
} as const;

export const motionTokens = {
  fastMs: 160,
  baseMs: 220,
  slowMs: 280,
} as const;

export const spacingUnitPx = 4;

export const breakpoints = {
  sm: 640,
  md: 1024,
  lg: 1280,
  xl: 1440,
} as const;
