import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider as UrqlProvider } from 'urql';
import { client } from './api/client';
import { SettingsProvider } from './context/SettingsContext';
import { LeagueProvider } from './context/LeagueContext';
import { PopupProvider } from './context/PopupContext';
import App from './App';
import PopupOverlay from './components/PopupOverlay';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UrqlProvider value={client}>
      <SettingsProvider>
        <LeagueProvider>
          <PopupProvider>
            <BrowserRouter>
              <App />
              <PopupOverlay />
            </BrowserRouter>
          </PopupProvider>
        </LeagueProvider>
      </SettingsProvider>
    </UrqlProvider>
  </React.StrictMode>,
);
