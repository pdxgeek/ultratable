/**
 * Standard tier-list color scheme by tier index (top-to-bottom).
 * Mirrors the colors described in umbrella #110 (Wikipedia tier list).
 * Tier 7+ uses a neutral fallback — v1 caps at 7 tiers so this is rare.
 *
 * Colors are not stored server-side; the tier row receives its color
 * purely from its position in the list.
 */
export interface TierColor {
    /** Tailwind bg-* class for the colored label cell. */
    bg: string;
    /** Tailwind text-* class for label cell contents. */
    text: string;
}

const PALETTE: TierColor[] = [
    { bg: 'bg-[#ff7f7f]', text: 'text-black' }, // S — coral red
    { bg: 'bg-[#ffbf7f]', text: 'text-black' }, // A — orange
    { bg: 'bg-[#ffdf7f]', text: 'text-black' }, // B — gold
    { bg: 'bg-[#ffff7f]', text: 'text-black' }, // C — yellow
    { bg: 'bg-[#bfff7f]', text: 'text-black' }, // D — green
    { bg: 'bg-[#7fffff]', text: 'text-black' }, // F — cyan
    { bg: 'bg-[#7fbfff]', text: 'text-black' }, // overflow — blue
];

const FALLBACK: TierColor = { bg: 'bg-muted', text: 'text-foreground' };

export function colorForTierIndex(index: number): TierColor {
    return PALETTE[index] ?? FALLBACK;
}
