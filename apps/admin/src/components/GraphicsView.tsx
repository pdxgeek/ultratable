import React, { useState, useMemo } from 'react';

import { GraphicDetailModal } from './graphics/GraphicDetailModal';
import { GraphicsGallery } from './graphics/GraphicsGallery';
import { GraphicsUploadForm } from './graphics/GraphicsUploadForm';
import { useGraphics } from './graphics/useGraphics';
import type { Graphic, GraphicType } from './graphics/types';

export const GraphicsView: React.FC = () => {
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<GraphicType | 'all'>('all');
    const [selectedGraphic, setSelectedGraphic] = useState<Graphic | null>(null);

    const { graphics, loading, refetch } = useGraphics(typeFilter);

    const filteredGraphics = useMemo(
        () => graphics.filter(g => g.entityId.toLowerCase().includes(search.toLowerCase())),
        [graphics, search],
    );

    return (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-7xl mx-auto">
            <GraphicsUploadForm onUploaded={refetch} />

            <GraphicsGallery
                graphics={filteredGraphics}
                loading={loading}
                search={search}
                setSearch={setSearch}
                typeFilter={typeFilter}
                setTypeFilter={setTypeFilter}
                onSelect={setSelectedGraphic}
            />

            {selectedGraphic && (
                <GraphicDetailModal graphic={selectedGraphic} onClose={() => setSelectedGraphic(null)} />
            )}
        </div>
    );
};
