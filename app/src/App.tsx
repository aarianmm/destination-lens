import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell.js';
import { Loading } from './components/Loading.js';

// Route-level code splitting. The globe (three + react-globe.gl, ~500KB
// gzipped — see vite.config.ts's `globe` manualChunk) is only reachable via
// Explore/Country/Destination's import of ../scene; keeping every screen a
// lazy import means the Discover screen — which never touches the scene —
// never downloads it, and Explore's own JS can paint the app shell before
// the heavy chunk finishes streaming in behind it.
const ExploreScreen = lazy(() =>
  import('./screens/explore/ExploreScreen.js').then((m) => ({ default: m.ExploreScreen })),
);
const CountryScreen = lazy(() =>
  import('./screens/country/CountryScreen.js').then((m) => ({ default: m.CountryScreen })),
);
const DestinationScreen = lazy(() =>
  import('./screens/destination/DestinationScreen.js').then((m) => ({
    default: m.DestinationScreen,
  })),
);
const DiscoverScreen = lazy(() =>
  import('./screens/discover/DiscoverScreen.js').then((m) => ({ default: m.DiscoverScreen })),
);

/** Covers only the brief window while a route's JS chunk streams in — screens
 * handle their own data-loading states once mounted. */
function RouteFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Loading label="Loading" />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<ExploreScreen />} />
            <Route path="/c/:iso2" element={<CountryScreen />} />
            <Route path="/d/:slug" element={<DestinationScreen />} />
            <Route path="/discover" element={<DiscoverScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
    </BrowserRouter>
  );
}
