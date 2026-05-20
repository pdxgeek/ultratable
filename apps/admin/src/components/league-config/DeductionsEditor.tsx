import React from 'react';

interface Props {
    deductions: string;
    setDeductions: (val: string) => void;
    configTeams: Record<string, unknown>[];
    helperTeamId: string;
    setHelperTeamId: (val: string) => void;
    helperPoints: number;
    setHelperPoints: (val: number) => void;
    helperReason: string;
    setHelperReason: (val: string) => void;
}

export const DeductionsEditor: React.FC<Props> = ({
    deductions, setDeductions,
    configTeams,
    helperTeamId, setHelperTeamId,
    helperPoints, setHelperPoints,
    helperReason, setHelperReason,
}) => {
    const appendDeduction = () => {
        try {
            const currentArray = JSON.parse(deductions || '[]');
            if (!Array.isArray(currentArray)) throw new Error('Not an array');
            currentArray.push({
                teamId: helperTeamId,
                points: helperPoints,
                reason: helperReason,
            });
            setDeductions(JSON.stringify(currentArray, null, 2));
            setHelperTeamId('');
            setHelperPoints(0);
            setHelperReason('');
        } catch {
            alert('Current JSON is invalid. Please fix it before using the helper.');
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Points Deductions (JSON)</h4>
                <span className="text-[9px] text-slate-600 font-mono italic">Format: [ {"{"} "teamId": "uuid", "points": 4, "reason": "..." {"}"} ]</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Select Team</label>
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
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Points</label>
                    <input
                        type="number"
                        value={helperPoints}
                        onChange={(e) => setHelperPoints(parseInt(e.target.value.toString()) || 0)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-all"
                    />
                </div>
                <div className="flex-2 w-full">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Reason</label>
                    <input
                        type="text"
                        value={helperReason}
                        onChange={(e) => setHelperReason(e.target.value)}
                        placeholder="e.g. Financial irregularities"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-all"
                    />
                </div>
                <button
                    disabled={!helperTeamId}
                    onClick={appendDeduction}
                    className="bg-sky-500 hover:bg-sky-400 disabled:opacity-30 text-white px-4 py-2 rounded-lg font-bold text-sm transition-all"
                >
                    Add
                </button>
            </div>

            <textarea
                value={deductions}
                onChange={(e) => setDeductions(e.target.value)}
                className="w-full h-48 bg-slate-950/80 border border-slate-800/80 rounded-xl p-6 font-mono text-xs text-sky-300 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/10 transition-all mt-4"
                placeholder='[ { "teamId": "uuid", "points": 0, "reason": "" } ]'
            />
        </div>
    );
};
