import { type ReactNode, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';


interface LayoutProps {
    syncBar?: ReactNode;
    activeLeagueKey?: string;
}

export default function Layout({ syncBar, activeLeagueKey }: LayoutProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const prevKeyRef = useRef(activeLeagueKey);

    useEffect(() => {
        // Only navigate if the league key actually CHANGED
        if (prevKeyRef.current !== activeLeagueKey) {
            prevKeyRef.current = activeLeagueKey;
            if (location.pathname !== '/') {
                navigate('/');
            }
        }
    }, [activeLeagueKey, navigate, location.pathname]);

    return (
        <div className="layout">
            <header className="layout__header">
                <div className="layout__brand">
                    <Link to="/" className="layout__brand-link">
                        <span className="layout__logo">⚽</span>
                        <span className="layout__title">Ultraball</span>
                    </Link>
                </div>
            </header>
            {syncBar}
            <main className="layout__content">
                <Outlet />
            </main>
            <footer className="layout__footer">
                <nav className="layout__nav">
                    <Link
                        to="/"
                        className={`layout__link ${location.pathname === '/' ? 'active' : ''}`}
                    >
                        Table
                    </Link>
                    <Link
                        to="/settings"
                        className={`layout__link ${location.pathname === '/settings' ? 'active' : ''}`}
                    >
                        Settings
                    </Link>
                    <Link
                        to="/data"
                        className={`layout__link ${location.pathname === '/data' ? 'active' : ''}`}
                    >
                        Data
                    </Link>
                </nav>
            </footer>
        </div>
    );
}
