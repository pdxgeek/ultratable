import { useSettings } from '../context/SettingsContext';
import { useState, useEffect } from 'react';
import { setApiKey, fetchStandings, fetchFixtures, checkQuota } from '../services/apiFootball';
import { addCustomLeague, addCustomSeason, resetLeaguesToDefault, removeCustomLeague, removeCustomSeason } from '../services/leagueRegistry';
import type { League, LeagueSeason } from '../types';
import LeagueEditor from '../components/LeagueEditor';
import { database } from '../services/db';
import { nanoid } from 'nanoid';

interface SettingsPageProps {
    onLeagueAdded?: () => void;
    onKeySaved?: () => void;
    leagues?: League[];
}

export default function SettingsPage({ onLeagueAdded, onKeySaved, leagues = [] }: SettingsPageProps) {
    const { settings, toggleSetting, setTheme } = useSettings();
    const [key, setKey] = useState('');
    const [saved, setSaved] = useState(false);
    const [quota, setQuota] = useState<{ current: number; limit: number } | null>(null);

    // Import State
    const [importId, setImportId] = useState('');
    const [importSeason, setImportSeason] = useState('2024');
    const [selectedLeagueId, setSelectedLeagueId] = useState<string>('');
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importSuccess, setImportSuccess] = useState<string | null>(null);

    // Editor State
    const [editingLeague, setEditingLeague] = useState<League | null>(null);
    const [editingSeason, setEditingSeason] = useState<LeagueSeason | null>(null);
    const [isCreatingLeague, setIsCreatingLeague] = useState(false);

    // Season list cache for the UI
    const [seasonsMap, setSeasonsMap] = useState<Record<string, LeagueSeason[]>>({});

    useEffect(() => {
        const current = localStorage.getItem('ultratable_api_key');
        if (current) setKey(current);
        checkQuota().then(setQuota).catch(() => setQuota(null));
    }, []);

    useEffect(() => {
        const loadSeasons = async () => {
            const map: Record<string, LeagueSeason[]> = {};
            for (const l of leagues) {
                map[l.id] = await database.getSeasonsForLeague(l.id);
            }
            setSeasonsMap(map);
        };
        loadSeasons();
    }, [leagues]);

    const handleSaveKey = () => {
        setApiKey(key);
        setSaved(true);
        if (onKeySaved) onKeySaved();
        setTimeout(() => setSaved(false), 2000);
    };

    const handleImport = async () => {
        if (!selectedLeagueId) {
            setImportError('Please select a League first.');
            return;
        }

        const league = leagues.find(l => l.id === selectedLeagueId);
        if (!league) return;

        const apiLeagueId = parseInt(importId);
        const seasonYear = parseInt(importSeason);

        if (isNaN(apiLeagueId) || isNaN(seasonYear)) {
            setImportError('Invalid ID or Season');
            return;
        }

        setImporting(true);
        setImportError(null);
        setImportSuccess(null);

        try {
            // Reconstruct config for API verification
            const verifyConfig = {
                id: apiLeagueId,
                season: seasonYear,
                integrations: league.integrations
            } as any;

            await fetchStandings(verifyConfig);
            const fixtures = await fetchFixtures(verifyConfig);

            const newSeason: LeagueSeason = {
                id: nanoid(),
                leagueId: league.id,
                commonName: `${league.commonName} ${seasonYear}`,
                season: seasonYear,
                matchesPerSeason: fixtures.length,
                externalReferences: [{ integrationName: 'api-football', remoteId: String(apiLeagueId) }],
                lastRefreshed: new Date().toISOString()
            };

            await addCustomSeason(newSeason);
            if (onLeagueAdded) onLeagueAdded();
            setImportSuccess(`Successfully imported ${seasonYear} for ${league.commonName}`);
            setImportId('');
        } catch (err) {
            console.error(err);
            setImportError(err instanceof Error ? err.message : 'Failed to import season');
        } finally {
            setImporting(false);
        }
    };

    const handleSaveLeague = async (league: League) => {
        await addCustomLeague(league);
        setEditingLeague(null);
        setIsCreatingLeague(false);
        if (onLeagueAdded) onLeagueAdded();
    };

    const handleRemoveLeague = async (id: string, name: string) => {
        if (confirm(`Are you sure you want to remove the entire "${name}" league? This will delete all its seasons and data.`)) {
            await removeCustomLeague(id);
            if (onLeagueAdded) onLeagueAdded();
        }
    };

    const handleReset = async () => {
        if (confirm('This will delete all custom leagues and reset to defaults. Continue?')) {
            await resetLeaguesToDefault();
            if (onLeagueAdded) onLeagueAdded();
        }
    };

    const handleRemoveSeason = async (id: string, name: string) => {
        if (confirm(`Remove the ${name} season?`)) {
            await removeCustomSeason(id);
            if (onLeagueAdded) onLeagueAdded();
        }
    };

    return (
        <div className="page settings-page">
            <h1 className="page__title">Settings</h1>

            <div className="settings-container">
                {/* Section: API Configuration */}
                <section className="settings-section">
                    <h2 className="settings-section__title">API Configuration</h2>
                    <div className="api-key-input-group">
                        <input
                            type="text"
                            className="settings-input"
                            placeholder="Enter x-apisports-key..."
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                        />
                        <button className="btn btn--primary" onClick={handleSaveKey}>
                            {saved ? 'Saved!' : 'Save Key'}
                        </button>
                    </div>
                    {quota && (
                        <div style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            API Quota: <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{quota.current} / {quota.limit}</span> requests used today.
                        </div>
                    )}
                </section>

                {/* Section: Leagues & Seasons */}
                <section className="settings-section">
                    <h2 className="settings-section__title">League Hierarchy</h2>

                    {/* Create League Flow */}
                    {!isCreatingLeague && !editingLeague && (
                        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button className="btn" onClick={handleReset}>↺ Reset Defaults & Repair</button>
                            <button className="btn btn--primary" onClick={() => setIsCreatingLeague(true)}>+ Create Root League</button>
                        </div>
                    )}

                    {(isCreatingLeague || editingLeague || editingSeason) && (
                        <div style={{ marginBottom: '20px' }}>
                            <LeagueEditor
                                initialLeague={editingLeague || undefined}
                                initialSeason={editingSeason || undefined}
                                onSaveLeague={handleSaveLeague}
                                onSaveSeason={async (s) => {
                                    await addCustomSeason(s);
                                    setEditingSeason(null);
                                    if (onLeagueAdded) onLeagueAdded();
                                }}
                                onCancel={() => {
                                    setEditingLeague(null);
                                    setEditingSeason(null);
                                    setIsCreatingLeague(false);
                                }}
                            />
                        </div>
                    )}

                    {/* Import Season into League */}
                    <div className="settings-card" style={{ padding: '20px', marginBottom: '20px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem' }}>Import Season to League</h3>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div style={{ flex: 2, minWidth: '180px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600 }}>Target League</label>
                                <select
                                    className="settings-input"
                                    value={selectedLeagueId}
                                    onChange={e => setSelectedLeagueId(e.target.value)}
                                    style={{ width: '100%' }}
                                >
                                    <option value="">Select a league...</option>
                                    {leagues.map(l => (
                                        <option key={l.id} value={l.id}>{l.commonName}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ flex: 1, minWidth: '120px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600 }}>API-Football ID</label>
                                <input
                                    type="text"
                                    className="settings-input"
                                    value={importId}
                                    onChange={(e) => setImportId(e.target.value)}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div style={{ width: '90px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600 }}>Year</label>
                                <input
                                    type="text"
                                    className="settings-input"
                                    value={importSeason}
                                    onChange={(e) => setImportSeason(e.target.value)}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <button
                                className="btn btn--primary"
                                onClick={handleImport}
                                disabled={importing || !importId || !selectedLeagueId}
                                style={{ height: '42px' }}
                            >
                                {importing ? '...' : 'Import'}
                            </button>
                        </div>
                        {importError && <div style={{ marginTop: '12px', color: 'var(--accent-red)', fontSize: '0.85rem' }}>⚠️ {importError}</div>}
                        {importSuccess && <div style={{ marginTop: '12px', color: 'var(--accent-green)', fontSize: '0.85rem' }}>✅ {importSuccess}</div>}
                    </div>

                    {/* Hierarchical List */}
                    <div className="league-hierarchy-list" style={{ background: 'var(--border-color)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        {leagues.length === 0 && (
                            <div style={{ padding: '30px', background: 'var(--bg-surface)', textAlign: 'center', color: 'var(--text-secondary)' }}>No leagues defined.</div>
                        )}
                        {leagues.map(l => (
                            <div key={l.id} style={{ background: 'var(--bg-surface)' }}>
                                <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--bg-tertiary)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {l.logo && <img src={l.logo} style={{ width: '32px', height: '32px', objectFit: 'contain' }} alt="" />}
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{l.commonName}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Root Entity • ID: {l.id}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className="btn btn--secondary" onClick={() => setEditingLeague(l)} style={{ fontSize: '0.75rem', padding: '4px 10px' }}>Edit League</button>
                                        <button className="btn btn--danger" onClick={() => handleRemoveLeague(l.id, l.commonName)} style={{ fontSize: '0.75rem', padding: '4px 10px' }}>Remove</button>
                                    </div>
                                </div>
                                <div style={{ padding: '10px 20px 20px 64px' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Seasons</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {seasonsMap[l.id]?.length === 0 && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No seasons imported.</div>}
                                        {seasonsMap[l.id]?.map(s => (
                                            <div key={s.id} style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-color)' }}>
                                                <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{s.season} Season <span style={{ color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '8px' }}>({s.matchesPerSeason} matches)</span></div>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button className="btn" onClick={() => setEditingSeason(s)} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>Config</button>
                                                    <button className="btn btn--danger" onClick={() => handleRemoveSeason(s.id, s.commonName)} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>Remove</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Section: Display */}
                <section className="settings-section">
                    <h2 className="settings-section__title">Display Options</h2>
                    <div className="settings-row">
                        <div className="setting-card">
                            <div className="setting-card__header">
                                <span className="setting-card__title">Zone Indicators</span>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={settings.showZones}
                                        onChange={() => toggleSetting('showZones')}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                            <p className="setting-card__desc">Highlight promotion and relegation zones in the table.</p>
                        </div>

                        <div className="setting-card">
                            <div className="setting-card__header">
                                <span className="setting-card__title">Form Guide</span>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={settings.showForm}
                                        onChange={() => toggleSetting('showForm')}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                            <p className="setting-card__desc">Show the last 5 match results (W/D/L) for each team.</p>
                        </div>

                        <div className="setting-card">
                            <div className="setting-card__header">
                                <span className="setting-card__title">Team Logos</span>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={settings.showLogos}
                                        onChange={() => toggleSetting('showLogos')}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                            <p className="setting-card__desc">Display team badges next to names in the standings.</p>
                        </div>

                        <div className="setting-card">
                            <div className="setting-card__header">
                                <span className="setting-card__title">Match Dates</span>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={settings.showDates}
                                        onChange={() => toggleSetting('showDates')}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                            <p className="setting-card__desc">Show dates for upcoming matches in the 'Next' column.</p>
                        </div>

                        <div className="setting-card">
                            <div className="setting-card__header">
                                <span className="setting-card__title">Match Popups</span>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={settings.showHovers}
                                        onChange={() => toggleSetting('showHovers')}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                            <p className="setting-card__desc">Enable detailed popup previews when hovering over matches.</p>
                        </div>
                    </div>
                </section>

                {/* Section: Appearance */}
                <section className="settings-section">
                    <h2 className="settings-section__title">Appearance</h2>
                    <div className="settings-list">
                        <label className="setting-item setting-item--select">
                            <span className="setting-item__label">Theme</span>
                            <select
                                className="settings-select"
                                value={settings.theme}
                                onChange={(e) => setTheme(e.target.value as any)}
                            >
                                <option value="dark">Dark Mode</option>
                                <option value="light">Light Mode</option>
                            </select>
                        </label>
                    </div>
                </section>

                {/* Section: Debugging */}
                <section className="settings-section">
                    <h2 className="settings-section__title">Support & Debugging</h2>
                    <div className="settings-card" style={{ padding: '20px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
                        <p className="settings-section__desc">
                            If you are experiencing issues, use the Flight Recorder to export logs or clear local cache.
                        </p>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
                            <button
                                className="btn"
                                onClick={async () => {
                                    // Dynamic import to avoid circular dependency issues if any
                                    const { debugLogger } = await import('../services/debugLogger');
                                    const logs = debugLogger.export();
                                    navigator.clipboard.writeText(logs);
                                    alert('Logs copied to clipboard!');
                                }}
                            >
                                📋 Copy Logs to Clipboard
                            </button>
                            <button
                                className="btn btn--danger"
                                onClick={async () => {
                                    if (confirm('Clear all logs?')) {
                                        const { debugLogger } = await import('../services/debugLogger');
                                        debugLogger.clear();
                                    }
                                }}
                            >
                                🗑️ Clear Logs
                            </button>
                            <button
                                className="btn btn--danger"
                                onClick={async () => {
                                    if (confirm('Clear local cache? This will reset all mock league data, cached images, and require a page refresh.')) {
                                        // Clear mock DB
                                        localStorage.removeItem('ultratable_mock_db_v1');

                                        // Clear all ut_* cache entries
                                        const keysToRemove: string[] = [];
                                        for (let i = 0; i < localStorage.length; i++) {
                                            const key = localStorage.key(i);
                                            if (key?.startsWith('ut_')) {
                                                keysToRemove.push(key);
                                            }
                                        }
                                        keysToRemove.forEach((k) => localStorage.removeItem(k));

                                        // Clear IndexedDB image cache
                                        try {
                                            const dbs = await indexedDB.databases();
                                            for (const db of dbs) {
                                                if (db.name === 'ultratable') {
                                                    indexedDB.deleteDatabase(db.name);
                                                }
                                            }
                                        } catch (e) {
                                            console.warn('Could not clear IndexedDB', e);
                                        }

                                        alert('Cache cleared! Please refresh the page.');
                                    }
                                }}
                            >
                                🧹 Clear Local Cache
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
