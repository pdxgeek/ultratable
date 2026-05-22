import React, { useMemo, useState } from 'react';
import { gql, useMutation, useQuery } from 'urql';

import { useViewer } from '../../hooks/useViewer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface LeagueRow {
    id: string;
    name: string;
    country: string | null;
    logo: string | null;
}

const LEAGUES_QUERY = gql`
    query AccountLeagues {
        leagues {
            id
            name
            country
            logo
        }
    }
`;

const SET_FOLLOWS_MUTATION = gql`
    mutation SetMyLeagueFollows($leagueIds: [ID!]!) {
        setMyLeagueFollows(leagueIds: $leagueIds)
    }
`;

const LeagueFollowsPanel: React.FC = () => {
    const { viewer, refetch } = useViewer();
    const [leaguesResult] = useQuery<{ leagues: LeagueRow[] }>({ query: LEAGUES_QUERY });
    const [, setFollows] = useMutation<
        { setMyLeagueFollows: string[] },
        { leagueIds: string[] }
    >(SET_FOLLOWS_MUTATION);

    // Track in-flight toggles separately from the server set so the switch feels
    // responsive even before the mutation resolves. We never trust this state as
    // the source of truth — `viewer.followedLeagueIds` is.
    const [pending, setPending] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string | null>(null);

    const followed = useMemo(
        () => new Set(viewer?.followedLeagueIds ?? []),
        [viewer?.followedLeagueIds],
    );

    const onToggle = async (leagueId: string, checked: boolean) => {
        if (!viewer) return;
        setPending((p) => ({ ...p, [leagueId]: checked }));
        setError(null);
        const next = checked
            ? Array.from(new Set([...viewer.followedLeagueIds, leagueId]))
            : viewer.followedLeagueIds.filter((id) => id !== leagueId);
        const result = await setFollows({ leagueIds: next });
        setPending((p) => {
            const next = { ...p };
            delete next[leagueId];
            return next;
        });
        if (result.error) {
            setError(result.error.message);
            return;
        }
        refetch();
    };

    const leagues = leaguesResult.data?.leagues ?? [];

    return (
        <Card>
            <CardHeader>
                <CardTitle>League selection</CardTitle>
                <CardDescription>
                    Pick the leagues you want to follow. Your selection is private and only used to
                    personalise what you see across UltraTable.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
                {leaguesResult.fetching && (
                    <p className="text-sm text-muted-foreground">Loading leagues…</p>
                )}
                {leaguesResult.error && (
                    <p className="text-sm text-destructive">
                        Failed to load leagues: {leaguesResult.error.message}
                    </p>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
                {!leaguesResult.fetching && leagues.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                        No leagues are available yet. Check back once an admin promotes a league.
                    </p>
                )}
                <ul className="flex flex-col divide-y divide-border">
                    {leagues.map((league) => {
                        const switchId = `follow-${league.id}`;
                        const isChecked = pending[league.id] ?? followed.has(league.id);
                        return (
                            <li
                                key={league.id}
                                className="flex items-center justify-between gap-4 py-3"
                            >
                                <Label
                                    htmlFor={switchId}
                                    className="flex flex-1 cursor-pointer items-center gap-3"
                                >
                                    {league.logo && (
                                        <img
                                            src={league.logo}
                                            alt=""
                                            className="size-6 rounded object-contain"
                                        />
                                    )}
                                    <span className="flex flex-col">
                                        <span className="text-sm font-medium">{league.name}</span>
                                        {league.country && (
                                            <span className="text-xs text-muted-foreground">
                                                {league.country}
                                            </span>
                                        )}
                                    </span>
                                </Label>
                                <Switch
                                    id={switchId}
                                    checked={isChecked}
                                    onCheckedChange={(checked) => onToggle(league.id, checked)}
                                    aria-label={`Follow ${league.name}`}
                                />
                            </li>
                        );
                    })}
                </ul>
            </CardContent>
        </Card>
    );
};

export default LeagueFollowsPanel;
