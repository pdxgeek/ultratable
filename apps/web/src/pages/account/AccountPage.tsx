import React from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';

import RequireSignIn from '../../components/RequireSignIn';
import { cn } from '@/lib/utils';
import LeagueFollowsPanel from './LeagueFollowsPanel';
import ProfilePanel from './ProfilePanel';
import SecurityPanel from './SecurityPanel';

interface AccountNavItem {
    to: string;
    label: string;
}

const NAV_ITEMS: AccountNavItem[] = [
    { to: '/account/profile', label: 'Profile' },
    { to: '/account/leagues', label: 'League selection' },
    { to: '/account/security', label: 'Security' },
];

const AccountPage: React.FC = () => {
    return (
        <RequireSignIn>
            <div className="grid grid-cols-[200px_1fr] gap-8">
                <nav aria-label="Account settings" className="flex flex-col gap-1">
                    {NAV_ITEMS.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                cn(
                                    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                    isActive
                                        ? 'bg-muted text-foreground'
                                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                                )
                            }
                        >
                            {item.label}
                        </NavLink>
                    ))}
                </nav>
                <section>
                    <Routes>
                        <Route index element={<Navigate to="profile" replace />} />
                        <Route path="profile" element={<ProfilePanel />} />
                        <Route path="leagues" element={<LeagueFollowsPanel />} />
                        <Route path="security" element={<SecurityPanel />} />
                    </Routes>
                </section>
            </div>
        </RequireSignIn>
    );
};

export default AccountPage;
