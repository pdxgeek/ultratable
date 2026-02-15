import { usePopup } from '../context/PopupContext';
import MatchPopup from './MatchPopup';

export default function PopupManager() {
    const { activePopup, scheduleHide, cancelHide } = usePopup();

    if (!activePopup) return null;

    return (
        <MatchPopup
            fixture={activePopup.fixture}
            teams={activePopup.teams}
            anchorRect={activePopup.anchorRect}
            onClose={scheduleHide}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
        />
    );
}
