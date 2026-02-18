import { useState, useEffect } from 'react';
import type { League, LeagueSeason, LeagueRankingFormula, PointModification, Team } from '../types';
import { nanoid } from 'nanoid';
import PointModificationEditor from './PointModificationEditor';
import { database } from '../services/db';

interface LeagueEditorProps {
    initialLeague?: League;
    initialSeason?: LeagueSeason;
    onSaveLeague?: (league: League) => void;
    onSaveSeason?: (season: LeagueSeason) => void;
    onCancel: () => void;
}

export default function LeagueEditor({
    initialLeague,
    initialSeason,
    onSaveLeague,
    onSaveSeason,
    onCancel
}: LeagueEditorProps) {
    const isEditingSeason = !!initialSeason;
    const isEditingLeague = !!initialLeague || (!initialLeague && !initialSeason && !!onSaveLeague);

    // Root League Fields
    const [commonName, setCommonName] = useState(initialLeague?.commonName || initialSeason?.commonName || '');
    const [logo, setLogo] = useState(initialLeague?.logo || '');
    const [banner, setBanner] = useState(initialLeague?.banner || '');
    const [rulesJson, setRulesJson] = useState(JSON.stringify(initialLeague?.rules || {
        promotionSlots: 2, playoffStart: 3, playoffEnd: 6, relegationStart: 18,
        pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0
    }, null, 2));
    const [criteria, setCriteria] = useState<string>((initialLeague?.rankingCriteria || ['points', 'goalDiff', 'wins']).join(', '));

    // Season Fields
    const [seasonRulesJson, setSeasonRulesJson] = useState(initialLeague?.rules || initialSeason?.rules ? JSON.stringify((initialSeason?.rules || initialLeague?.rules), null, 2) : '');
    const [seasonCriteria, setSeasonCriteria] = useState(initialSeason?.rankingCriteria ? initialSeason.rankingCriteria.join(', ') : '');

    // Point Modifications
    const [modifications, setModifications] = useState<PointModification[]>(
        (isEditingSeason ? initialSeason?.rules?.pointModifications : initialLeague?.rules?.pointModifications) || []
    );

    // Team Cache for selection
    const [availableTeams, setAvailableTeams] = useState<Team[]>([]);

    useEffect(() => {
        const loadTeams = async () => {
            if (isEditingSeason && initialSeason) {
                const teams = await database.getTeamsForSeason(initialSeason.id);
                setAvailableTeams(teams);
            } else if (isEditingLeague && initialLeague) {
                const teams = await database.getTeamsForLeague(initialLeague.id);
                setAvailableTeams(teams);
            }
        };
        loadTeams();
    }, [initialSeason, isEditingSeason, initialLeague, isEditingLeague]);

    const [error, setError] = useState<string | null>(null);

    const handleSave = () => {
        try {
            setError(null);
            if (isEditingLeague && onSaveLeague) {
                if (!commonName) throw new Error('Name is required');
                const rules = JSON.parse(rulesJson);
                rules.pointModifications = modifications;

                const league: League = {
                    ...(initialLeague || { id: nanoid(), externalReferences: [], integrations: { fixtures: 'api-football', standings: 'api-football', basicTeamInfo: 'api-football', roster: 'api-football', teamStats: 'api-football', playerStats: 'api-football', teamLogos: 'api-football', playerPhotos: 'api-football' } }),
                    commonName,
                    logo: logo || null,
                    banner: banner || null,
                    rules,
                    rankingCriteria: criteria.split(',').map(c => c.trim()) as LeagueRankingFormula[],
                    lastRefreshed: new Date().toISOString()
                };
                onSaveLeague(league);
            } else if (isEditingSeason && onSaveSeason) {
                const rules = seasonRulesJson ? JSON.parse(seasonRulesJson) : initialLeague?.rules || {};
                rules.pointModifications = modifications;

                const season: LeagueSeason = {
                    ...initialSeason!,
                    commonName: commonName || initialSeason!.commonName,
                    rules,
                    rankingCriteria: seasonCriteria ? seasonCriteria.split(',').map(c => c.trim()) as LeagueRankingFormula[] : undefined,
                    lastRefreshed: new Date().toISOString()
                };
                onSaveSeason(season);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Invalid configuration');
        }
    };

    return (
        <div className="league-editor" style={{ background: 'var(--bg-secondary)', padding: '24px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
            <h3 style={{ marginTop: 0 }}>{isEditingLeague ? (initialLeague ? 'Edit League' : 'New League') : 'Configure Season'}</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Display Name</label>
                    <input className="settings-input" value={commonName} onChange={e => setCommonName(e.target.value)} style={{ width: '100%' }} />
                </div>
                {isEditingLeague && (
                    <>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Logo URL</label>
                            <input className="settings-input" value={logo} onChange={e => setLogo(e.target.value)} placeholder="/assets/leagues/..." style={{ width: '100%' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Banner URL</label>
                            <input className="settings-input" value={banner} onChange={e => setBanner(e.target.value)} placeholder="/assets/leagues/..." style={{ width: '100%' }} />
                        </div>
                    </>
                )}
            </div>

            <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>{isEditingLeague ? 'Default Rules (JSON)' : 'Override Rules (JSON - Optional)'}</label>
                <textarea
                    className="settings-input"
                    value={isEditingLeague ? rulesJson : seasonRulesJson}
                    onChange={e => isEditingLeague ? setRulesJson(e.target.value) : setSeasonRulesJson(e.target.value)}
                    style={{ width: '100%', height: '120px', fontFamily: 'monospace' }}
                    placeholder={isEditingLeague ? '' : 'Leave empty to inherit from league...'}
                />
            </div>

            <PointModificationEditor
                modifications={modifications}
                availableTeams={availableTeams}
                onChange={setModifications}
            />

            <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>{isEditingLeague ? 'Default Ranking Criteria' : 'Override Ranking Criteria (Optional)'}</label>
                <input
                    className="settings-input"
                    value={isEditingLeague ? criteria : seasonCriteria}
                    onChange={e => isEditingLeague ? setCriteria(e.target.value) : setSeasonCriteria(e.target.value)}
                    style={{ width: '100%' }}
                    placeholder="points, goalDiff, wins, headToHead..."
                />
            </div>

            {error && <div style={{ color: 'var(--accent-red)', marginBottom: '16px', fontSize: '0.9rem' }}>⚠️ {error}</div>}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button className="btn" onClick={onCancel}>Cancel</button>
                <button className="btn btn--primary" onClick={handleSave}>Save {isEditingLeague ? 'League' : 'Season'}</button>
            </div>
        </div>
    );
}
