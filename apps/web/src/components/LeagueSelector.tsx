import React from 'react';
import { useNavigate } from 'react-router-dom';

import { useLeague } from '../context/LeagueContext';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from './ui/select';

const LeagueSelector: React.FC = () => {
    const { availableLeagues, availableSeasons, activeSeason, setActiveSeasonId, isSyncing } =
        useLeague();
    const navigate = useNavigate();

    return (
        <div className="flex gap-3 items-center">
            <Select
                value={activeSeason?.id ?? ''}
                onValueChange={(value) => {
                    setActiveSeasonId(value);
                    navigate('/');
                }}
            >
                <SelectTrigger className="h-9 px-3 text-[0.9rem] font-semibold">
                    <SelectValue placeholder="Select Season" />
                </SelectTrigger>
                <SelectContent>
                    {availableLeagues.map((league) => {
                        const seasons = availableSeasons
                            .filter((s) => s.leagueId === league.id)
                            .sort((a, b) => b.year - a.year);
                        if (seasons.length === 0) return null;
                        return (
                            <SelectGroup key={league.id}>
                                <SelectLabel>{league.name}</SelectLabel>
                                {seasons.map((season) => (
                                    <SelectItem key={season.id} value={season.id}>
                                        {league.name} {season.year}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        );
                    })}
                </SelectContent>
            </Select>

            {isSyncing && (
                <span className="text-xs text-accent-blue font-medium">Syncing...</span>
            )}
        </div>
    );
};

export default LeagueSelector;
