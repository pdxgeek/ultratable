import { useState } from 'react';
import { authService, type OAuthProvider } from '../services/auth/authService';
import { db } from '../services/dao/schema';
import { generateId } from '../services/idUtils';
import ultratableLogo from '../assets/UltratableIO.png';

export function LoginPage() {
    const [loading, setLoading] = useState<OAuthProvider | null>(null);
    const [devBypass, setDevBypass] = useState(false);

    const handleSignIn = async (provider: OAuthProvider) => {
        setLoading(provider);
        try {
            await authService.signIn(provider);
        } catch (err) {
            console.error(`Failed to sign in with ${provider}:`, err);
            alert(`Failed to sign in with ${provider}. Check console for details.`);
            setLoading(null);
        }
    };

    // Dev-only bypass for testing UI without OAuth setup
    const handleDevBypass = async () => {
        if (!import.meta.env.DEV) return;

        setLoading('github');
        try {
            const now = Date.now();
            const userId = generateId();

            // Create dev user
            await db.users.add({
                id: userId,
                email: 'dev@ultratable.local',
                displayName: 'Dev User',
                createdAt: now,
                lastLogin: now,
            });

            // Create mock OAuth connection
            await db.oauthConnections.add({
                id: generateId(),
                userId,
                provider: 'github',
                providerId: 'dev-bypass',
                providerEmail: 'dev@ultratable.local',
                providerUsername: 'devuser',
                connectedAt: now,
                lastUsed: now,
            });

            // Reload page to trigger auth check
            window.location.reload();
        } catch (err) {
            console.error('Dev bypass failed:', err);
            setLoading(null);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: '2rem',
        }}>
            {/* Logo */}
            <div style={{
                marginBottom: '3rem',
                textAlign: 'center',
            }}>
                <img
                    src={ultratableLogo}
                    alt="UltraTable.io"
                    style={{
                        maxWidth: '300px',
                        width: '100%',
                        height: 'auto',
                        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))',
                    }}
                />
                <p style={{
                    fontSize: '1.25rem',
                    color: 'rgba(255,255,255,0.9)',
                    marginTop: '1rem',
                }}>
                    Professional standings for every league
                </p>
            </div>

            {/* Login Card */}
            <div style={{
                background: 'white',
                borderRadius: '16px',
                padding: '2.5rem',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
                maxWidth: '400px',
                width: '100%',
            }}>
                <h2 style={{
                    fontSize: '1.5rem',
                    fontWeight: '600',
                    color: '#1a202c',
                    marginBottom: '1.5rem',
                    textAlign: 'center',
                }}>
                    Sign in to continue
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* GitHub */}
                    <button
                        onClick={() => handleSignIn('github')}
                        disabled={loading !== null}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.75rem',
                            padding: '0.75rem 1.5rem',
                            background: loading === 'github' ? '#2d3748' : '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '1rem',
                            fontWeight: '500',
                            cursor: loading !== null ? 'not-allowed' : 'pointer',
                            opacity: loading !== null && loading !== 'github' ? 0.5 : 1,
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => {
                            if (loading === null) {
                                e.currentTarget.style.background = '#2d3748';
                            }
                        }}
                        onMouseOut={(e) => {
                            if (loading === null) {
                                e.currentTarget.style.background = '#333';
                            }
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                        {loading === 'github' ? 'Signing in...' : 'Continue with GitHub'}
                    </button>

                    {/* Google */}
                    <button
                        onClick={() => handleSignIn('google')}
                        disabled={loading !== null}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.75rem',
                            padding: '0.75rem 1.5rem',
                            background: loading === 'google' ? '#f7fafc' : 'white',
                            color: '#2d3748',
                            border: '2px solid #e2e8f0',
                            borderRadius: '8px',
                            fontSize: '1rem',
                            fontWeight: '500',
                            cursor: loading !== null ? 'not-allowed' : 'pointer',
                            opacity: loading !== null && loading !== 'google' ? 0.5 : 1,
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => {
                            if (loading === null) {
                                e.currentTarget.style.background = '#f7fafc';
                            }
                        }}
                        onMouseOut={(e) => {
                            if (loading === null) {
                                e.currentTarget.style.background = 'white';
                            }
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        {loading === 'google' ? 'Signing in...' : 'Continue with Google'}
                    </button>

                    {/* Discord */}
                    <button
                        onClick={() => handleSignIn('discord')}
                        disabled={loading !== null}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.75rem',
                            padding: '0.75rem 1.5rem',
                            background: loading === 'discord' ? '#5865F2' : '#5865F2',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '1rem',
                            fontWeight: '500',
                            cursor: loading !== null ? 'not-allowed' : 'pointer',
                            opacity: loading !== null && loading !== 'discord' ? 0.5 : 1,
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => {
                            if (loading === null) {
                                e.currentTarget.style.background = '#4752C4';
                            }
                        }}
                        onMouseOut={(e) => {
                            if (loading === null) {
                                e.currentTarget.style.background = '#5865F2';
                            }
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                        </svg>
                        {loading === 'discord' ? 'Signing in...' : 'Continue with Discord'}
                    </button>
                </div>

                <p style={{
                    marginTop: '1.5rem',
                    fontSize: '0.875rem',
                    color: '#718096',
                    textAlign: 'center',
                }}>
                    By continuing, you agree to our Terms of Service
                </p>

                {/* Dev Bypass Button (DEV ONLY) */}
                {import.meta.env.DEV && (
                    <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                        <button
                            onClick={handleDevBypass}
                            disabled={loading !== null}
                            style={{
                                padding: '0.5rem 1rem',
                                background: 'transparent',
                                color: '#a0aec0',
                                border: '1px dashed #cbd5e0',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                cursor: loading !== null ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseOver={(e) => {
                                if (loading === null) {
                                    e.currentTarget.style.background = '#f7fafc';
                                }
                            }}
                            onMouseOut={(e) => {
                                if (loading === null) {
                                    e.currentTarget.style.background = 'transparent';
                                }
                            }}
                        >
                            [DEV] Bypass OAuth
                        </button>
                    </div>
                )}
            </div>

        </div>
    );
}
