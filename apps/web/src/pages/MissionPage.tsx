import React from 'react';
import { Link } from 'react-router-dom';

const MissionPage: React.FC = () => {
    return (
        <div className="max-w-[720px] mx-auto pt-5 pb-10">
            <Link
                to="/"
                className="inline-block text-sm text-text-muted no-underline mb-8 transition-colors hover:text-accent-blue"
            >
                ← Back to Tables
            </Link>

            <header className="text-center mb-12">
                <h1 className="text-[2.4rem] max-sm:text-[1.8rem] font-extrabold tracking-tight mb-3 bg-gradient-to-br from-text-primary to-accent-blue bg-clip-text text-transparent">
                    Our Mission
                </h1>
                <p className="text-base text-text-secondary max-w-[520px] mx-auto leading-relaxed">
                    Bringing world-class football experiences to every league, every fan,
                    everywhere.
                </p>
            </header>

            {[
                {
                    icon: '⚽',
                    title: 'Premier League UX for Every League',
                    body: 'Top-tier football leagues enjoy beautifully designed, data-rich digital experiences. Lower-division clubs, amateur leagues, and grassroots competitions deserve the same treatment. UltraTable brings premium real-time standings, fixtures, match details, and player stats to leagues at every level — from Sunday leagues to national cups.',
                },
                {
                    icon: '🛠️',
                    title: 'Creator Tools for Football',
                    body: "We're building an ecosystem of tools that empower content creators, league administrators, and fan communities to tell their football stories. Custom graphics, automated stats, and streamlined data pipelines — designed for people who live and breathe the game, not just those with big budgets.",
                },
                {
                    icon: '📦',
                    title: 'Embeddable Widgets',
                    body: "Fan pages, club websites, and community forums should have access to beautiful, live football data. We're creating embeddable widgets — standings tables, fixture lists, live scores — that anyone can drop into their own site with a single snippet. Your league's data, your brand, powered by UltraTable.",
                },
            ].map((section) => (
                <section
                    key={section.title}
                    className="bg-glass-bg border border-glass-border rounded-lg px-8 py-7 mb-5 max-sm:px-5 max-sm:py-5 transition-transform hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.25)]"
                >
                    <div className="text-3xl mb-3">{section.icon}</div>
                    <h2 className="text-xl font-bold mb-2.5 tracking-tight">{section.title}</h2>
                    <p className="text-[0.95rem] text-text-secondary leading-[1.7]">
                        {section.body}
                    </p>
                </section>
            ))}

            <footer className="text-center mt-10 p-6 rounded-lg bg-gradient-to-br from-[rgba(56,189,248,0.08)] to-[rgba(167,139,250,0.08)] border border-[rgba(56,189,248,0.15)]">
                <p className="text-[0.95rem] text-text-secondary leading-relaxed">
                    UltraTable is in active development. We're building in the open and we'd love to
                    hear from you.
                </p>
            </footer>
        </div>
    );
};

export default MissionPage;
