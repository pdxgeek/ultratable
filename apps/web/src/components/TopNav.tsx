import React from 'react';
import { Link, useLocation } from 'react-router-dom';

import ultratableBanner from '../assets/ultratable_banner.png';
import { useViewer, type Viewer } from '../hooks/useViewer';
import { authClient } from '../lib/auth-client';
import { getInitials } from '../lib/initials';
import LeagueSelector from './LeagueSelector';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const TopNav: React.FC = () => {
    const { viewer, refetch } = useViewer();
    const location = useLocation();

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
                {viewer ? (
                    <UserMenu viewer={viewer} onSignOut={refetch} />
                ) : (
                    <Button asChild variant="ghost" size="sm">
                        <Link
                            to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
                        >
                            Sign in
                        </Link>
                    </Button>
                )}
            </div>
        </header>
    );
};

const UserMenu: React.FC<{ viewer: Viewer; onSignOut: () => void }> = ({ viewer, onSignOut }) => {
    const initials = getInitials(viewer.name || viewer.email);
    const handleSignOut = async () => {
        await authClient.signOut();
        onSignOut();
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label="Open user menu"
                    className="flex size-8 items-center justify-center rounded-full bg-accent-blue/20 text-xs font-semibold text-text-primary ring-1 ring-foreground/15 transition hover:bg-accent-blue/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {viewer.image ? (
                        <img
                            src={viewer.image}
                            alt=""
                            className="size-8 rounded-full object-cover"
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        initials
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
                    <span className="text-sm font-medium text-foreground truncate">
                        {viewer.name}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">{viewer.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link to="/account">Account</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleSignOut}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default TopNav;
