import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../services/auth/authService';

export function PageMenu() {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const location = useLocation();

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

    const isAdmin = authService.isAdmin();
    const pages = [
        { path: '/', label: 'Table' },
        ...(isAdmin ? [
            { path: '/data', label: 'Data' },
            { path: '/settings', label: 'Settings' },
            { path: '/graphics', label: 'Graphics' },
        ] : []),
    ];

    const currentPage = pages.find(p => p.path === location.pathname) || pages[0];

    const handlePageSelect = (path: string) => {
        navigate(path);
        setIsOpen(false);
    };

    return (
        <div ref={menuRef} style={{ position: 'relative' }}>
            {/* Dropdown Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                }}
                onMouseOver={(e) => {
                    e.currentTarget.style.background = 'var(--bg-row-hover)';
                }}
                onMouseOut={(e) => {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                }}
            >
                {currentPage.label}
                <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="currentColor"
                    style={{
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                    }}
                >
                    <path d="M6 8L2 4h8z" />
                </svg>
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '48px',
                    left: '0',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5), 0 4px 6px -2px rgba(0,0,0,0.3)',
                    border: '1px solid var(--border-color)',
                    minWidth: '160px',
                    zIndex: 1000,
                    overflow: 'hidden',
                }}>
                    {pages.map(page => (
                        <button
                            key={page.path}
                            onClick={() => handlePageSelect(page.path)}
                            style={{
                                width: '100%',
                                padding: '0.75rem 1rem',
                                textAlign: 'left',
                                background: location.pathname === page.path ? 'var(--bg-row-hover)' : 'transparent',
                                border: 'none',
                                color: location.pathname === page.path ? 'var(--accent-blue)' : 'var(--text-primary)',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                fontWeight: location.pathname === page.path ? '600' : '400',
                                transition: 'all 0.2s',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.background = 'var(--bg-row-hover)';
                            }}
                            onMouseOut={(e) => {
                                if (location.pathname !== page.path) {
                                    e.currentTarget.style.background = 'transparent';
                                }
                            }}
                        >
                            {page.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
