import React from 'react';
import { Link } from 'react-router-dom';

import ultratableBanner from '../assets/ultratable_banner.png';
import LeagueSelector from './LeagueSelector';

const TopNav: React.FC = () => {
    return (
        <header className="flex justify-between items-center px-6 py-3 bg-glass-bg backdrop-blur-md border-b border-glass-border sticky top-0 z-[1000] h-[60px]">
            <Link
                to="/"
                className="absolute top-2 left-6 h-[60px] z-[1001] flex items-center transition-opacity hover:opacity-80"
                title="UltraTable Home"
            >
                <img
                    src={ultratableBanner}
                    alt="UltraTable Banner"
                    className="h-full object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.4)]"
                />
            </Link>
            <div className="flex items-center gap-4 ml-auto">
                <LeagueSelector />
            </div>
        </header>
    );
};

export default TopNav;
