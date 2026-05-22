import React from 'react';
import { Route, Routes } from 'react-router-dom';

import Footer from './components/Footer';
import TopNav from './components/TopNav';
import LoginPage from './pages/LoginPage';
import MatchPage from './pages/MatchPage';
import MissionPage from './pages/MissionPage';
import StandingsView from './pages/StandingsView';

const App: React.FC = () => {
    return (
        <div className="flex flex-col min-h-screen">
            <TopNav />
            <main className="flex-1 max-w-[1200px] w-full mx-auto px-5 py-8">
                <Routes>
                    <Route path="/" element={<StandingsView />} />
                    <Route path="/match/:id" element={<MatchPage />} />
                    <Route path="/mission" element={<MissionPage />} />
                    <Route path="/login" element={<LoginPage />} />
                </Routes>
            </main>
            <Footer />
        </div>
    );
};

export default App;
