import type { TierRankableTypeRef } from './queries';

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
import { CREATE_TIER_LIST_MUTATION } from './queries';

interface Props {
    seasonId: string;
    recipes: TierRankableTypeRef[];
    onClose: () => void;
    onCreated: (id: string) => void;
}

const MAX_TITLE_LENGTH = 100;

const NewTierListDialog: React.FC<Props> = ({ seasonId, recipes, onClose, onCreated }) => {
    const [title, setTitle] = useState('');
    const [recipeId, setRecipeId] = useState(recipes[0]?.id ?? '');
    const [error, setError] = useState<string | null>(null);

    const [createState, createMutation] = useMutation<
        { createTierList: { id: string } },
        { seasonId: string; tierRankableTypeId: string; title: string }
    >(CREATE_TIER_LIST_MUTATION);

    const trimmed = title.trim();
    const canSubmit =
        trimmed.length > 0 && trimmed.length <= MAX_TITLE_LENGTH && recipeId.length > 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setError(null);
        const result = await createMutation({
            seasonId,
            tierRankableTypeId: recipeId,
            title: trimmed,
        });
        if (result.error) {
            setError(result.error.graphQLErrors[0]?.message ?? result.error.message);
            return;
        }
        const id = result.data?.createTierList.id;
        if (id) onCreated(id);
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
                    <DialogTitle>New Tier List</DialogTitle>
                    <DialogDescription>
                        Pick what to rank and give your list a title. You can change the title later,
                        but the ranking type is locked once you create the list.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="new-tier-list-recipe">What to rank</Label>
                        <select
                            id="new-tier-list-recipe"
                            value={recipeId}
                            onChange={(e) => setRecipeId(e.target.value)}
                            className="h-9 px-3 rounded-md border border-input bg-transparent text-sm"
                        >
                            {recipes.length === 0 && (
                                <option value="" disabled>
                                    No ranking types available
                                </option>
                            )}
                            {recipes.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="new-tier-list-title">Title</Label>
                        <Input
                            id="new-tier-list-title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={MAX_TITLE_LENGTH}
                            placeholder="e.g. Best Coaches"
                            autoFocus
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
                        <Button type="submit" disabled={!canSubmit || createState.fetching}>
                            {createState.fetching ? 'Creating…' : 'Create'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default NewTierListDialog;
