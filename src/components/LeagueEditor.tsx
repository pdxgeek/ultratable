import { useState, useEffect } from 'react';
import type { LeagueConfig } from '../types';

interface LeagueEditorProps {
    initialConfig?: LeagueConfig;
    onSave: (config: LeagueConfig) => void;
    onCancel: () => void;
}

export default function LeagueEditor({ initialConfig, onSave, onCancel }: LeagueEditorProps) {
    // Basic fields
    const [name, setName] = useState(initialConfig?.name || '');
    const [season, setSeason] = useState(initialConfig?.season?.toString() || new Date().getFullYear().toString());
    const [id, setId] = useState(initialConfig?.id?.toString() || '');
    const [matchesPerSeason, setMatchesPerSeason] = useState(initialConfig?.matchesPerSeason?.toString() || '38');

    // JSON fields
    const [rulesJson, setRulesJson] = useState('');
    const [integrationsJson, setIntegrationsJson] = useState('');

    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (initialConfig) {
            setRulesJson(JSON.stringify(initialConfig.rules, null, 2));
            setIntegrationsJson(JSON.stringify(initialConfig.integrations, null, 2));
        } else {
            // Defaults for new league
            setRulesJson(JSON.stringify({
                promotionSlots: 2,
                playoffStart: 3,
                playoffEnd: 6,
                relegationStart: 18,
                pointsForWin: 3,
                pointsForDraw: 1,
                pointsForLoss: 0,
            }, null, 2));
            setIntegrationsJson(JSON.stringify({
                fixtures: 'mock-scifi',
                standings: 'mock-scifi',
                basicTeamInfo: 'mock-scifi',
                roster: 'mock-scifi',
                playerStats: 'mock-scifi',
                teamStats: 'mock-scifi',
                teamLogos: 'mock-scifi',
                playerPhotos: 'mock-scifi',
            }, null, 2));
        }
    }, [initialConfig]);

    const handleSave = () => {
        try {
            setError(null);

            // Validate Basic Fields
            if (!name) throw new Error('Name is required');
            if (!season || isNaN(parseInt(season))) throw new Error('Valid Season Year is required');
            if (!id || isNaN(parseInt(id))) throw new Error('Valid numeric ID is required');
            if (!matchesPerSeason || isNaN(parseInt(matchesPerSeason))) throw new Error('Matches per Season is required');

            // Validate JSON
            let rules;
            try {
                rules = JSON.parse(rulesJson);
            } catch {
                throw new Error('Invalid JSON in Rules section');
            }

            let integrations;
            try {
                integrations = JSON.parse(integrationsJson);
            } catch {
                throw new Error('Invalid JSON in Integrations section');
            }

            const config: LeagueConfig = {
                id: parseInt(id),
                name,
                season: parseInt(season),
                matchesPerSeason: parseInt(matchesPerSeason),
                rules,
                integrations
            };

            onSave(config);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        }
    };

    return (
        <div className="league-editor" style={{
            background: 'var(--bg-secondary)',
            padding: '20px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            marginTop: '20px'
        }}>
            <h3 style={{ marginTop: 0 }}>{initialConfig ? 'Edit League' : 'Add New League'}</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>League Name</label>
                    <input
                        className="settings-input"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g. Galactic Premier League"
                        style={{ width: '100%' }}
                    />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>League ID (Numeric)</label>
                    <input
                        className="settings-input"
                        value={id}
                        onChange={e => setId(e.target.value)}
                        placeholder="e.g. 9999"
                        disabled={!!initialConfig} // Start with ID read-only if editing, though user asked to edit *any* league, changing ID changes identity. Let's allow it for new, maybe restrict for existing to avoid key issues?
                        // Actually, if they change ID, it's effectively a new league. For now, let's keep it simple.
                        style={{ width: '100%' }}
                    />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Season</label>
                    <input
                        className="settings-input"
                        value={season}
                        onChange={e => setSeason(e.target.value)}
                        placeholder="e.g. 2024"
                        style={{ width: '100%' }}
                    />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Matches Per Season</label>
                    <input
                        className="settings-input"
                        value={matchesPerSeason}
                        onChange={e => setMatchesPerSeason(e.target.value)}
                        placeholder="e.g. 38"
                        style={{ width: '100%' }}
                    />
                </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                    Rules (JSON)
                    <span style={{ fontWeight: 400, marginLeft: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Configure points, promotion, relegation
                    </span>
                </label>
                <textarea
                    className="settings-input"
                    value={rulesJson}
                    onChange={e => setRulesJson(e.target.value)}
                    style={{ width: '100%', height: '150px', fontFamily: 'monospace', fontSize: '0.9rem' }}
                />
            </div>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                    Integrations (JSON)
                    <span style={{ fontWeight: 400, marginLeft: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Configure data sources (api-football, mock-scifi, etc)
                    </span>
                </label>
                <textarea
                    className="settings-input"
                    value={integrationsJson}
                    onChange={e => setIntegrationsJson(e.target.value)}
                    style={{ width: '100%', height: '150px', fontFamily: 'monospace', fontSize: '0.9rem' }}
                />
            </div>

            {error && (
                <div style={{ color: 'var(--accent-red)', marginBottom: '16px', padding: '10px', background: 'rgba(255,0,0,0.1)', borderRadius: '4px' }}>
                    ⚠️ {error}
                </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button className="btn" onClick={onCancel}>Cancel</button>
                <button className="btn btn--primary" onClick={handleSave}>Save League</button>
            </div>
        </div>
    );
}
