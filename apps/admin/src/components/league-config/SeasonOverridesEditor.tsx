import React from 'react';
import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

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

const labelClass = 'text-[10px] font-bold text-slate-500 uppercase tracking-widest';
const fieldClass =
    'h-10 bg-slate-950 border-slate-800 text-white focus-visible:border-amber-500 focus-visible:ring-0';

export const SeasonOverridesEditor: React.FC<Props> = ({
    configJson,
    setConfigJson,
    leagueDefaultsJson,
    configTeams,
    helperTeamId,
    setHelperTeamId,
    helperPoints,
    setHelperPoints,
    helperReason,
    setHelperReason,
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
        if (
            !window.confirm(
                "Replace this season's overrides with the league defaults? Unsaved changes will be lost.",
            )
        )
            return;
        setConfigJson(leagueDefaultsJson);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Season Overrides (JSON)
                </h4>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={reset}
                    className="h-auto px-0 text-[10px] font-bold text-slate-400 hover:text-amber-400 hover:bg-transparent uppercase tracking-widest"
                    title="Replace edits with the league default config"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset to league defaults
                </Button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full space-y-2">
                    <Label htmlFor="helper-team" className={labelClass}>
                        Add points adjustment — Team
                    </Label>
                    <Select
                        value={helperTeamId || undefined}
                        onValueChange={(v) => setHelperTeamId(v)}
                    >
                        <SelectTrigger id="helper-team" className={`w-full ${fieldClass}`}>
                            <SelectValue placeholder="-- Choose a team --" />
                        </SelectTrigger>
                        <SelectContent>
                            {configTeams.map((t) => (
                                <SelectItem key={t.id as string} value={t.id as string}>
                                    {t.name as string}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="w-24 space-y-2">
                    <Label htmlFor="helper-points" className={labelClass}>
                        Points
                    </Label>
                    <Input
                        id="helper-points"
                        type="number"
                        value={helperPoints}
                        onChange={(e) => setHelperPoints(parseInt(e.target.value.toString()) || 0)}
                        className={fieldClass}
                    />
                </div>
                <div className="flex-[2] w-full space-y-2">
                    <Label htmlFor="helper-reason" className={labelClass}>
                        Reason
                    </Label>
                    <Input
                        id="helper-reason"
                        value={helperReason}
                        onChange={(e) => setHelperReason(e.target.value)}
                        placeholder="e.g. Financial irregularities"
                        className={fieldClass}
                    />
                </div>
                <Button
                    type="button"
                    disabled={!helperTeamId}
                    onClick={appendDeduction}
                    className="h-10 bg-sky-500 hover:bg-sky-400 disabled:opacity-30 text-white font-bold text-sm"
                >
                    Add
                </Button>
            </div>

            <Textarea
                value={configJson}
                onChange={(e) => setConfigJson(e.target.value)}
                spellCheck={false}
                className="h-80 bg-slate-950/80 border-slate-800/80 rounded-xl p-6 font-mono text-xs text-sky-300 focus-visible:border-amber-500/50 focus-visible:ring-1 focus-visible:ring-amber-500/10"
                placeholder='{ "promotion": [1, 2], "playoffs": [3, 4, 5, 6], "relegation": [18, 19, 20], "deductions": [], "rankingCriteria": [] }'
            />
        </div>
    );
};
