import type { ReactNode } from 'react';
import type { Fixture, Team } from '../db';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

interface PopupData {
    fixture: Fixture;
    teamsMap: Map<string, Team>;
    anchorRect: DOMRect;
}

interface PopupContextType {
    activePopup: PopupData | null;
    showPopup: (data: PopupData) => void;
    hidePopup: () => void;
    scheduleHide: () => void;
    cancelHide: () => void;
}

const PopupContext = createContext<PopupContextType | undefined>(undefined);

export function PopupProvider({ children }: { children: ReactNode }) {
    const [activePopup, setActivePopup] = useState<PopupData | null>(null);
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const cancelHide = useCallback(() => {
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
    }, []);

    const scheduleHide = useCallback(() => {
        cancelHide();
        hideTimeoutRef.current = setTimeout(() => {
            setActivePopup(null);
        }, 300);
    }, [cancelHide]);

    const showPopup = useCallback(
        (data: PopupData) => {
            cancelHide();
            setActivePopup(data);
        },
        [cancelHide],
    );

    const hidePopup = useCallback(() => {
        cancelHide();
        setActivePopup(null);
    }, [cancelHide]);

    return (
        <PopupContext.Provider
            value={{ activePopup, showPopup, hidePopup, scheduleHide, cancelHide }}
        >
            {children}
        </PopupContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePopup() {
    const context = useContext(PopupContext);
    if (!context) {
        throw new Error('usePopup must be used within a PopupProvider');
    }
    return context;
}
