import { useState } from 'react';
import { setApiKey } from '../services/apiFootball';

interface ApiKeySetupProps {
    onKeySet: () => void;
}

export default function ApiKeySetup({ onKeySet }: ApiKeySetupProps) {
    const [key, setKey] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = key.trim();
        if (!trimmed) {
            setError('Please enter an API key');
            return;
        }
        if (trimmed.length < 20) {
            setError('That doesn\'t look like a valid API key');
            return;
        }
        setApiKey(trimmed);
        onKeySet();
    };

    return (
        <div className="setup-screen">
            <div className="setup-card">
                <div className="setup-card__icon">⚽</div>
                <h1 className="setup-card__title">UltraTable</h1>
                <p className="setup-card__subtitle">
                    Interactive Football Standings
                </p>

                <form onSubmit={handleSubmit} className="setup-form">
                    <label htmlFor="api-key" className="setup-form__label">
                        API-Football Key
                    </label>
                    <input
                        id="api-key"
                        type="text"
                        value={key}
                        onChange={(e) => {
                            setKey(e.target.value);
                            setError('');
                        }}
                        placeholder="Enter your API key…"
                        className="setup-form__input"
                        autoComplete="off"
                    />
                    {error && <p className="setup-form__error">{error}</p>}
                    <button type="submit" className="setup-form__btn">
                        Save & Sync
                    </button>
                </form>

                <p className="setup-card__help">
                    Get a free key at{' '}
                    <a
                        href="https://dashboard.api-football.com/register"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        dashboard.api-football.com
                    </a>
                    <br />
                    <span className="setup-card__note">
                        Free tier: 100 requests/day • All endpoints included
                    </span>
                </p>
            </div>
        </div>
    );
}
