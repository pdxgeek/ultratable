import React from 'react';

import { usePlayer } from '../hooks/usePlayer';

interface PlayerInfoPopupProps {
    playerId: number;
    season: number;
    leagueSourceId?: number;
}

interface PlayerStats {
    league?: { id: number };
    team?: { name: string };
    games?: {
        appearences?: number;
        minutes?: number;
        rating?: string;
        number?: number;
        position?: string;
    };
    goals?: { total?: number; assists?: number };
    cards?: { yellow?: number; red?: number };
}

const shimmerBg =
    'bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_25%,rgba(255,255,255,0.08)_50%,rgba(255,255,255,0.04)_75%)] bg-[length:200%_100%] [animation:shimmer_1.5s_infinite]';

const PlayerInfoPopup: React.FC<PlayerInfoPopupProps> = ({
    playerId,
    season,
    leagueSourceId,
}) => {
    const { player, isLoading } = usePlayer(playerId, season);

    if (isLoading) {
        return (
            <div className="flex items-center gap-3.5">
                <div className={`w-[72px] h-[72px] rounded-[10px] shrink-0 ${shimmerBg}`} />
                <div className="flex-1 flex flex-col gap-2">
                    <div className={`h-3 rounded ${shimmerBg} w-4/5`} />
                    <div
                        className={`h-3 rounded ${shimmerBg} w-[55%] [animation-delay:0.1s]`}
                    />
                    <div
                        className={`h-3 rounded ${shimmerBg} w-2/5 [animation-delay:0.2s]`}
                    />
                </div>
            </div>
        );
    }

    if (!player) {
        const initials = String(playerId).slice(0, 2);
        return (
            <div className="flex items-center gap-3.5">
                <PhotoPlaceholder>{initials}</PhotoPlaceholder>
                <div className="flex-1 overflow-hidden">
                    <h3 className="m-0 text-base font-bold text-white leading-tight">
                        Player #{playerId}
                    </h3>
                    <p className="mt-1 text-[0.78rem] text-white/45">Stats Unavailable</p>
                </div>
            </div>
        );
    }

    const currentStats = (() => {
        if (!player.statistics?.length) return null;
        if (leagueSourceId) {
            const match = player.statistics.find(
                (s: PlayerStats) => s.league?.id === leagueSourceId,
            );
            if (match) return match as PlayerStats;
        }
        return player.statistics.reduce(
            (best: PlayerStats, s: PlayerStats) =>
                (s.games?.appearences || 0) > (best?.games?.appearences || 0) ? s : best,
            player.statistics[0],
        ) as PlayerStats;
    })();

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3.5 -mx-2.5 -mt-2.5 px-4 py-3.5 bg-[linear-gradient(135deg,rgba(100,120,255,0.08),rgba(140,80,220,0.06))] border-b border-white/[0.06] rounded-t-lg">
                {player.photo ? (
                    <img
                        src={player.photo}
                        alt={player.name}
                        className="w-[72px] h-[72px] rounded-[10px] object-cover border-2 border-white/[0.12] shrink-0"
                    />
                ) : (
                    <PhotoPlaceholder>
                        {player.name
                            ?.split(' ')
                            .map((n: string) => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                    </PhotoPlaceholder>
                )}
                <div className="flex-1 overflow-hidden">
                    <h3 className="m-0 text-base font-bold text-white leading-tight">
                        {player.name}
                    </h3>
                    {player.nationality && (
                        <p className="mt-1 text-[0.78rem] text-white/45">{player.nationality}</p>
                    )}
                    {currentStats?.games?.position && (
                        <p className="mt-1 text-[0.78rem] text-white/45">
                            {currentStats.games.position}
                        </p>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-2.5">
                <Section>
                    <Row label="Age" value={player.age as string | number} />
                    {player.height && <Row label="Height" value={player.height as string} />}
                    {player.weight && <Row label="Weight" value={player.weight as string} />}
                </Section>

                {currentStats && (
                    <>
                        <Section>
                            <SectionTitle>Season Stats</SectionTitle>
                            <Row label="Team" value={currentStats.team?.name} />
                            {currentStats.games?.number && (
                                <Row label="Number" value={`#${currentStats.games.number}`} />
                            )}
                            <Row
                                label="Appearances"
                                value={currentStats.games?.appearences || 0}
                            />
                            <Row
                                label="Minutes"
                                value={(currentStats.games?.minutes || 0).toLocaleString()}
                            />
                            {currentStats.games?.rating && (
                                <Row
                                    label="Rating"
                                    value={parseFloat(currentStats.games.rating).toFixed(2)}
                                />
                            )}
                        </Section>

                        <Section>
                            <SectionTitle>Output</SectionTitle>
                            <Row label="Goals" value={currentStats.goals?.total || 0} />
                            <Row label="Assists" value={currentStats.goals?.assists || 0} />
                            <div className="flex justify-between items-center py-0.5 text-[0.8rem]">
                                <span className="text-white/50">Cards</span>
                                <span className="inline-flex gap-1.5 items-center font-semibold">
                                    <span style={{ color: '#ffd700' }}>
                                        🟨 {currentStats.cards?.yellow || 0}
                                    </span>
                                    <span style={{ color: '#ff4d4d' }}>
                                        🟥 {currentStats.cards?.red || 0}
                                    </span>
                                </span>
                            </div>
                        </Section>
                    </>
                )}

                {player.injured && (
                    <div className="bg-[rgba(255,152,0,0.1)] border border-[rgba(255,152,0,0.25)] rounded-md p-1.5 text-[#ff9800] text-[0.75rem] font-semibold text-center">
                        ⚠️ Currently Injured
                    </div>
                )}
            </div>
        </div>
    );
};

const Row = ({ label, value }: { label: string; value: string | number | undefined }) => (
    <div className="flex justify-between items-center py-0.5 text-[0.8rem]">
        <span className="text-white/50">{label}</span>
        <span className="text-white font-semibold">{value ?? 'N/A'}</span>
    </div>
);

const Section = ({ children }: { children: React.ReactNode }) => (
    <div className="last:mb-0">{children}</div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-white/30 border-b border-white/[0.06] pb-1">
        {children}
    </div>
);

const PhotoPlaceholder = ({ children }: { children: React.ReactNode }) => (
    <div className="w-[72px] h-[72px] rounded-[10px] flex items-center justify-center bg-[linear-gradient(135deg,#667eea,#764ba2)] border-2 border-white/[0.12] text-white font-bold text-2xl shrink-0">
        {children}
    </div>
);

export default PlayerInfoPopup;
