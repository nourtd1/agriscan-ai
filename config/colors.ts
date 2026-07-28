/**
 * AgriScan AI — design-system colour tokens.
 *
 * Every component must import colours from here; raw hex strings must not
 * appear anywhere else in the codebase.
 */

export const Colors = {
  /** Deep Emerald Green — primary actions, active states, headers */
  primary: '#1B5E20',
  /** Soft Leaf Green — secondary accents, borders, highlights */
  accent: '#66BB6A',
  /** Warm Amber — warnings, low-confidence badges, caution states */
  warning: '#FFA000',
  /** Off-White — screen backgrounds, card surfaces */
  background: '#F9FAF4',
  /** Soft surface used for cards and modals */
  surface: '#FFFFFF',
  /** Muted text, subtitles, placeholders */
  textSecondary: '#6B7C6B',
  /** Primary body text */
  textPrimary: '#1A2E1A',
  /** Destructive / error red */
  error: '#C62828',
  /** Overlay tint for viewfinder dimming */
  overlay: 'rgba(0,0,0,0.45)',
  /** Guide-box border on the viewfinder */
  guideBorder: 'rgba(102,187,106,0.85)',
} as const;
