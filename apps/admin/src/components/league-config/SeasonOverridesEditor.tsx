import React from 'react';
import { RotateCcw } from 'lucide-react';

interface Props {
    configJson: string;
    setConfigJson: (val: string) => void;
    leagueDefaultsJson: string;
    configTeams: Record<string, unknown>[];
    helperTeamId: string;
    setHelperTeamId: (val: string) => void;
    helperPoints: number;
    setHelperPoints: (val: number) => void;
    helperReason: string;
    setHelperReason: (val: string) => void;
}

const labelBase = 'block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2';

export const SeasonOverridesEditor: React.FC<Props> = ({
    configJson, setConfigJson,
    leagueDefaultsJson,
    configTeams,
    helperTeamId, setHelperTeamId,
    helperPoints, setHelperPoints,
    helperReason, setHelperReason,
}) => {
    const appendDeduction = () => {
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(configJson || '{}');
            if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
                throw new Error('Config must be an object');
            }
        } catch {
            alert('Current JSON is invalid. Please fix it before using the helper.');
            return;
        }

        const deductions = Array.isArray(parsed.deductions) ? [...parsed.deductions] : [];
        deductions.push({ teamId: helperTeamId, points: helperPoints, reason: helperReason });
        parsed.deductions = deductions;

        setConfigJson(JSON.stringify(parsed, null, 2));
        setHelperTeamId('');
        setHelperPoints(0);
        setHelperReason('');
    };

    const reset = () => {
        if (!window.confirm('Replace this season\'s overrides with the league defaults? Unsaved changes will be lost.')) return;
        setConfigJson(leagueDefaultsJson);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Season Overrides (JSON)</h4>
                <button
                    type="button"
                    onClick={reset}
                    className="flex items-center gap-2 text-[10px] font-bold text-slate-400 hover:text-amber-400 uppercase tracking-widest transition-colors"
                    title="Replace edits with the league default config"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset to league defaults
                </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                    <label className={labelBase}>Add points adjustment — Team</label>
                    <select
                        value={helperTeamId}
                        onChange={(e) => setHelperTeamId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-all"
                    >
                        <option value="">-- Choose a team --</option>
                        {configTeams.map((t) => (
                            <option key={t.id as string} value={t.id as string}>{t.name as string}</option>
                        ))}
                    </select>
                </div>
                <div className="w-24">
                    <label className={labelBase}>Points</label>
                    <input
                        type="number"
                        value={helperPoints}
                        onChange={(e) => setHelperPoints(parseInt(e.target.value.toString()) || 0)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-all"
                    />
                </div>
                <div className="flex-[2] w-full">
                    <label className={labelBase}>Reason</label>
                    <input
                        type="text"
                        value={helperReason}
                        onChange={(e) => setHelperReason(e.target.value)}
                        placeholder="e.g. Financial irregularities"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-all"
                    />
                </div>
                <button
                    type="button"
                    disabled={!helperTeamId}
                    onClick={appendDeduction}
                    className="bg-sky-500 hover:bg-sky-400 disabled:opacity-30 text-white px-4 py-2 rounded-lg font-bold text-sm transition-all"
                >
                    Add
                </button>
            </div>

            <textarea
                value={configJson}
                onChange={(e) => setConfigJson(e.target.value)}
                spellCheck={false}
                className="w-full h-80 bg-slate-950/80 border border-slate-800/80 rounded-xl p-6 font-mono text-xs text-sky-300 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/10 transition-all"
                placeholder='{ "promotion": [1, 2], "playoffs": [3, 4, 5, 6], "relegation": [18, 19, 20], "deductions": [], "rankingCriteria": [] }'
            />
        </div>
    );
};
