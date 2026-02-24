import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider as UrqlProvider } from 'urql';
import { client } from './api/client';
import { SettingsProvider } from './context/SettingsContext';
import { LeagueProvider } from './context/LeagueContext';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UrqlProvider value={client}>
      <SettingsProvider>
        <LeagueProvider>
          <App />
        </LeagueProvider>
      </SettingsProvider>
    </UrqlProvider>
  </React.StrictMode>,
);
