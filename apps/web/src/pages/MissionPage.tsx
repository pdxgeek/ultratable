import React from 'react';
import { Link } from 'react-router-dom';

const MissionPage: React.FC = () => {
    return (
        <div className="mission-page">
            <Link to="/" className="mission-page__back">
                ← Back to Tables
            </Link>

            <header className="mission-page__hero">
                <h1 className="mission-page__title">Our Mission</h1>
                <p className="mission-page__subtitle">
                    Bringing world-class football experiences to every league, every fan,
                    everywhere.
                </p>
            </header>

            <section className="mission-page__section">
                <div className="mission-page__icon">⚽</div>
                <h2>Premier League UX for Every League</h2>
                <p>
                    Top-tier football leagues enjoy beautifully designed, data-rich digital
                    experiences. Lower-division clubs, amateur leagues, and grassroots competitions
                    deserve the same treatment. UltraTable brings premium real-time standings,
                    fixtures, match details, and player stats to leagues at every level — from
                    Sunday leagues to national cups.
                </p>
            </section>

            <section className="mission-page__section">
                <div className="mission-page__icon">🛠️</div>
                <h2>Creator Tools for Football</h2>
                <p>
                    We're building an ecosystem of tools that empower content creators, league
                    administrators, and fan communities to tell their football stories. Custom
                    graphics, automated stats, and streamlined data pipelines — designed for people
                    who live and breathe the game, not just those with big budgets.
                </p>
            </section>

            <section className="mission-page__section">
                <div className="mission-page__icon">📦</div>
                <h2>Embeddable Widgets</h2>
                <p>
                    Fan pages, club websites, and community forums should have access to beautiful,
                    live football data. We're creating embeddable widgets — standings tables,
                    fixture lists, live scores — that anyone can drop into their own site with a
                    single snippet. Your league's data, your brand, powered by UltraTable.
                </p>
            </section>

            <footer className="mission-page__cta">
                <p>
                    UltraTable is in active development. We're building in the open and we'd love to
                    hear from you.
                </p>
            </footer>
        </div>
    );
};

export default MissionPage;
