/**
 * Material Design 3 — extension of `tailwind.config.ts` for the Stickers section.
 *
 * Mantiene intacta la paleta `brand-*` existente y agrega roles semánticos
 * (primary, surface, outline, error, etc.) como CSS custom properties, de modo
 * que el cambio sea aditivo y reversible.
 *
 * Cómo aplicar:
 *  1. Pegar el contenido de `theme.extend` dentro de tu `tailwind.config.ts`.
 *  2. Pegar el bloque "CSS custom properties" dentro de `src/index.css`,
 *     debajo de la directiva `@tailwind base;`.
 *  3. (Opcional) Pegar "M3 utilities" para tener `.text-title-md`, etc.
 *  4. Re-construir: `npm run build` y verificar visualmente.
 */

import type { Config } from 'tailwindcss';

// ───────────────────────────────────────────────────────────────
// 1) tailwind.config.ts — sólo lo que se agrega
// ───────────────────────────────────────────────────────────────
export const tailwindExtend = {
  colors: {
    // Roles semánticos M3 — se resuelven a CSS custom properties
    primary: 'var(--md-sys-color-primary)',
    'on-primary': 'var(--md-sys-color-on-primary)',
    'primary-container': 'var(--md-sys-color-primary-container)',
    'on-primary-container': 'var(--md-sys-color-on-primary-container)',

    secondary: 'var(--md-sys-color-secondary)',
    'on-secondary': 'var(--md-sys-color-on-secondary)',
    'secondary-container': 'var(--md-sys-color-secondary-container)',
    'on-secondary-container': 'var(--md-sys-color-on-secondary-container)',

    tertiary: 'var(--md-sys-color-tertiary)',
    'on-tertiary': 'var(--md-sys-color-on-tertiary)',
    'tertiary-container': 'var(--md-sys-color-tertiary-container)',
    'on-tertiary-container': 'var(--md-sys-color-on-tertiary-container)',

    error: 'var(--md-sys-color-error)',
    'on-error': 'var(--md-sys-color-on-error)',
    'error-container': 'var(--md-sys-color-error-container)',
    'on-error-container': 'var(--md-sys-color-on-error-container)',

    surface: 'var(--md-sys-color-surface)',
    'on-surface': 'var(--md-sys-color-on-surface)',
    'surface-variant': 'var(--md-sys-color-surface-variant)',
    'on-surface-variant': 'var(--md-sys-color-on-surface-variant)',
    'surface-dim': 'var(--md-sys-color-surface-dim)',
    'surface-bright': 'var(--md-sys-color-surface-bright)',
    'surface-container-lowest':
      'var(--md-sys-color-surface-container-lowest)',
    'surface-container-low': 'var(--md-sys-color-surface-container-low)',
    'surface-container': 'var(--md-sys-color-surface-container)',
    'surface-container-high': 'var(--md-sys-color-surface-container-high)',
    'surface-container-highest':
      'var(--md-sys-color-surface-container-highest)',
    'surface-tint': 'var(--md-sys-color-surface-tint)',

    outline: 'var(--md-sys-color-outline)',
    'outline-variant': 'var(--md-sys-color-outline-variant)',

    // Estados de figurita (mapean a roles M3)
    'sticker-owned': 'var(--md-sys-color-tertiary)',
    'sticker-duplicate': 'var(--md-sys-color-tertiary-container)',
    'sticker-missing': 'var(--md-sys-color-on-surface-variant)',
    'sticker-locked': 'var(--md-sys-color-outline-variant)',

    // Rarity badges
    'rarity-common': 'var(--md-sys-color-outline-variant)',
    'rarity-uncommon': 'var(--md-sys-color-tertiary)',
    'rarity-rare': 'var(--md-sys-color-primary)',
    'rarity-epic': 'var(--md-sys-color-secondary)',
    'rarity-legendary': 'var(--md-rarity-legendary)',
    'rarity-special': 'var(--md-sys-color-error)',
  },

  borderRadius: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '28px',
    '2xl': '28px',
    full: '9999px',
  },

  boxShadow: {
    'elev-1': '0 1px 2px 0 rgba(0,0,0,.06), 0 1px 3px 1px rgba(0,0,0,.10)',
    'elev-2': '0 1px 2px 0 rgba(0,0,0,.06), 0 2px 6px 2px rgba(0,0,0,.12)',
    'elev-3': '0 1px 3px 0 rgba(0,0,0,.08), 0 4px 8px 3px rgba(0,0,0,.12)',
    'elev-4': '0 2px 3px 0 rgba(0,0,0,.08), 0 6px 10px 4px rgba(0,0,0,.14)',
    'elev-5': '0 4px 4px 0 rgba(0,0,0,.08), 0 8px 12px 6px rgba(0,0,0,.16)',
  },

  transitionTimingFunction: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    decelerate: 'cubic-bezier(0, 0, 0, 1)',
    accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
  },

  transitionDuration: {
    'motion-short1': '50ms',
    'motion-short2': '150ms',
    'motion-short3': '200ms',
    'motion-short4': '250ms',
    'motion-medium1': '250ms',
    'motion-medium2': '300ms',
    'motion-medium3': '400ms',
    'motion-medium4': '450ms',
    'motion-long1': '450ms',
    'motion-long2': '500ms',
    'motion-long3': '700ms',
    'motion-long4': '1000ms',
  },

  keyframes: {
    shimmer: {
      '0%': { backgroundPosition: '-200% 0' },
      '100%': { backgroundPosition: '200% 0' },
    },
    'fade-in': {
      '0%': { opacity: '0' },
      '100%': { opacity: '1' },
    },
    'slide-up': {
      '0%': { transform: 'translateY(16px)', opacity: '0' },
      '100%': { transform: 'translateY(0)', opacity: '1' },
    },
    'scale-in': {
      '0%': { transform: 'scale(0.96)', opacity: '0' },
      '100%': { transform: 'scale(1)', opacity: '1' },
    },
  },

  animation: {
    shimmer: 'shimmer 3s linear infinite',
    'fade-in': 'fade-in 200ms cubic-bezier(0.2, 0, 0, 1)',
    'slide-up': 'slide-up 300ms cubic-bezier(0.2, 0, 0, 1)',
    'scale-in': 'scale-in 200ms cubic-bezier(0.2, 0, 0, 1)',
  },
};

