import { dark, type Tokens } from './tokens';

// The colours come from the web app (tokens.ts is written by `npm run sync:shared`). The dark look is the app's own, as on the web; Sunlight mode joins it with
// the device settings under More.
export function useTheme(): Tokens { return dark; }
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { md: 12, lg: 16, xl: 22 } as const;
// The smallest thing a thumb is asked to hit, as in the web Field view.
export const TOUCH = 44;
