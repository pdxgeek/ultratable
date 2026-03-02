import { useState, useEffect } from 'react';
import { authClient } from '../lib/auth-client';

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
            const res = await fetch(`/api/auth/dev-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role })
            });

            if (!res.ok) throw new Error('Dummy user seeding failed');

            // 2. Perform native BetterAuth login, perfectly handling cookies & origins
            const email = `dev-${role}@ultratable.local`;
            const authRes = await authClient.signIn.email({
                email,
                password: 'dev-password-123'
            });

            if (authRes.error) {
                throw new Error(authRes.error.message || "Native sign in failed");
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
    }

    if (!import.meta.env.DEV) return null; // Safety check

    return (
        <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '16px',
            width: '320px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            zIndex: 9999,
            color: '#fff',
            fontFamily: 'monospace',
            maxHeight: '400px',
            overflowY: 'auto'
        }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', borderBottom: '1px solid #333', paddingBottom: '8px' }}>
                🛠️ Dev Auth Tools
            </h3>

            <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => handleLogin('admin')} disabled={loading} style={btnStyle('#ff4757')}>Admin</button>
                <button onClick={() => handleLogin('user')} disabled={loading} style={btnStyle('#2ed573')}>User</button>
                <button onClick={() => handleLogin('guest')} disabled={loading} style={btnStyle('#1e90ff')}>Guest</button>
                {session && <button onClick={handleLogout} disabled={loading} style={btnStyle('#747d8c')}>Logout</button>}
            </div>

            {error && (
                <div style={{ color: '#ff4757', padding: '8px', background: 'rgba(255,71,87,0.1)', borderRadius: '4px', marginBottom: '12px', fontSize: '12px' }}>
                    {error}
                </div>
            )}

            <div style={{ fontSize: '12px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#a4b0be' }}>Active Session:</div>
                {loading ? (
                    <div style={{ color: '#ffa502' }}>Loading...</div>
                ) : session?.user ? (
                    <pre style={{
                        background: '#000',
                        padding: '8px',
                        borderRadius: '4px',
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all'
                    }}>
                        {JSON.stringify({
                            id: session.user.id,
                            roles: session.user.roles,
                            email: session.user.email
                        }, null, 2)}
                    </pre>
                ) : (
                    <div style={{ color: '#ff6b81' }}>Unauthenticated (No Cookie)</div>
                )}
            </div>
        </div>
    );
}

const btnStyle = (bg: string) => ({
    background: bg,
    border: 'none',
    color: '#fff',
    padding: '4px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
    flex: '1 1 auto'
});
