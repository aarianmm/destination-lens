import { create } from 'zustand';

/** Cross-screen UI state only. Snapshot data lives in the snapshot cache, not here. */
type AppState = {
  hoveredCountryIso2: string | null;
  hoveredSlug: string | null;
  /** Set once the user interacts, so the globe can stop auto-rotating. */
  hasInteracted: boolean;
  setHoveredCountry: (iso2: string | null) => void;
  setHoveredSlug: (slug: string | null) => void;
  markInteracted: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  hoveredCountryIso2: null,
  hoveredSlug: null,
  hasInteracted: false,
  setHoveredCountry: (iso2) => set({ hoveredCountryIso2: iso2 }),
  setHoveredSlug: (slug) => set({ hoveredSlug: slug }),
  markInteracted: () => set({ hasInteracted: true }),
}));
