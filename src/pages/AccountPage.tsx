import { useState, useRef } from 'react';
import { authService, type OAuthProvider } from '../services/auth/authService';
import { db } from '../services/dao/schema';

export function AccountPage() {
    const [session, setSession] = useState(authService.getSession());
    const [loading, setLoading] = useState<OAuthProvider | null>(null);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!session) {
        window.location.href = '/login';
        return null;
    }

    const { user, connections } = session;

    const isProviderLinked = (provider: OAuthProvider) => {
        return connections.some(c => c.provider === provider);
    };

    const handleLinkProvider = async (provider: OAuthProvider) => {
        setLoading(provider);
        try {
            await authService.linkProvider(provider);
            setSession(authService.getSession());
        } catch (err) {
            console.error(`Failed to link ${provider}:`, err);
            alert(`Failed to link ${provider}. Check console for details.`);
        } finally {
            setLoading(null);
        }
    };

    const handleUnlinkProvider = async (provider: OAuthProvider) => {
        if (connections.length === 1) {
            alert('Cannot unlink your last authentication method');
            return;
        }

        if (!confirm(`Are you sure you want to unlink ${provider}?`)) {
            return;
        }

        setLoading(provider);
        try {
            await authService.unlinkProvider(provider);
            setSession(authService.getSession());
        } catch (err) {
            console.error(`Failed to unlink ${provider}:`, err);
            alert(`Failed to unlink ${provider}. Check console for details.`);
        } finally {
            setLoading(null);
        }
    };

    const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('Image must be smaller than 5MB');
            return;
        }

        setUploadingPhoto(true);
        try {
            // Convert to data URL for local storage
            const reader = new FileReader();
            reader.onload = async (e) => {
                const dataUrl = e.target?.result as string;

                // Update user avatar in DB
                await db.users.update(user.id, { avatar: dataUrl });

                // Refresh session
                const updatedUser = await db.users.get(user.id);
                if (updatedUser) {
                    setSession({
                        ...session,
                        user: updatedUser,
                    });
                }

                setUploadingPhoto(false);
            };
            reader.onerror = () => {
                alert('Failed to read image file');
                setUploadingPhoto(false);
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error('Failed to upload photo:', err);
            alert('Failed to upload photo');
            setUploadingPhoto(false);
        }
    };

    const getProviderIcon = (provider: OAuthProvider) => {
        switch (provider) {
            case 'github':
                return (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                );
            case 'google':
                return (
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                );
            case 'discord':
                return (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                );
        }
    };

    const getInitials = (name?: string) => {
        if (!name) return '?';
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'var(--bg-primary)',
            padding: '2rem',
        }}>
            <div style={{
                maxWidth: '800px',
                margin: '0 auto',
            }}>
                {/* Header */}
                <div style={{
                    marginBottom: '2rem',
                }}>
                    <h1 style={{
                        fontSize: '2rem',
                        fontWeight: 'bold',
                        color: 'var(--text-primary)',
                        marginBottom: '0.5rem',
                    }}>
                        Account Settings
                    </h1>
                    <p style={{
                        color: 'var(--text-secondary)',
                    }}>
                        Manage your profile and connected accounts
                    </p>
                </div>

                {/* Profile Card */}
                <div style={{
                    background: 'var(--bg-secondary)',
                    borderRadius: '12px',
                    padding: '2rem',
                    marginBottom: '1.5rem',
                    border: '1px solid var(--border-color)',
                }}>
                    <h2 style={{
                        fontSize: '1.25rem',
                        fontWeight: '600',
                        color: 'var(--text-primary)',
                        marginBottom: '1.5rem',
                    }}>
                        Profile
                    </h2>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2rem',
                    }}>
                        {/* Avatar */}
                        <div style={{ position: 'relative' }}>
                            <div style={{
                                width: '100px',
                                height: '100px',
                                borderRadius: '50%',
                                background: user.avatar ? `url(${user.avatar}) center/cover` : 'var(--accent-blue)',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '2rem',
                                fontWeight: '600',
                                border: '3px solid var(--border-color)',
                                overflow: 'hidden',
                            }}>
                                {!user.avatar && getInitials(user.displayName)}
                            </div>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingPhoto}
                                style={{
                                    position: 'absolute',
                                    bottom: '0',
                                    right: '0',
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    background: 'var(--accent-blue)',
                                    color: 'white',
                                    border: '2px solid var(--bg-secondary)',
                                    cursor: uploadingPhoto ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1rem',
                                    opacity: uploadingPhoto ? 0.5 : 1,
                                }}
                            >
                                {uploadingPhoto ? '...' : '✏️'}
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handlePhotoUpload}
                                style={{ display: 'none' }}
                            />
                        </div>

                        {/* Info */}
                        <div>
                            <h3 style={{
                                fontSize: '1.5rem',
                                fontWeight: '600',
                                color: 'var(--text-primary)',
                                marginBottom: '0.25rem',
                            }}>
                                {user.displayName || 'User'}
                            </h3>
                            <p style={{
                                color: 'var(--text-secondary)',
                                marginBottom: '0.5rem',
                            }}>
                                {user.email || 'No email'}
                            </p>
                            <p style={{
                                fontSize: '0.875rem',
                                color: 'var(--text-muted)',
                            }}>
                                Member since {new Date(user.createdAt).toLocaleDateString()}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Connected Accounts Card */}
                <div style={{
                    background: 'var(--bg-secondary)',
                    borderRadius: '12px',
                    padding: '2rem',
                    border: '1px solid var(--border-color)',
                }}>
                    <h2 style={{
                        fontSize: '1.25rem',
                        fontWeight: '600',
                        color: 'var(--text-primary)',
                        marginBottom: '0.5rem',
                    }}>
                        Connected Accounts
                    </h2>
                    <p style={{
                        fontSize: '0.875rem',
                        color: 'var(--text-secondary)',
                        marginBottom: '1.5rem',
                    }}>
                        Link multiple providers to your account. You must have at least one connected.
                    </p>

                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                    }}>
                        {(['github', 'google', 'discord'] as OAuthProvider[]).map(provider => {
                            const linked = isProviderLinked(provider);
                            const connection = connections.find(c => c.provider === provider);

                            return (
                                <div
                                    key={provider}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '1rem',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '8px',
                                        background: linked ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
                                    }}
                                >
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '1rem',
                                    }}>
                                        <div style={{ color: '#2d3748' }}>
                                            {getProviderIcon(provider)}
                                        </div>
                                        <div>
                                            <div style={{
                                                fontWeight: '500',
                                                color: 'var(--text-primary)',
                                                textTransform: 'capitalize',
                                            }}>
                                                {provider}
                                            </div>
                                            {linked && connection && (
                                                <div style={{
                                                    fontSize: '0.875rem',
                                                    color: 'var(--text-secondary)',
                                                }}>
                                                    {connection.providerEmail || connection.providerUsername || 'Connected'}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {linked ? (
                                        <button
                                            onClick={() => handleUnlinkProvider(provider)}
                                            disabled={loading !== null || connections.length === 1}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                background: connections.length === 1 ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
                                                color: connections.length === 1 ? 'var(--text-muted)' : 'var(--accent-red)',
                                                border: `1px solid ${connections.length === 1 ? 'var(--border-color)' : 'var(--accent-red)'}`,
                                                borderRadius: '6px',
                                                fontSize: '0.875rem',
                                                fontWeight: '500',
                                                cursor: loading !== null || connections.length === 1 ? 'not-allowed' : 'pointer',
                                                transition: 'all 0.2s',
                                            }}
                                        >
                                            {loading === provider ? 'Unlinking...' : 'Unlink'}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleLinkProvider(provider)}
                                            disabled={loading !== null}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                background: 'var(--accent-blue)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                fontSize: '0.875rem',
                                                fontWeight: '500',
                                                cursor: loading !== null ? 'not-allowed' : 'pointer',
                                                opacity: loading !== null && loading !== provider ? 0.5 : 1,
                                                transition: 'all 0.2s',
                                            }}
                                            onMouseOver={(e) => {
                                                if (loading === null) {
                                                    e.currentTarget.style.opacity = '0.8';
                                                }
                                            }}
                                            onMouseOut={(e) => {
                                                if (loading === null) {
                                                    e.currentTarget.style.opacity = '1';
                                                }
                                            }}
                                        >
                                            {loading === provider ? 'Linking...' : 'Link'}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
