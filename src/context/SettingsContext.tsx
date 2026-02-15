import { createContext, useContext, useState, type ReactNode } from 'react';

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

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<Settings>(() => {
        try {
            const saved = localStorage.getItem('ultratable-settings');
            return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
        } catch {
            return defaultSettings;
        }
    });

    // Apply theme to body
    if (typeof document !== 'undefined') {
        document.body.className = settings.theme === 'light' ? 'theme-light' : 'theme-dark';
    }

    const toggleSetting = (key: keyof Settings) => {
        setSettings((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            saveSettings(next);
            return next;
        });
    };

    const setTheme = (theme: Theme) => {
        setSettings((prev) => {
            const next = { ...prev, theme };
            saveSettings(next);
            return next;
        });
    };

    const saveSettings = (newSettings: Settings) => {
        try {
            localStorage.setItem('ultratable-settings', JSON.stringify(newSettings));
        } catch (err) {
            console.warn('Failed to save settings:', err);
        }
    };

    return (
        <SettingsContext.Provider value={{ settings, toggleSetting, setTheme }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}