// ───────────────────────────────────────────────────────────────
// 2) CSS custom properties para src/index.css
// ───────────────────────────────────────────────────────────────
export const cssVariables = `
/* === Material Design 3 — Tokens === */
:root {
  /* Rarity custom (gradiente dorado para "legendary") */
  --md-rarity-legendary: linear-gradient(135deg, #fde68a 0%, #f59e0b 50%, #b45309 100%);

  /* Light theme (default) — derivado de brand-*, emerald-*, amber-* */
  --md-sys-color-primary: #2563eb;                /* brand-600 */
  --md-sys-color-on-primary: #ffffff;
  --md-sys-color-primary-container: #dbeafe;       /* brand-100 */
  --md-sys-color-on-primary-container: #1e3a8a;   /* brand-900 */

  --md-sys-color-secondary: #16a34a;              /* emerald-600 */
  --md-sys-color-on-secondary: #ffffff;
  --md-sys-color-secondary-container: #dcfce7;     /* emerald-100 */
  --md-sys-color-on-secondary-container: #14532d; /* emerald-900 */

  --md-sys-color-tertiary: #b45309;               /* amber-700 */
  --md-sys-color-on-tertiary: #ffffff;
  --md-sys-color-tertiary-container: #fef3c7;     /* amber-100 */
  --md-sys-color-on-tertiary-container: #78350f; /* amber-900 */

  --md-sys-color-error: #dc2626;
  --md-sys-color-on-error: #ffffff;
  --md-sys-color-error-container: #fee2e2;
  --md-sys-color-on-error-container: #7f1d1d;

  --md-sys-color-surface: #ffffff;
  --md-sys-color-on-surface: #0f172a;             /* slate-900 */
  --md-sys-color-surface-variant: #f1f5f9;        /* slate-100 */
  --md-sys-color-on-surface-variant: #475569;     /* slate-600 */
  --md-sys-color-surface-dim: #e2e8f0;            /* slate-200 */
  --md-sys-color-surface-bright: #ffffff;
  --md-sys-color-surface-container-lowest: #ffffff;
  --md-sys-color-surface-container-low: #f8fafc;  /* slate-50 */
  --md-sys-color-surface-container: #f1f5f9;     /* slate-100 */
  --md-sys-color-surface-container-high: #e2e8f0; /* slate-200 */
  --md-sys-color-surface-container-highest: #cbd5e1; /* slate-300 */
  --md-sys-color-surface-tint: #2563eb;

  --md-sys-color-outline: #94a3b8;                /* slate-400 */
  --md-sys-color-outline-variant: #cbd5e1;        /* slate-300 */
}

.dark {
  --md-sys-color-primary: #60a5fa;                /* brand-400 */
  --md-sys-color-on-primary: #0b1220;
  --md-sys-color-primary-container: #1e3a8a;      /* brand-900 */
  --md-sys-color-on-primary-container: #dbeafe;   /* brand-100 */

  --md-sys-color-secondary: #4ade80;              /* emerald-400 */
  --md-sys-color-on-secondary: #052e16;
  --md-sys-color-secondary-container: #14532d;
  --md-sys-color-on-secondary-container: #dcfce7;

  --md-sys-color-tertiary: #fbbf24;               /* amber-400 */
  --md-sys-color-on-tertiary: #451a03;
  --md-sys-color-tertiary-container: #78350f;
  --md-sys-color-on-tertiary-container: #fef3c7;

  --md-sys-color-error: #f87171;
  --md-sys-color-on-error: #450a0a;
  --md-sys-color-error-container: #7f1d1d;
  --md-sys-color-on-error-container: #fee2e2;

  --md-sys-color-surface: #0f172a;                /* slate-900 */
  --md-sys-color-on-surface: #f1f5f9;
  --md-sys-color-surface-variant: #1e293b;        /* slate-800 */
  --md-sys-color-on-surface-variant: #cbd5e1;
  --md-sys-color-surface-dim: #020617;
  --md-sys-color-surface-bright: #334155;
  --md-sys-color-surface-container-lowest: #020617;
  --md-sys-color-surface-container-low: #0f172a;
  --md-sys-color-surface-container: #1e293b;
  --md-sys-color-surface-container-high: #334155;
  --md-sys-color-surface-container-highest: #475569;
  --md-sys-color-surface-tint: #60a5fa;

  --md-sys-color-outline: #64748b;                /* slate-500 */
  --md-sys-color-outline-variant: #334155;        /* slate-700 */
}

/* === Focus visible global (M3) === */
*:focus-visible {
  outline: 2px solid var(--md-sys-color-primary);
  outline-offset: 2px;
  border-radius: inherit;
}

/* === Respeto por prefers-reduced-motion === */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* === StickerCard — state layer === */
.state-layer {
  pointer-events: none;
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: currentColor;
  opacity: 0;
  transition: opacity 200ms cubic-bezier(0.2, 0, 0, 1);
}
.group:hover .state-layer,
.group:focus-visible .state-layer {
  opacity: 0.08;
}
.group:active .state-layer {
  opacity: 0.12;
}
`;

