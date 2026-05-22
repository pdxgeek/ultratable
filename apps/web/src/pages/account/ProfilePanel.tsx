import React from 'react';

import { useViewer } from '../../hooks/useViewer';
import { getInitials } from '../../lib/initials';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const ProfilePanel: React.FC = () => {
    const { viewer } = useViewer();
    // RequireSignIn (in AccountPage) guarantees viewer is non-null by the time
    // panels mount — but typescript can't see through the route, so handle it.
    if (!viewer) return null;

    const initials = getInitials(viewer.name || viewer.email);
    const createdAt = new Date(viewer.createdAt);

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardHeader>
                    <CardTitle>Profile</CardTitle>
                    <CardDescription>
                        Your account details. Editing display name and avatar comes in a follow-up.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                    <div className="flex items-center gap-4">
                        {viewer.image ? (
                            <img
                                src={viewer.image}
                                alt=""
                                className="size-16 rounded-full object-cover"
                            />
                        ) : (
                            <div className="flex size-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
                                {initials}
                            </div>
                        )}
                        <div className="flex flex-col">
                            <span className="text-base font-semibold">{viewer.name}</span>
                            <span className="text-sm text-muted-foreground">{viewer.email}</span>
                        </div>
                    </div>
                    <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
                        <dt className="text-muted-foreground">Email verified</dt>
                        <dd>{viewer.emailVerified ? 'Yes' : 'No'}</dd>
                        <dt className="text-muted-foreground">Roles</dt>
                        <dd>{viewer.roles.join(', ') || '—'}</dd>
                        <dt className="text-muted-foreground">Member since</dt>
                        <dd>{createdAt.toLocaleDateString()}</dd>
                    </dl>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Connected identities</CardTitle>
                    <CardDescription>
                        Sign-in methods linked to this account. Linking and unlinking is handled
                        elsewhere.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {viewer.identities.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No identities linked.</p>
                    ) : (
                        <ul className="flex flex-col gap-2 text-sm">
                            {viewer.identities.map((id) => (
                                <li
                                    key={id.authUserId}
                                    className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                                >
                                    <span className="font-medium capitalize">{id.provider}</span>
                                    <span className="text-muted-foreground">
                                        Linked {new Date(id.linkedAt).toLocaleDateString()}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default ProfilePanel;
