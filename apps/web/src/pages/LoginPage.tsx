import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useViewer } from '../hooks/useViewer';
import { authClient } from '../lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const LoginPage: React.FC = () => {
    const { viewer, loading } = useViewer();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const returnTo = params.get('returnTo') || '/';

    useEffect(() => {
        if (!loading && viewer) navigate(returnTo, { replace: true });
    }, [loading, viewer, returnTo, navigate]);

    const handleGoogle = () => {
        // Absolute callbackURL pins the post-OAuth landing to this frontend's
        // origin. Relative URLs resolve against BETTER_AUTH_URL — which is
        // admin's URL in dev — so a relative callback strands web users on the
        // admin console after sign-in.
        authClient.signIn.social({
            provider: 'google',
            callbackURL: window.location.origin + returnTo,
        });
    };

    return (
        <div className="flex flex-1 items-center justify-center px-4 py-12">
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center">
                    <CardTitle className="text-lg">Sign in to UltraTable</CardTitle>
                    <CardDescription>Continue with your Google account.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    <Button onClick={handleGoogle} className="h-10 w-full" variant="outline">
                        <GoogleMark />
                        Continue with Google
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};

const GoogleMark: React.FC = () => (
    <svg viewBox="0 0 18 18" aria-hidden className="size-4">
        <path
            fill="#EA4335"
            d="M9 3.48c1.69 0 2.83.73 3.48 1.34l2.54-2.48C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.6 5.05 6.62 3.48 9 3.48z"
        />
        <path
            fill="#4285F4"
            d="M17.64 9.2c0-.63-.06-1.25-.18-1.84H9v3.49h4.84a4.14 4.14 0 01-1.8 2.71v2.26h2.92c1.71-1.58 2.68-3.91 2.68-6.62z"
        />
        <path
            fill="#FBBC05"
            d="M3.88 10.78a5.4 5.4 0 010-3.56V4.96H.96a9 9 0 000 8.08l2.92-2.26z"
        />
        <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.38 0-4.4-1.57-5.13-3.74L.96 13.04C2.44 15.98 5.48 18 9 18z"
        />
    </svg>
);

export default LoginPage;
