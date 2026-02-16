import { useState, useRef, useEffect } from 'react';
import { authService } from '../services/auth/authService';
import { useNavigate } from 'react-router-dom';

export function UserMenu() {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const session = authService.getSession();
    if (!session) return null;

    const { user } = session;

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    const handleLogout = async () => {
        setIsLoggingOut(true);
        try {
            await authService.logout();
            window.location.href = '/login';
        } catch (err) {
            console.error('Failed to logout:', err);
            setIsLoggingOut(false);
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
        <div ref={menuRef} style={{ position: 'relative' }}>
            {/* Avatar Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    border: '2px solid #e2e8f0',
                    background: user.avatar ? `url(${user.avatar}) center/cover` : '#667eea',
                    color: 'white',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    overflow: 'hidden',
                }}
                onMouseOver={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e0';
                    e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseOut={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.transform = 'scale(1)';
                }}
            >
                {!user.avatar && getInitials(user.displayName)}
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '48px',
                    right: '0',
                    background: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
                    border: '1px solid #e2e8f0',
                    minWidth: '240px',
                    zIndex: 1000,
                    overflow: 'hidden',
                }}>
                    {/* User Info */}
                    <div style={{
                        padding: '1rem',
                        borderBottom: '1px solid #e2e8f0',
                    }}>
                        <div style={{
                            fontWeight: '600',
                            color: '#1a202c',
                            marginBottom: '0.25rem',
                        }}>
                            {user.displayName || 'User'}
                        </div>
                        <div style={{
                            fontSize: '0.875rem',
                            color: '#718096',
                        }}>
                            {user.email || 'No email'}
                        </div>
                    </div>

                    {/* Menu Items */}
                    <div style={{ padding: '0.5rem' }}>
                        <button
                            onClick={() => {
                                navigate('/account');
                                setIsOpen(false);
                            }}
                            style={{
                                width: '100%',
                                padding: '0.75rem 1rem',
                                textAlign: 'left',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                color: '#2d3748',
                                transition: 'background 0.2s',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.background = '#f7fafc';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.background = 'transparent';
                            }}
                        >
                            Account Settings
                        </button>

                        <button
                            onClick={() => {
                                navigate('/settings');
                                setIsOpen(false);
                            }}
                            style={{
                                width: '100%',
                                padding: '0.75rem 1rem',
                                textAlign: 'left',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                color: '#2d3748',
                                transition: 'background 0.2s',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.background = '#f7fafc';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.background = 'transparent';
                            }}
                        >
                            App Settings
                        </button>
                    </div>

                    {/* Logout */}
                    <div style={{
                        padding: '0.5rem',
                        borderTop: '1px solid #e2e8f0',
                    }}>
                        <button
                            onClick={handleLogout}
                            disabled={isLoggingOut}
                            style={{
                                width: '100%',
                                padding: '0.75rem 1rem',
                                textAlign: 'left',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: isLoggingOut ? 'not-allowed' : 'pointer',
                                fontSize: '0.875rem',
                                color: '#e53e3e',
                                transition: 'background 0.2s',
                                opacity: isLoggingOut ? 0.5 : 1,
                            }}
                            onMouseOver={(e) => {
                                if (!isLoggingOut) {
                                    e.currentTarget.style.background = '#fff5f5';
                                }
                            }}
                            onMouseOut={(e) => {
                                if (!isLoggingOut) {
                                    e.currentTarget.style.background = 'transparent';
                                }
                            }}
                        >
                            {isLoggingOut ? 'Signing out...' : 'Sign out'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
