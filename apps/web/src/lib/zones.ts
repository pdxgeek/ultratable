export type Zone = 'promo' | 'playoff' | 'rel' | '';

export const zoneBorderClass = (zone: Zone): string => {
    if (zone === 'promo') return 'border-l-2 border-accent-blue';
    if (zone === 'playoff') return 'border-l-2 border-accent-yellow';
    if (zone === 'rel') return 'border-l-2 border-accent-red';
    return '';
};

export interface ZoneArrays {
    promotion?: number[];
    playoffs?: number[];
    relegation?: number[];
}

export const zoneForPosition = (position: number, zones: ZoneArrays | undefined): Zone => {
    if (!zones) return '';
    if (zones.promotion?.includes(position)) return 'promo';
    if (zones.playoffs?.includes(position)) return 'playoff';
    if (zones.relegation?.includes(position)) return 'rel';
    return '';
};
