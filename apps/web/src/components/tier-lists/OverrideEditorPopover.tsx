import type { TierRankableItem } from './queries';

import React, { useState } from 'react';
import { useMutation } from 'urql';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { UPDATE_TIER_RANKABLE_ITEM_OVERRIDES_MUTATION } from './queries';

interface Props {
    item: TierRankableItem;
    isLocked: boolean;
    onClose: () => void;
    onSaved: () => void;
}

/**
 * Per-user override editor. Empty input → clears the override (null) →
 * the display falls back to the recipe's snapshot. Lets the user
 * customise display name / image / subtitle without rewriting the
 * shared snapshot fields.
 */
const OverrideEditorPopover: React.FC<Props> = ({ item, isLocked, onClose, onSaved }) => {
    const [nameOverride, setNameOverride] = useState(item.nameOverride ?? '');
    const [imageUrlOverride, setImageUrlOverride] = useState(item.imageUrlOverride ?? '');
    const [subtitle, setSubtitle] = useState(item.subtitle ?? '');
    const [error, setError] = useState<string | null>(null);

    const [state, mutate] = useMutation<
        { updateTierRankableItemOverrides: TierRankableItem },
        {
            input: {
                itemId: string;
                nameOverride: string | null;
                imageUrlOverride: string | null;
                subtitle: string | null;
            };
        }
    >(UPDATE_TIER_RANKABLE_ITEM_OVERRIDES_MUTATION);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isLocked) return;
        setError(null);
        const result = await mutate({
            input: {
                itemId: item.id,
                nameOverride: nameOverride.trim() === '' ? null : nameOverride.trim(),
                imageUrlOverride:
                    imageUrlOverride.trim() === '' ? null : imageUrlOverride.trim(),
                subtitle: subtitle.trim() === '' ? null : subtitle.trim(),
            },
        });
        if (result.error) {
            setError(result.error.graphQLErrors[0]?.message ?? result.error.message);
            return;
        }
        onSaved();
    };

    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit item</DialogTitle>
                    <DialogDescription>
                        Override what this item looks like in your tier list. Leave a field empty to
                        fall back to the original — {item.name}.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="override-name">Name</Label>
                        <Input
                            id="override-name"
                            value={nameOverride}
                            disabled={isLocked}
                            placeholder={item.name}
                            onChange={(e) => setNameOverride(e.target.value)}
                            maxLength={120}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="override-image">Image URL</Label>
                        <Input
                            id="override-image"
                            value={imageUrlOverride}
                            disabled={isLocked}
                            placeholder={item.imageUrl ?? '(no original image)'}
                            onChange={(e) => setImageUrlOverride(e.target.value)}
                            maxLength={2048}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="override-subtitle">Subtitle</Label>
                        <Input
                            id="override-subtitle"
                            value={subtitle}
                            disabled={isLocked}
                            placeholder="(optional)"
                            onChange={(e) => setSubtitle(e.target.value)}
                            maxLength={120}
                        />
                    </div>
                    {error && (
                        <p className="text-sm text-destructive" role="alert">
                            {error}
                        </p>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={state.fetching || isLocked}>
                            {state.fetching ? 'Saving…' : 'Save'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default OverrideEditorPopover;
