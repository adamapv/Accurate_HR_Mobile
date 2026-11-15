// The colours the app is drawn in, and how the person likes it to look. The dark look is the app's own; Sunlight mode is the light, high-contrast one for a phone in bright
// sun, and it belongs to this phone (so it can be flipped in the sun and back in the ute): it is kept in the secure store, which is where the app keeps what is not
// tied to a person's session, and is not forgotten at sign-out. Reading & focus belong to the person (saved with them, read from `me.employee.reading_prefs`); the app
// applies Softer colours (here), Calmer screen (the building blocks stand still) and One thing at a time (Home). The colours themselves come from the web app (tokens.ts is
// written by `npm run sync:shared`).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { parseReading } from '@shared/reading.js';
import { useSession } from '@/lib/session';
import { dark, light, type Tokens } from './tokens';

export const THEME_KEY = 'hrhead_theme';   // 'light', or nothing for dark
export type Mode = 'dark' | 'light';
export type Reading = { font: string; size: string; space: string; focus: boolean; soft: boolean; calm: boolean; ruler: boolean };
type Display = { t: Tokens; mode: Mode; setMode: (m: Mode) => void; reading: Reading; calm: boolean; focus: boolean };

// Softer colours: less glare. Softer white text on the dark look, and cream in place of white in Sunlight mode (the web's own words for it).
const softDark: Partial<Tokens> = { fg: '#DCDFEA' };
const softLight: Partial<Tokens> = { bg: '#F6F0E1', surface: '#FCF8EE', surface2: '#EFE8D6', topbar: '#FCF8EE', paper: '#FCF8EE' };
export function palette(mode: Mode, soft: boolean): Tokens {
  const base: Tokens = mode === 'light' ? light : dark;
  return soft ? { ...base, ...(mode === 'light' ? softLight : softDark) } : base;
}

const STANDARD = parseReading(null) as Reading;
const Ctx = createContext<Display>({ t: dark, mode: 'dark', setMode: () => {}, reading: STANDARD, calm: false, focus: false });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { state } = useSession();
  const [mode, setModeState] = useState<Mode>('dark');
  useEffect(() => {
    let live = true;
    void SecureStore.getItemAsync(THEME_KEY).then(v => { if (live && v === 'light') setModeState('light'); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    void (m === 'light' ? SecureStore.setItemAsync(THEME_KEY, 'light') : SecureStore.deleteItemAsync(THEME_KEY)).catch(() => {});
  }, []);
  const saved = state.status === 'signedIn' ? (state.me.employee as unknown as { reading_prefs?: unknown }).reading_prefs : null;
  const reading = useMemo(() => parseReading(saved ?? null) as Reading, [saved]);
  const value = useMemo<Display>(() => ({ t: palette(mode, reading.soft), mode, setMode, reading, calm: reading.calm, focus: reading.focus }), [mode, setMode, reading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): Tokens { return useContext(Ctx).t; }
export const useDisplay = () => useContext(Ctx);
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { md: 12, lg: 16, xl: 22 } as const;
// The smallest thing a thumb is asked to hit, as in the web Field view.
export const TOUCH = 44;
