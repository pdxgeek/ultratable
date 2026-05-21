import { useEffect, useState } from 'react';

import { API_BASE } from '../lib/api';
import { authClient } from '../lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface DevAuthSession {
    user: {
        id: string;
        email: string;
        roles?: string[];
    };
}

export function DevLoginTools() {
    const [session, setSession] = useState<DevAuthSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSession = async () => {
        try {
            setLoading(true);
            const data = await authClient.getSession();
            setSession(data?.data || null);
            setError(null);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to fetch session';
            setError(message);
            setSession(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSession();
    }, []);

    const handleLogin = async (role: string) => {
        try {
            console.info(`[Auth] Attempting login as role: ${role}...`);
            setLoading(true);

            // 1. Seed the dummy user natively into the backend DB via dev-login
            const res = await fetch(`${API_BASE}/api/auth/dev-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role }),
            });

            if (!res.ok) throw new Error('Dummy user seeding failed');

            // 2. Perform native BetterAuth login, perfectly handling cookies & origins
            const email = `dev-${role}@ultratable.local`;
            const authRes = await authClient.signIn.email({
                email,
                password: 'dev-password-123',
            });

            if (authRes.error) {
                throw new Error(authRes.error.message || 'Native sign in failed');
            }

            await fetchSession();
            console.info(`[Auth] Successfully logged in as role: ${role}`);
            window.dispatchEvent(new Event('dev-auth-change'));
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Login failed';
            console.error(`[Auth] Login attempt failed:`, message);
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            console.info('[Auth] Attempting logout...');
            setLoading(true);
            await authClient.signOut();
            await fetchSession();
            console.info('[Auth] Successfully logged out');
            window.dispatchEvent(new Event('dev-auth-change'));
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Logout failed';
            console.error('[Auth] Logout attempt failed:', message);
            setLoading(false);
        }
    };

    if (!import.meta.env.DEV) return null;

    return (
        <Card className="fixed bottom-5 right-5 z-[9999] w-80 max-h-[400px] overflow-y-auto bg-[#1a1a1a] border border-[#333] ring-0 rounded-lg p-4 text-white font-mono shadow-lg">
            <h3 className="m-0 mb-3 text-sm border-b border-[#333] pb-2">
                🛠️ Dev Auth Tools
            </h3>

            <div className="mb-4 flex flex-wrap gap-2">
                <Button
                    size="xs"
                    onClick={() => handleLogin('admin')}
                    disabled={loading}
                    className="flex-1 h-6 bg-[#ff4757] hover:bg-[#ff4757]/90 text-white text-xs font-bold"
                >
                    Admin
                </Button>
                <Button
                    size="xs"
                    onClick={() => handleLogin('user')}
                    disabled={loading}
                    className="flex-1 h-6 bg-[#2ed573] hover:bg-[#2ed573]/90 text-white text-xs font-bold"
                >
                    User
                </Button>
                <Button
                    size="xs"
                    onClick={() => handleLogin('guest')}
                    disabled={loading}
                    className="flex-1 h-6 bg-[#1e90ff] hover:bg-[#1e90ff]/90 text-white text-xs font-bold"
                >
                    Guest
                </Button>
                {session && (
                    <Button
                        size="xs"
                        onClick={handleLogout}
                        disabled={loading}
                        className="flex-1 h-6 bg-[#747d8c] hover:bg-[#747d8c]/90 text-white text-xs font-bold"
                    >
                        Logout
                    </Button>
                )}
            </div>

            {error && (
                <div className="text-[#ff4757] p-2 bg-[#ff4757]/10 rounded mb-3 text-xs">
                    {error}
                </div>
            )}

            <div className="text-xs">
                <div className="font-bold mb-1 text-[#a4b0be]">Active Session:</div>
                {loading ? (
                    <div className="text-[#ffa502]">Loading...</div>
                ) : session?.user ? (
                    <pre className="bg-black p-2 rounded m-0 whitespace-pre-wrap break-all">
                        {JSON.stringify(
                            {
                                id: session.user.id,
                                roles: session.user.roles,
                                email: session.user.email,
                            },
                            null,
                            2,
                        )}
                    </pre>
                ) : (
                    <div className="text-[#ff6b81]">Unauthenticated (No Cookie)</div>
                )}
            </div>
        </Card>
    );
}
