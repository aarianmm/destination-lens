import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ExploreScreen } from './screens/explore/ExploreScreen.js';
import { CountryScreen } from './screens/country/CountryScreen.js';
import { DestinationScreen } from './screens/destination/DestinationScreen.js';
import { DiscoverScreen } from './screens/discover/DiscoverScreen.js';
import { AppShell } from './components/AppShell.js';

export function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<ExploreScreen />} />
          <Route path="/c/:iso2" element={<CountryScreen />} />
          <Route path="/d/:slug" element={<DestinationScreen />} />
          <Route path="/discover" element={<DiscoverScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
