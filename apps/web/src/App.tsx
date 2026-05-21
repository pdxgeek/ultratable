import React from 'react';
import { Route, Routes } from 'react-router-dom';

import Footer from './components/Footer';
import TopNav from './components/TopNav';
import MatchPage from './pages/MatchPage';
import MissionPage from './pages/MissionPage';
import StandingsView from './pages/StandingsView';

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
