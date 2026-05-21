import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

interface Settings {
    showForm: boolean;
    showZones: boolean;
    showLogos: boolean;
    showDates: boolean;
    showHovers: boolean;
    theme: Theme;
}

interface SettingsContextType {
    settings: Settings;
    toggleSetting: (key: keyof Settings) => void;
    setTheme: (theme: Theme) => void;
}

const defaultSettings: Settings = {
    showForm: true,
    showZones: true,
    showLogos: true,
    showDates: true,
    showHovers: true,
    theme: 'dark',
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<Settings>(() => {
        try {
            const saved = localStorage.getItem('ultratable-settings');
            return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
        } catch {
            return defaultSettings;
        }
    });

    useEffect(() => {
        document.body.className = settings.theme === 'light' ? 'theme-light' : 'theme-dark';
    }, [settings.theme]);

    const toggleSetting = (key: keyof Settings) => {
        setSettings((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            localStorage.setItem('ultratable-settings', JSON.stringify(next));
            return next;
        });
    };

    const setTheme = (theme: Theme) => {
        setSettings((prev) => {
            const next = { ...prev, theme };
            localStorage.setItem('ultratable-settings', JSON.stringify(next));
            return next;
        });
    };

    return (
        <SettingsContext.Provider value={{ settings, toggleSetting, setTheme }}>
            {children}
        </SettingsContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() {
    const context = useContext(SettingsContext);
    if (!context) throw new Error('useSettings must be used within a SettingsProvider');
    return context;
}
