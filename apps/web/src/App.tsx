import React from 'react';
import { Routes, Route } from 'react-router-dom';
import TopNav from './components/TopNav';
import Footer from './components/Footer';
import StandingsView from './pages/StandingsView';
import MatchPage from './pages/MatchPage';
import MissionPage from './pages/MissionPage';

const App: React.FC = () => {
  return (
    <div className="app-shell">
      <TopNav />
      <main className="app-shell__content">
        <Routes>
          <Route path="/" element={<StandingsView />} />
          <Route path="/match/:id" element={<MatchPage />} />
          <Route path="/mission" element={<MissionPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
};

export default App;
