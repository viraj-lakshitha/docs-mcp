// Centralized icon set — 24px stroke icons matching the brand style.
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.8",
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const ListIcon = ({ size = 18 }) => (
  <svg {...base} width={size} height={size}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
);

export const EditIcon = ({ size = 18 }) => (
  <svg {...base} width={size} height={size}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);

export const EyeIcon = ({ size = 18 }) => (
  <svg {...base} width={size} height={size}>
    <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
);

export const EyeOffIcon = ({ size = 18 }) => (
  <svg {...base} width={size} height={size}>
    <path d="M2 12s3.5-6.5 10-6.5c2 0 3.7.6 5.1 1.5M22 12s-3.5 6.5-10 6.5c-2 0-3.7-.6-5.1-1.5" />
    <path d="M3 3l18 18" />
  </svg>
);

export const PlusIcon = ({ size = 16 }) => (
  <svg {...base} width={size} height={size}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const XIcon = ({ size = 14 }) => (
  <svg {...base} width={size} height={size}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
