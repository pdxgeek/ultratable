import React from 'react';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
    const year = new Date().getFullYear();

    return (
        <footer className="site-footer">
            <div className="site-footer__inner">
                <div className="site-footer__brand">
                    <span className="site-footer__name">UltraTable</span>
                    <span className="site-footer__tagline">
                        Premier-league UX for every league.
                    </span>
                </div>
                <nav className="site-footer__links">
                    <Link to="/mission" className="site-footer__link">
                        Our Mission
                    </Link>
                </nav>
                <div className="site-footer__legal">
                    <span>© {year} UltraTable. All rights reserved.</span>
                    <span className="site-footer__divider">·</span>
                    <span>Football data provided by third-party APIs.</span>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
