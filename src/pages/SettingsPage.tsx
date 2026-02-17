import { useSettings } from '../context/SettingsContext';
import { useState, useEffect } from 'react';
import { setApiKey, hasApiKey, fetchStandings, fetchFixtures, checkQuota } from '../services/apiFootball';
import { addCustomLeague, removeCustomLeague, resetLeaguesToDefault } from '../services/leagueRegistry';
import type { LeagueConfig } from '../types';
import LeagueEditor from '../components/LeagueEditor';


interface SettingsPageProps {
    onLeagueAdded?: () => void;
    onKeySaved?: () => void;
    leagues?: Record<string, LeagueConfig>;
}

export default function SettingsPage({ onLeagueAdded, onKeySaved, leagues = {} }: SettingsPageProps) {
    const { settings, toggleSetting, setTheme } = useSettings();
    const [key, setKey] = useState('');
    const [saved, setSaved] = useState(false);
    const [quota, setQuota] = useState<{ current: number; limit: number } | null>(null);

    // Import State
    const [importId, setImportId] = useState('');
    const [importSeason, setImportSeason] = useState('2024');
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importSuccess, setImportSuccess] = useState<string | null>(null);

    // Editor State
    const [editingLeague, setEditingLeague] = useState<LeagueConfig | null>(null);
    const [isCreating, setIsCreating] = useState(false);


    useEffect(() => {
        // Load existing key from localStorage on mount
        const current = localStorage.getItem('ultratable_api_key');
        if (current) setKey(current);

        // Load quota info
        checkQuota().then(setQuota).catch(() => setQuota(null));
    }, []);

    const handleSaveKey = () => {
        setApiKey(key);
        setSaved(true);
        if (onKeySaved) onKeySaved();
        setTimeout(() => setSaved(false), 2000);
    };

    const handleImport = async () => {
        if (!key && !hasApiKey()) {
            setImportError('Please save an API Key first.');
            return;
        }

        const leagueId = parseInt(importId);
        const season = parseInt(importSeason);

        if (isNaN(leagueId) || isNaN(season)) {
            setImportError('Invalid League ID or Season');
            return;
        }

        if (season < 2000 || season > 2100) {
            setImportError('Season must be a 4-digit year (e.g. 2024)');
            return;
        }

        setImporting(true);
        setImportError(null);
        setImportSuccess(null);

        try {
            // 1. Fetch data to verify and get name
            await fetchStandings({ id: leagueId, season });

            let leagueName = `League ${leagueId}`;

            // const fixtures = await fetchFixtures(leagueId, season);
            // if (fixtures.length > 0) {
            //    // leagueName = (fixtures[0] as any).league?.name || leagueName;
            // }
            const fixtures = await fetchFixtures({ id: leagueId, season });


            // 2. Default Rules
            const config: LeagueConfig = {
                id: leagueId,
                name: leagueName,
                season: season,
                matchesPerSeason: fixtures.length,
                rules: {
                    promotionSlots: 2,
                    playoffStart: 3,
                    playoffEnd: 6,
                    relegationStart: 18,
                    pointsForWin: 3,
                    pointsForDraw: 1,
                    pointsForLoss: 0,
                },
                integrations: {
                    fixtures: 'api-football',
                    standings: 'api-football',
                    basicTeamInfo: 'api-football',
                    roster: 'api-football',
                    playerStats: 'api-football',
                    teamStats: 'api-football',
                    teamLogos: 'api-football',
                    playerPhotos: 'api-football',
                }
            };

            // 3. Save
            await addCustomLeague(config);


            // 4. Notify Parent
            if (onLeagueAdded) onLeagueAdded();

            setImportSuccess(`Successfully imported ${leagueName} (${season})`);
            setImportId('');
        } catch (err) {
            console.error(err);
            setImportError(err instanceof Error ? err.message : 'Failed to import league');
        } finally {
            setImporting(false);
        }
    };

    const handleDelete = async (config: LeagueConfig) => {
        if (confirm(`Are you sure you want to remove ${config.name} (${config.season})? This cannot be undone.`)) {
            await removeCustomLeague(config);
            if (onLeagueAdded) onLeagueAdded(); // Trigger refresh
        }
    };



    const handleSaveLeague = async (config: LeagueConfig) => {
        await addCustomLeague(config);
        setEditingLeague(null);
        setIsCreating(false);
        if (onLeagueAdded) onLeagueAdded();
    };


    const handleResetDefaults = async () => {
        if (confirm('Are you sure? This will delete all custom leagues and edits, restoring the original defaults.')) {
            await resetLeaguesToDefault();
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
                    <p className="settings-section__desc">
                        Required for real-world data.
                        Get a free key at <a href="https://dashboard.api-football.com" target="_blank" rel="noreferrer">api-football.com</a>.
                    </p>
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
                        <div style={{
                            marginTop: '12px',
                            padding: '12px',
                            background: quota.current > quota.limit * 0.8 ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                            border: `1px solid ${quota.current > quota.limit * 0.8 ? 'var(--accent-orange)' : 'var(--border-color)'}`,
                            borderRadius: '6px',
                            fontSize: '0.9rem',
                            color: quota.current > quota.limit * 0.8 ? 'var(--accent-orange)' : 'var(--text-secondary)',
                        }}>
                            📊 API Usage: {quota.current}/{quota.limit} requests today
                            {quota.current > quota.limit * 0.8 && (
                                <span style={{ marginLeft: '8px', fontWeight: 600 }}>
                                    (⚠️ {Math.round((quota.current / quota.limit) * 100)}% used)
                                </span>
                            )}
                        </div>
                    )}
                </section>

                {/* Section: Managed Data */}
                <section className="settings-section">
                    <h2 className="settings-section__title">Managed Data</h2>
                    <p className="settings-section__desc">
                        Manage your imported leagues and seasons.
                    </p>

                    {/* Import Form */}
                    <div className="settings-card" style={{ padding: '20px', marginBottom: '20px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem' }}>Import New Season</h3>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '140px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>League ID</label>
                                <input
                                    type="text"
                                    className="settings-input"
                                    placeholder="e.g. 39 (Premier League)"
                                    value={importId}
                                    onChange={(e) => setImportId(e.target.value)}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div style={{ width: '100px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Season</label>
                                <input
                                    type="text"
                                    className="settings-input"
                                    placeholder="YYYY"
                                    value={importSeason}
                                    onChange={(e) => setImportSeason(e.target.value)}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <button
                                className="btn btn--primary"
                                onClick={handleImport}
                                disabled={importing || !importId}
                                style={{ height: '42px' }}
                            >
                                {importing ? 'Importing...' : 'Import'}
                            </button>
                        </div>
                        {importError && (
                            <div style={{ marginTop: '12px', color: 'var(--accent-red)', fontSize: '0.9rem' }}>
                                ⚠️ {importError}
                            </div>
                        )}
                        {importSuccess && (
                            <div style={{ marginTop: '12px', color: 'var(--accent-green)', fontSize: '0.9rem' }}>
                                ✅ {importSuccess}
                            </div>
                        )}
                    </div>

                    {/* League Editor */}
                    {(editingLeague || isCreating) && (
                        <div style={{ marginBottom: '20px' }}>
                            <LeagueEditor
                                initialConfig={editingLeague || undefined}
                                onSave={handleSaveLeague}
                                onCancel={() => {
                                    setEditingLeague(null);
                                    setIsCreating(false);
                                }}
                            />
                        </div>
                    )}

                    {!editingLeague && !isCreating && (
                        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                                className="btn"
                                onClick={handleResetDefaults}
                                style={{ fontSize: '0.8rem' }}
                            >
                                ↺ Reset to Defaults
                            </button>
                            <button
                                className="btn btn--primary"
                                onClick={() => setIsCreating(true)}
                            >
                                + Create Manual League
                            </button>
                        </div>
                    )}


                    {/* League List */}
                    <div className="settings-list" style={{ gap: '1px', background: 'var(--border-color)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                        {Object.values(leagues).length === 0 && (
                            <div style={{ padding: '20px', background: 'var(--bg-surface)', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                No leagues imported yet.
                            </div>
                        )}
                        {Object.values(leagues).map((l) => (
                            <div key={`${l.id}_${l.season}`} style={{ padding: '16px 20px', background: 'var(--bg-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{l.name}</div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        Season {l.season} • ID: {l.id} • {l.matchesPerSeason} Matches
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        className="btn"
                                        onClick={() => setEditingLeague(l)}
                                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        className="btn btn--danger"
                                        onClick={() => handleDelete(l)}
                                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                    >
                                        Remove
                                    </button>
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
