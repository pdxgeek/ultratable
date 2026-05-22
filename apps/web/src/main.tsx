import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider as UrqlProvider } from 'urql';

import { client } from './api/client';
import App from './App';
import { AbilityProvider } from './auth/AbilityContext';
import { LeagueProvider } from './context/LeagueContext';
import { SettingsProvider } from './context/SettingsContext';

import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <UrqlProvider value={client}>
            <AbilityProvider>
                <SettingsProvider>
                    <LeagueProvider>
                        <BrowserRouter>
                            <App />
                        </BrowserRouter>
                    </LeagueProvider>
                </SettingsProvider>
            </AbilityProvider>
        </UrqlProvider>
    </React.StrictMode>,
);