// ───────────────────────────────────────────────────────────────
// 3) Plugin para tipografía M3 (extiende `fontSize`)
// ───────────────────────────────────────────────────────────────
export const typographyPlugin = {
  // tailwind.config.ts → plugins: [...]
  // import typography from './docs/design-tokens.example';
  // Si se prefiere inline, copiar las clases en @layer utilities.
};

// Utilidades tipográficas — pegar dentro de un @layer utilities {} en index.css
export const typographyUtilities = `
@layer utilities {
  .text-display-lg { font-size: 57px; line-height: 64px; font-weight: 400; letter-spacing: -0.25px; }
  .text-display-md { font-size: 45px; line-height: 52px; font-weight: 400; }
  .text-display-sm { font-size: 36px; line-height: 44px; font-weight: 400; }

  .text-headline-lg { font-size: 32px; line-height: 40px; font-weight: 400; }
  .text-headline-md { font-size: 28px; line-height: 36px; font-weight: 400; }
  .text-headline-sm { font-size: 24px; line-height: 32px; font-weight: 400; }

  .text-title-lg   { font-size: 22px; line-height: 28px; font-weight: 500; }
  .text-title-md   { font-size: 16px; line-height: 24px; font-weight: 500; letter-spacing: 0.15px; }
  .text-title-sm   { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: 0.1px; }

  .text-body-lg    { font-size: 16px; line-height: 24px; font-weight: 400; letter-spacing: 0.5px; }
  .text-body-md    { font-size: 14px; line-height: 20px; font-weight: 400; letter-spacing: 0.25px; }
  .text-body-sm    { font-size: 12px; line-height: 16px; font-weight: 400; letter-spacing: 0.4px; }

  .text-label-lg   { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: 0.1px; }
  .text-label-md   { font-size: 12px; line-height: 16px; font-weight: 500; letter-spacing: 0.5px; }
  .text-label-sm   { font-size: 11px; line-height: 16px; font-weight: 500; letter-spacing: 0.5px; }
}
`;

// Default export: el "shape" del config para que se pueda importar desde tests
const _default: Partial<Config> = {
  theme: { extend: tailwindExtend as unknown as Config['theme'] },
};
export default _default;
