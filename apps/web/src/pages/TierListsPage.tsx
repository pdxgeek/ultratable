import React from 'react';
import { Link } from 'react-router-dom';

const TierListsPage: React.FC = () => {
    return (
        <div className="max-w-[720px] mx-auto pt-5 pb-10">
            <Link
                to="/"
                className="inline-block text-sm text-text-muted no-underline mb-8 transition-colors hover:text-accent-blue"
            >
                ← Back to Tables
            </Link>
            <header className="text-center mb-12">
                <h1 className="text-[2.4rem] max-sm:text-[1.8rem] font-extrabold tracking-tight mb-3">
                    Tier Lists
                </h1>
                <p className="text-base text-text-secondary">Coming soon.</p>
            </header>
        </div>
    );
};

export default TierListsPage;
