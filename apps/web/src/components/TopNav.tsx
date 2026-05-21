import React from 'react';
import { Link } from 'react-router-dom';

import ultratableBanner from '../assets/ultratable_banner.png';
import LeagueSelector from './LeagueSelector';

const TopNav: React.FC = () => {
    return (
        <header className="top-nav">
            <Link to="/" className="top-nav__logo" title="UltraTable Home">
                <img src={ultratableBanner} alt="UltraTable Banner" />
            </Link>
            <div className="top-nav__controls">
                <LeagueSelector />
            </div>
        </header>
    );
};

export default TopNav;
