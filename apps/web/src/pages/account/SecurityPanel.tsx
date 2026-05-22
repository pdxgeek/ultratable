import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gql, useMutation } from 'urql';

import { useViewer } from '../../hooks/useViewer';
import { authClient } from '../../lib/auth-client';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DELETE_ACCOUNT_MUTATION = gql`
    mutation DeleteUserAccount($userId: ID!) {
        deleteUserAccount(userId: $userId)
    }
`;

const SecurityPanel: React.FC = () => {
    const { viewer, refetch } = useViewer();
    const navigate = useNavigate();
    const [, deleteAccount] = useMutation<
        { deleteUserAccount: string },
        { userId: string }
    >(DELETE_ACCOUNT_MUTATION);

    const [open, setOpen] = useState(false);
    const [emailConfirm, setEmailConfirm] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!viewer) return null;

    const confirmsMatch = emailConfirm.trim().toLowerCase() === viewer.email.trim().toLowerCase();

    const onOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) {
            setEmailConfirm('');
            setError(null);
            setSubmitting(false);
        }
    };

    const onConfirm = async () => {
        if (!confirmsMatch || submitting) return;
        setSubmitting(true);
        setError(null);
        const result = await deleteAccount({ userId: viewer.id });
        if (result.error) {
            setError(result.error.message);
            setSubmitting(false);
            return;
        }
        // Cascades have wiped sessions/accounts/links/follows server-side. Clear
        // the browser cookie too, then bounce to home — the viewer query will
        // re-fetch as null on next render.
        await authClient.signOut();
        refetch();
        setOpen(false);
        navigate('/', { replace: true });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Security</CardTitle>
                <CardDescription>
                    Destructive actions on your account live here. Each requires confirmation.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
                    <div>
                        <h3 className="text-sm font-semibold text-destructive">Delete account</h3>
                        <p className="text-sm text-muted-foreground">
                            Permanently removes your account, all sign-in methods linked to it, and
                            every preference you have set (including followed leagues). This cannot
                            be undone.
                        </p>
                    </div>
                    <AlertDialog open={open} onOpenChange={onOpenChange}>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" className="self-start">
                                Delete my account
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action is permanent. Your account, all sign-in methods
                                    linked to it, and every preference will be wiped immediately.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="confirm-email" className="text-sm">
                                    Type <span className="font-mono">{viewer.email}</span> to
                                    confirm.
                                </Label>
                                <Input
                                    id="confirm-email"
                                    autoComplete="off"
                                    value={emailConfirm}
                                    onChange={(e) => setEmailConfirm(e.target.value)}
                                />
                                {error && (
                                    <p className="text-sm text-destructive" role="alert">
                                        {error}
                                    </p>
                                )}
                            </div>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={(e) => {
                                        // Keep the dialog open while the mutation runs so the
                                        // user sees errors instead of being kicked back to the
                                        // page with no context.
                                        e.preventDefault();
                                        void onConfirm();
                                    }}
                                    disabled={!confirmsMatch || submitting}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                    {submitting ? 'Deleting…' : 'Delete account'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardContent>
        </Card>
    );
};

export default SecurityPanel;
