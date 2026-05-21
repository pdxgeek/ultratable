import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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

interface Position {
    x: number;
    y: number;
}

const POSITION_STORAGE_KEY = 'devLoginTools.position';
const HIDDEN_SESSION_KEY = 'devLoginTools.hidden';
const PANEL_WIDTH = 320;
const PANEL_HEIGHT_FALLBACK = 400;
const EDGE_MARGIN = 20;

const IS_MAC =
    typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const HOTKEY_HINT = IS_MAC ? '⌘⇧D' : 'Ctrl+Shift+D';

function defaultPosition(): Position {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    return {
        x: Math.max(0, window.innerWidth - PANEL_WIDTH - EDGE_MARGIN),
        y: Math.max(0, window.innerHeight - PANEL_HEIGHT_FALLBACK - EDGE_MARGIN),
    };
}

function clampToViewport(pos: Position, width: number, height: number): Position {
    if (typeof window === 'undefined') return pos;
    return {
        x: Math.max(0, Math.min(pos.x, window.innerWidth - width)),
        y: Math.max(0, Math.min(pos.y, window.innerHeight - height)),
    };
}

function loadPosition(): Position {
    try {
        const raw = localStorage.getItem(POSITION_STORAGE_KEY);
        if (!raw) return defaultPosition();
        const parsed = JSON.parse(raw) as Partial<Position>;
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
            return clampToViewport(
                { x: parsed.x, y: parsed.y },
                PANEL_WIDTH,
                PANEL_HEIGHT_FALLBACK,
            );
        }
    } catch {
        /* fall through to default */
    }
    return defaultPosition();
}

function loadHidden(): boolean {
    try {
        return sessionStorage.getItem(HIDDEN_SESSION_KEY) === '1';
    } catch {
        return false;
    }
}

function isEditableTarget(el: Element | null): boolean {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return el.isContentEditable;
}

export function DevLoginTools() {
    const [session, setSession] = useState<DevAuthSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [position, setPosition] = useState<Position>(loadPosition);
    const [hidden, setHidden] = useState<boolean>(loadHidden);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const dragStateRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(
        null,
    );

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

    useEffect(() => {
        try {
            localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
        } catch {
            /* localStorage may be unavailable (private mode, etc.) — non-fatal */
        }
    }, [position]);

    useEffect(() => {
        try {
            if (hidden) sessionStorage.setItem(HIDDEN_SESSION_KEY, '1');
            else sessionStorage.removeItem(HIDDEN_SESSION_KEY);
        } catch {
            /* sessionStorage may be unavailable — non-fatal */
        }
    }, [hidden]);

    useEffect(() => {
        const handleResize = () => {
            setPosition((current) =>
                clampToViewport(
                    current,
                    panelRef.current?.offsetWidth ?? PANEL_WIDTH,
                    panelRef.current?.offsetHeight ?? PANEL_HEIGHT_FALLBACK,
                ),
            );
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
            if (e.key !== 'D' && e.key !== 'd') return;
            if (isEditableTarget(document.activeElement)) return;
            e.preventDefault();
            setHidden((h) => !h);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        const rect = panelRef.current?.getBoundingClientRect();
        if (!rect) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragStateRef.current = {
            pointerId: e.pointerId,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
        };
    };

    const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragStateRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        setPosition(
            clampToViewport(
                { x: e.clientX - drag.offsetX, y: e.clientY - drag.offsetY },
                panelRef.current?.offsetWidth ?? PANEL_WIDTH,
                panelRef.current?.offsetHeight ?? PANEL_HEIGHT_FALLBACK,
            ),
        );
    };

    const handleHeaderPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragStateRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        dragStateRef.current = null;
    };

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
    if (hidden) return null;

    return (
        <Card
            ref={panelRef}
            className="fixed z-[9999] w-80 max-h-[400px] overflow-hidden bg-[#1a1a1a] border border-[#333] ring-0 rounded-lg text-white font-mono shadow-lg gap-0 py-0"
            style={{ left: position.x, top: position.y }}
        >
            <div
                onPointerDown={handleHeaderPointerDown}
                onPointerMove={handleHeaderPointerMove}
                onPointerUp={handleHeaderPointerEnd}
                onPointerCancel={handleHeaderPointerEnd}
                className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 border-b border-[#333] cursor-move select-none touch-none"
            >
                <h3 className="m-0 text-sm">🛠️ Dev Auth Tools</h3>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#a4b0be]">{HOTKEY_HINT} to toggle</span>
                    <button
                        type="button"
                        aria-label="Close dev auth tools"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => setHidden(true)}
                        className="text-[#a4b0be] hover:text-white transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="p-4 overflow-y-auto">
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
            </div>
        </Card>
    );
}
