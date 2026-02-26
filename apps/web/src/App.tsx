import React from 'react';
import { Routes, Route } from 'react-router-dom';
import TopNav from './components/TopNav';
import StandingsView from './pages/StandingsView';
import MatchPage from './pages/MatchPage';

const App: React.FC = () => {
  return (
    <>
      <TopNav />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
        <Routes>
          <Route path="/" element={<StandingsView />} />
          <Route path="/match/:id" element={<MatchPage />} />
        </Routes>
      </div>
    </>
  );
};

export default App;
