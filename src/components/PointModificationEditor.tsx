import type { PointModification, Team } from '../types';

interface PointModificationEditorProps {
    modifications: PointModification[];
    availableTeams: Team[];
    onChange: (mods: PointModification[]) => void;
}

export default function PointModificationEditor({
    modifications,
    availableTeams,
    onChange
}: PointModificationEditorProps) {
    const handleAdd = () => {
        const firstTeam = availableTeams[0];
        onChange([...modifications, {
            teamId: firstTeam?.id || '',
            modification: -3,
            note: 'Deduction'
        }]);
    };

    const handleRemove = (index: number) => {
        const next = [...modifications];
        next.splice(index, 1);
        onChange(next);
    };

    const handleUpdate = (index: number, field: keyof PointModification, value: string | number) => {
        const next = [...modifications];
        next[index] = { ...next[index], [field]: value };
        onChange(next);
    };

    return (
        <div className="point-mod-editor">
            <div className="point-mod-editor__header">
                <label className="point-mod-editor__label">Point Modifications (Deductions/Additions)</label>
                <button className="btn btn--secondary btn--sm" onClick={handleAdd}>+ Add Modification</button>
            </div>

            <div className="point-mod-editor__list">
                {modifications.map((mod, idx) => (
                    <div key={idx} className="point-mod-item">
                        <select
                            className="settings-input point-mod-item__team"
                            value={mod.teamId}
                            onChange={(e) => handleUpdate(idx, 'teamId', e.target.value)}
                        >
                            <option value="">Select Team...</option>
                            {availableTeams.map(t => (
                                <option key={t.id} value={t.id}>{t.commonName}</option>
                            ))}
                        </select>
                        <input
                            type="number"
                            className="settings-input point-mod-item__value"
                            value={mod.modification}
                            onChange={(e) => handleUpdate(idx, 'modification', parseInt(e.target.value) || 0)}
                            placeholder="Pts"
                        />
                        <input
                            type="text"
                            className="settings-input point-mod-item__note"
                            value={mod.note}
                            onChange={(e) => handleUpdate(idx, 'note', e.target.value)}
                            placeholder="Reason (e.g. Financial Breach)"
                        />
                        <button
                            className="btn btn--danger btn--sm"
                            onClick={() => handleRemove(idx)}
                            title="Remove"
                        >
                            ✕
                        </button>
                    </div>
                ))}
                {modifications.length === 0 && (
                    <div className="point-mod-editor__empty">No active modifications for this season.</div>
                )}
            </div>
        </div>
    );
}
