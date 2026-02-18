import { useParams, useNavigate } from 'react-router-dom';
import { useLeague } from '../context/LeagueContext';
import { useTeamDetails } from '../hooks/useTeamDetails';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, Users, Info } from 'lucide-react';
import clsx from 'clsx';
import TeamLogo from '../components/TeamLogo';

export default function TeamPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { activeLeague: league } = useLeague();

    const { data: details, isLoading, error } = useTeamDetails(league!, id);

    if (isLoading) {
        return (
            <div className="team-page team-page--loading">
                <div className="loading-screen__spinner" />
                <p>Curating Team Profile...</p>
            </div>
        );
    }

    if (error || !details) {
        return (
            <div className="team-page team-page--error">
                <h2>Error Loading Team</h2>
                <p>{error instanceof Error ? error.message : 'Team not found'}</p>
                <button onClick={() => navigate(-1)} className="sync-bar__btn">
                    <ArrowLeft size={16} /> Back to Standings
                </button>
            </div>
        );
    }

    const { team, coach, squad } = details;

    // Group squad by position
    const squadByPosition = squad.reduce((acc, player) => {
        const pos = player.position || 'Unknown';
        if (!acc[pos]) acc[pos] = [];
        acc[pos].push(player);
        return acc;
    }, {} as Record<string, typeof squad>);

    const positionOrder = ['Goalkeeper', 'Defender', 'Midfielder', 'Attacker'];

    return (
        <motion.div
            className="team-page"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <header className="team-page__header">
                <button onClick={() => navigate(-1)} className="team-page__back-btn">
                    <ArrowLeft size={20} />
                </button>
                <div className="team-page__title-area">
                    <TeamLogo url={team.logo} teamId={team.id} name={team.commonName} className="team-page__logo" />
                    <h1 className="team-page__name">{team.commonName}</h1>
                </div>
            </header>

            <div className="team-page__grid">
                {/* Column 1: Coach */}
                <aside className="team-page__col team-page__col--coach">
                    <section className="profile-card">
                        <h2 className="profile-card__title">
                            <Users size={18} /> Technical Staff
                        </h2>
                        {coach ? (
                            <div className="coach-profile">
                                <div className="coach-profile__photo-wrap">
                                    {coach.photo ? (
                                        <img src={coach.photo} alt={coach.name} className="coach-profile__photo" />
                                    ) : (
                                        <div className="coach-profile__photo-placeholder">
                                            {coach.name.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                <div className="coach-profile__info">
                                    <h3 className="coach-profile__name">{coach.name}</h3>
                                    <p className="coach-profile__role">Head Coach</p>
                                    <div className="coach-profile__meta">
                                        {coach.nationality && <span className="coach-profile__nationality">{coach.nationality}</span>}
                                        {coach.birthDate && <span className="coach-profile__birth">{new Date(coach.birthDate).toLocaleDateString()}</span>}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="profile-card__empty">Coach data unavailable</p>
                        )}
                    </section>
                </aside>

                {/* Column 2: Stadium */}
                <main className="team-page__col team-page__col--stadium">
                    <section className="stadium-card">
                        <h2 className="stadium-card__title">
                            <MapPin size={18} /> Home Ground
                        </h2>
                        <div className="stadium-card__content">
                            {team.venueImage && (
                                <div className="stadium-card__image-wrap">
                                    <img src={team.venueImage} alt={team.venue || 'Stadium'} className="stadium-card__image" />
                                </div>
                            )}
                            <div className="stadium-card__details">
                                <h3 className="stadium-card__name">{team.venue || 'Unknown Stadium'}</h3>
                                <div className="stadium-card__meta">
                                    {team.city && <span className="stadium-card__city">{team.city}</span>}
                                    {team.capacity && (
                                        <span className="stadium-card__capacity">
                                            Capacity: {team.capacity.toLocaleString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>
                </main>

                {/* Column 3: Squad */}
                <aside className="team-page__col team-page__col--squad">
                    <section className="squad-card">
                        <h2 className="squad-card__title">
                            <Info size={18} /> First Team Squad
                        </h2>
                        <div className="squad-list">
                            {positionOrder.map(pos => {
                                const players = squadByPosition[pos];
                                if (!players || players.length === 0) return null;
                                return (
                                    <div key={pos} className="squad-group">
                                        <h4 className="squad-group__title">{pos}s</h4>
                                        <ul className="squad-group__list">
                                            {players.sort((a, b) => (a.number || 99) - (b.number || 99)).map(player => (
                                                <li key={player.id} className="squad-item">
                                                    <span className="squad-item__number">{player.number || '-'}</span>
                                                    <span className="squad-item__name">{player.commonName}</span>
                                                    {player.age && <span className="squad-item__age">{player.age}y</span>}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </aside>
            </div>
        </motion.div>
    );
}
