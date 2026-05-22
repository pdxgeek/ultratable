import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useViewer } from '../hooks/useViewer';

const RequireSignIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { viewer, loading } = useViewer();
    const location = useLocation();

    if (loading) return null;
    if (!viewer) {
        const returnTo = encodeURIComponent(location.pathname + location.search);
        return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
    }
    return <>{children}</>;
};

export default RequireSignIn;
