import { usePopup } from '../context/PopupContext';
import MatchPopup from './MatchPopup';

export default function PopupOverlay() {
    const { activePopup } = usePopup();

    if (!activePopup) return null;

    return (
        <MatchPopup
            fixture={activePopup.fixture}
            teamsMap={activePopup.teamsMap}
            anchorRect={activePopup.anchorRect}
        />
    );
}
