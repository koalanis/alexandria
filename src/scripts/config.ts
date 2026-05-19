// Central config — all user-tunable knobs live here.

// --- Scene ---

export const sceneConfig = {
  backgroundColor: '#f5f0e8',
};

// --- Texture ---

export const textureConfig = {
  colorize: false,
  defaultColor: '#3D2B1F',
  fakeDescriptions: false,
};

export const FAKE_DESCRIPTION =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' +
  'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' +
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. ' +
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.';

// --- Book form factors ---

export type FormFactor = 'massMarket' | 'trade';

export const FORM_FACTORS: Record<FormFactor, {
  widthIn: number;
  heightIn: number;
  pagesPerInch: number;
  label: string;
}> = {
  massMarket: {
    widthIn:      4.19,
    heightIn:     6.75,
    pagesPerInch: 435,
    label:        'Mass Market Paperback',
  },
  trade: {
    widthIn:      6.0,
    heightIn:     9.0,
    pagesPerInch: 250,
    label:        'Trade Paperback',
  },
};

export const bookConfig = {
  formFactor:    'trade' as FormFactor,
  defaultPages:  320,
  minSpineScale: 0.25,
  maxSpineScale: 3.8,
};

// Returns a Y-axis scale factor for the book mesh.
// OBJ Y (spine thickness) maps to world X, so this controls visible shelf width.
export function spineScale(pages: number | undefined): number {
  const ff   = FORM_FACTORS[bookConfig.formFactor];
  const p    = Math.min(1500, Math.max(50, pages ?? bookConfig.defaultPages));
  const base = Math.min(1500, Math.max(50, bookConfig.defaultPages));
  const scale = (p / ff.pagesPerInch) / (base / ff.pagesPerInch);
  return Math.min(bookConfig.maxSpineScale, Math.max(bookConfig.minSpineScale, scale));
}
