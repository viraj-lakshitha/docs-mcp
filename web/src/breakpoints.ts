// Responsive breakpoints — keep in sync with styles/tokens.css header.
export const BP_SM = 640; // phones
export const BP_MD = 900; // single-pane editor cutoff
export const BP_LG = 1150; // slim-sidebar cutoff

export const isMobile = (): boolean => matchMedia(`(max-width: ${BP_MD}px)`).matches;
