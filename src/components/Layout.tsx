import { type ReactNode, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { UserMenu } from './UserMenu';
import { PageMenu } from './PageMenu';

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

    // Hide SyncBar on account/settings pages
    const hideSyncBar = location.pathname === '/account' || location.pathname === '/settings';

    return (
        <div className="layout">
            <header style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 2rem',
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-color)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                zIndex: 1000,
            }}>
                <Link
                    to="/"
                    style={{
                        fontSize: '1.5rem',
                        fontWeight: '700',
                        color: 'var(--accent-blue)',
                        textDecoration: 'none',
                        letterSpacing: '-0.025em',
                    }}
                >
                    ultratable.io
                </Link>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <PageMenu />
                    <UserMenu />
                </div>
            </header>
            <div style={{ marginTop: '60px' }}>
                {!hideSyncBar && syncBar}
                <main className="layout__content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
