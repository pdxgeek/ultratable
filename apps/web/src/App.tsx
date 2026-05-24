import React from 'react';
import { Route, Routes } from 'react-router-dom';

import Footer from './components/Footer';
import TopNav from './components/TopNav';
import AccountPage from './pages/account/AccountPage';
import LoginPage from './pages/LoginPage';
import MatchPage from './pages/MatchPage';
import MissionPage from './pages/MissionPage';
import PredictionsPage from './pages/PredictionsPage';
import StandingsView from './pages/StandingsView';
import TierListEditorPage from './pages/TierListEditorPage';
import TierListsPage from './pages/TierListsPage';

const App: React.FC = () => {
    return (
        <div className="flex flex-col min-h-screen">
            <TopNav />
            <main className="flex-1 max-w-[1200px] w-full mx-auto px-5 py-8">
                <Routes>
                    <Route path="/" element={<StandingsView />} />
                    <Route path="/match/:id" element={<MatchPage />} />
                    <Route path="/mission" element={<MissionPage />} />
                    <Route path="/predictions" element={<PredictionsPage />} />
                    <Route path="/tier-lists" element={<TierListsPage />} />
                    <Route path="/tier-lists/:id" element={<TierListEditorPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/account/*" element={<AccountPage />} />
                </Routes>
            </main>
            <Footer />
        </div>
    );
};

export default App;
