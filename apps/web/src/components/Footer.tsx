import React from 'react';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
    const year = new Date().getFullYear();

    return (
        <footer className="bg-glass-bg backdrop-blur-md border-t border-glass-border px-6 py-8 mt-12">
            <div className="max-w-[1200px] mx-auto flex flex-col items-center gap-4">
                <div className="flex flex-col items-center gap-1">
                    <span className="text-lg font-bold tracking-tight bg-gradient-to-br from-accent-blue to-[#a78bfa] bg-clip-text text-transparent">
                        UltraTable
                    </span>
                    <span className="text-sm text-text-muted italic">
                        Premier-league UX for every league.
                    </span>
                </div>
                <nav className="flex gap-5">
                    <Link
                        to="/mission"
                        className="text-sm text-text-secondary no-underline transition-colors relative hover:text-accent-blue after:content-[''] after:absolute after:-bottom-0.5 after:left-0 after:w-0 after:h-px after:bg-accent-blue after:transition-[width] hover:after:w-full"
                    >
                        Our Mission
                    </Link>
                </nav>
                <div className="flex items-center gap-1.5 text-[0.72rem] text-text-muted max-sm:flex-col max-sm:gap-0.5 max-sm:text-center">
                    <span>© {year} UltraTable. All rights reserved.</span>
                    <span className="opacity-40 max-sm:hidden">·</span>
                    <span>Football data provided by third-party APIs.</span>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
