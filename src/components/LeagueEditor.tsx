import { useState, useEffect } from 'react';
import type { LeagueConfig, Team } from '../types';
import { fetchTeams } from '../services/apiFootball';

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

    // Point Modification Helper State
    const [teams, setTeams] = useState<Team[]>([]);
    const [isLoadingTeams, setIsLoadingTeams] = useState(false);
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [modPoints, setModPoints] = useState('');
    const [modNote, setModNote] = useState('');

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

    // Fetch teams when league ID/season changes for the helper dropdown
    useEffect(() => {
        if (!id || !season || isNaN(parseInt(id)) || isNaN(parseInt(season))) return;

        let isMounted = true;
        const loadTeams = async () => {
            setIsLoadingTeams(true);
            try {
                // Construct a temporary config to fetch teams
                const tempConfig: LeagueConfig = {
                    id: parseInt(id),
                    name,
                    season: parseInt(season),
                    matchesPerSeason: parseInt(matchesPerSeason) || 38,
                    rules: JSON.parse(rulesJson || '{}'),
                    integrations: JSON.parse(integrationsJson || '{}')
                };
                const fetchedTeams = await fetchTeams(tempConfig);
                if (isMounted) {
                    setTeams(fetchedTeams);
                    if (fetchedTeams.length > 0 && !selectedTeamId) {
                        setSelectedTeamId(fetchedTeams[0].id);
                    }
                }
            } catch (err) {
                console.warn('Failed to fetch teams for helper:', err);
            } finally {
                if (isMounted) setIsLoadingTeams(false);
            }
        };

        loadTeams();
        return () => { isMounted = false; };
    }, [id, season, integrationsJson]); // Re-fetch if integration settings change too

    const addModification = () => {
        try {
            const points = parseInt(modPoints);
            if (isNaN(points)) throw new Error('Points must be a number');
            if (!selectedTeamId) throw new Error('Please select a team');
            if (!modNote) throw new Error('Please enter a note');

            const currentRules = JSON.parse(rulesJson);
            const newMod = {
                teamId: selectedTeamId,
                modification: points,
                note: modNote
            };

            const updatedRules = {
                ...currentRules,
                pointModifications: [
                    ...(currentRules.pointModifications || []),
                    newMod
                ]
            };

            setRulesJson(JSON.stringify(updatedRules, null, 2));
            // Reset helper
            setModPoints('');
            setModNote('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add modification');
        }
    };

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

                {/* Point Modification Helper */}
                <div style={{
                    marginTop: '12px',
                    padding: '12px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.9rem'
                }}>
                    <div style={{ fontWeight: 600, marginBottom: '8px' }}>Add Point Modification Helper</div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: 2, minWidth: '150px' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px' }}>Team</label>
                            <select
                                className="settings-input"
                                value={selectedTeamId}
                                onChange={e => setSelectedTeamId(e.target.value)}
                                style={{ width: '100%' }}
                                disabled={isLoadingTeams || teams.length === 0}
                            >
                                {isLoadingTeams ? (
                                    <option>Loading teams...</option>
                                ) : teams.length === 0 ? (
                                    <option>No teams found</option>
                                ) : (
                                    teams.map(t => (
                                        <option key={t.id} value={t.id}>{t.commonName}</option>
                                    ))
                                )}
                            </select>
                        </div>
                        <div style={{ width: '80px' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px' }}>Points</label>
                            <input
                                className="settings-input"
                                value={modPoints}
                                onChange={e => setModPoints(e.target.value)}
                                placeholder="-3"
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div style={{ flex: 3, minWidth: '150px' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px' }}>Note</label>
                            <input
                                className="settings-input"
                                value={modNote}
                                onChange={e => setModNote(e.target.value)}
                                placeholder="Federation decision"
                                style={{ width: '100%' }}
                            />
                        </div>
                        <button
                            className="btn btn--secondary"
                            onClick={addModification}
                            disabled={isLoadingTeams || teams.length === 0}
                            style={{ height: '38px', padding: '0 12px' }}
                        >
                            Add
                        </button>
                    </div>
                </div>
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
