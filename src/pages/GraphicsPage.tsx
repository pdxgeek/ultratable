import { useState, useEffect, useMemo, useRef } from 'react';
import { gfxRegistry } from '../services/gfxRegistry';
import type { Graphic, GraphicType } from '../types';
import { nanoid } from 'nanoid';
import { fetchQueue } from '../services/api/fetchQueue';

const GRAPHIC_TYPES: GraphicType[] = ['team_logo', 'venue_image', 'player_photo', 'league_logo'];

export default function GraphicsPage() {
    const [graphics, setGraphics] = useState<Graphic[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<GraphicType | 'all'>('all');
    const [isUploading, setIsUploading] = useState(false);

    // Pagination state
    const [visibleCount, setVisibleCount] = useState(40);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // Upload Form State
    const [uploadType, setUploadType] = useState<GraphicType>('team_logo');
    const [uploadName, setUploadName] = useState('');
    const [uploadAssocId, setUploadAssocId] = useState('');
    const [uploadUrl, setUploadUrl] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const refreshGraphics = () => {
        setGraphics(gfxRegistry.getAll());
    };

    useEffect(() => {
        const init = async () => {
            await gfxRegistry.initialize();
            refreshGraphics();
            setLoading(false);
        };
        init();
    }, []);

    const filteredGraphics = useMemo(() => {
        return graphics.filter(g => {
            const matchesSearch = g.commonName.toLowerCase().includes(search.toLowerCase()) ||
                g.associationId.toLowerCase().includes(search.toLowerCase());
            const matchesType = typeFilter === 'all' || g.type === typeFilter;
            return matchesSearch && matchesType;
        });
    }, [graphics, search, typeFilter]);

    // Reset pagination when filters change
    useEffect(() => {
        setVisibleCount(40);
    }, [search, typeFilter]);

    // Infinite scroll observer
    useEffect(() => {
        if (!sentinelRef.current) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && visibleCount < filteredGraphics.length) {
                setVisibleCount(prev => prev + 40);
            }
        }, { threshold: 0.1 });

        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [filteredGraphics.length, visibleCount]);

    const paginatedGraphics = useMemo(() => {
        return filteredGraphics.slice(0, visibleCount);
    }, [filteredGraphics, visibleCount]);

    const selectedGraphic = useMemo(() =>
        graphics.find(g => g.id === selectedId),
        [graphics, selectedId]);

    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [queueStats, setQueueStats] = useState<{ activeIds: string[], totalStarted: number, totalFinished: number, rate: number }>({
        activeIds: [],
        totalStarted: 0,
        totalFinished: 0,
        rate: 0
    });

    const [apiStats, setApiStats] = useState({ queued: 0, active: 0, finished: 0 });

    useEffect(() => {
        return gfxRegistry.subscribeToQueue(setQueueStats);
    }, []);

    useEffect(() => {
        return fetchQueue.subscribe(setApiStats);
    }, []);

    useEffect(() => {
        if (selectedId) {
            gfxRegistry.loadById(selectedId).then(url => {
                setPreviewUrl(url || null);
            });
        } else {
            setPreviewUrl(null);
        }
    }, [selectedId]);

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadUrl || !uploadName || !uploadAssocId) return;

        const newId = nanoid();
        await gfxRegistry.register({
            id: newId,
            type: uploadType,
            associationId: uploadAssocId,
            commonName: uploadName,
            sourceUrl: uploadUrl
        });
        await gfxRegistry.loadById(newId);
        refreshGraphics();
        setSelectedId(newId);
        setIsUploading(false);

        // Reset form
        setUploadName('');
        setUploadAssocId('');
        setUploadUrl('');
    };

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to delete this graphic?')) {
            await gfxRegistry.deleteGraphic(id);
            refreshGraphics();
            if (selectedId === id) setSelectedId(null);
        }
    };

    const handlePurge = async () => {
        if (confirm('CAUTION: This will delete ALL graphics from your local database and memory. You will need to re-sync or re-upload them. Are you sure?')) {
            await gfxRegistry.purge();
            refreshGraphics();
            setSelectedId(null);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setUploadUrl(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    if (loading) {
        return (
            <div className="graphics-page__loading">
                <div className="loading-screen__spinner" />
                <p>Initializing Registry...</p>
            </div>
        );
    }

    return (
        <div className="graphics-page">
            <div className="graphics-page__header">
                <h1>Graphics Manager</h1>
                <div className="graphics-page__actions">
                    <div className="search-bar">
                        <input
                            type="text"
                            placeholder="Search by name or association ID..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)}>
                        <option value="all">All Types</option>
                        {GRAPHIC_TYPES.map(t => (
                            <option key={t} value={t}>{t.replace('_', ' ')}</option>
                        ))}
                    </select>
                    <button className="btn-danger" onClick={handlePurge}>
                        Purge All
                    </button>
                    <button className="btn-primary" onClick={() => gfxRegistry.loadAll()}>
                        Hard Sync
                    </button>
                    <button className="btn-primary" onClick={() => setIsUploading(!isUploading)}>
                        {isUploading ? 'Cancel' : 'Upload Graphic'}
                    </button>
                </div>
            </div>

            <div className="graphics-page__layout">
                <div className="graphics-page__main">
                    {isUploading ? (
                        <div className="upload-form">
                            <h2>Register New Graphic</h2>
                            <form onSubmit={handleUpload}>
                                <div className="form-group">
                                    <label>Type</label>
                                    <select value={uploadType} onChange={(e) => setUploadType(e.target.value as GraphicType)}>
                                        {GRAPHIC_TYPES.map(t => (
                                            <option key={t} value={t}>{t.replace('_', ' ')}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Name</label>
                                    <input type="text" value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="e.g. Manchester United Logo" />
                                </div>
                                <div className="form-group">
                                    <label>Association ID</label>
                                    <input type="text" value={uploadAssocId} onChange={(e) => setUploadAssocId(e.target.value)} placeholder="e.g. OoUys7Gd0dwZcz8QfKdKK" />
                                </div>
                                <div className="form-group">
                                    <label>Source URL or File</label>
                                    <div className="file-input-group">
                                        <input type="text" value={uploadUrl} onChange={(e) => setUploadUrl(e.target.value)} placeholder="https://..." />
                                        <span>OR</span>
                                        <button type="button" onClick={() => fileInputRef.current?.click()}>Browse File</button>
                                        <input type="file" ref={fileInputRef} hidden onChange={handleFileChange} accept="image/*" />
                                    </div>
                                    {uploadUrl && uploadUrl.startsWith('data:') && (
                                        <div className="upload-preview">
                                            <img src={uploadUrl} alt="Preview" />
                                        </div>
                                    )}
                                </div>
                                <button type="submit" className="btn-submit">Register Graphic</button>
                            </form>
                        </div>
                    ) : (
                        <div className="graphics-grid">
                            {paginatedGraphics.map(g => (
                                <GraphicCard
                                    key={g.id}
                                    graphic={g}
                                    isSelected={selectedId === g.id}
                                    onClick={() => setSelectedId(g.id)}
                                />
                            ))}
                            {visibleCount < filteredGraphics.length && (
                                <div ref={sentinelRef} className="graphics-grid__sentinel">
                                    <div className="spinner-small" />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="graphics-page__sidebar">
                    {queueStats.activeIds.length > 0 && (
                        <div className="fetch-queue">
                            <div className="fetch-queue__header">
                                <h3>Active Downloads ({queueStats.activeIds.length})</h3>
                                <span className="fetch-rate">{queueStats.rate.toFixed(1)}/s</span>
                            </div>

                            <div className="progress-container">
                                <div
                                    className="progress-bar"
                                    style={{ width: `${(queueStats.totalFinished / queueStats.totalStarted) * 100}%` }}
                                />
                                <span className="progress-text">
                                    {queueStats.totalFinished} / {queueStats.totalStarted}
                                </span>
                            </div>

                            <div className="fetch-queue__list">
                                {queueStats.activeIds.slice(0, 10).map(id => {
                                    const g = filteredGraphics.find(x => x.id === id) ||
                                        paginatedGraphics.find(x => x.id === id);
                                    return (
                                        <div key={id} className="fetch-queue__item">
                                            <div className="spinner-mini" />
                                            <span>{g ? `${g.commonName} (${g.type})` : id}</span>
                                        </div>
                                    );
                                })}
                                {queueStats.activeIds.length > 10 && (
                                    <div className="fetch-queue__more">
                                        + {queueStats.activeIds.length - 10} more...
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {(apiStats.queued > 0 || apiStats.active > 0) && (
                        <div className="api-queue">
                            <h3>API Requests</h3>
                            <div className="api-queue__stats">
                                <div className="api-stat">
                                    <span className="api-stat__label">Queued</span>
                                    <span className="api-stat__value">{apiStats.queued}</span>
                                </div>
                                <div className="api-stat">
                                    <span className="api-stat__label">Active</span>
                                    <span className="api-stat__value">{apiStats.active} / 3</span>
                                </div>
                                {apiStats.active > 0 && <div className="spinner-mini" />}
                            </div>
                        </div>
                    )}

                    {selectedGraphic ? (
                        <div className="graphic-details">
                            <div className="graphic-details__preview">
                                {previewUrl ? (
                                    <img src={previewUrl} alt={selectedGraphic.commonName} />
                                ) : (
                                    <div className="preview-loading">Loading...</div>
                                )}
                            </div>
                            <h3>{selectedGraphic.commonName}</h3>
                            <div className="graphic-details__info">
                                <p><strong>ID:</strong> <code>{selectedGraphic.id}</code></p>
                                <p><strong>Type:</strong> <code>{selectedGraphic.type}</code></p>
                                <p><strong>Assoc ID:</strong> <code>{selectedGraphic.associationId}</code></p>
                                <p><strong>Assoc Type:</strong> <code>{selectedGraphic.associationType || 'n/a'}</code></p>
                                <p><strong>Refreshed:</strong> {new Date(selectedGraphic.lastRefreshed).toLocaleString()}</p>
                                <p className="source-url"><strong>Source:</strong> <a href={selectedGraphic.variants[0]?.sourceUrl} target="_blank" rel="noreferrer">{selectedGraphic.variants[0]?.sourceUrl}</a></p>
                            </div>
                            <div className="graphic-details__actions">
                                <button className="btn-delete" onClick={() => handleDelete(selectedGraphic.id)}>Delete</button>
                            </div>
                        </div>
                    ) : (
                        <div className="sidebar-empty">
                            <p>Select a graphic to view details</p>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .graphics-page {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    padding: 24px;
                }
                .graphics-page__header {
                    margin-bottom: 32px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .graphics-page__actions {
                    display: flex;
                    gap: 16px;
                    align-items: center;
                }
                .search-bar input {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    padding: 8px 16px;
                    border-radius: 8px;
                    color: white;
                    width: 300px;
                }
                .graphics-page__layout {
                    flex: 1;
                    display: flex;
                    gap: 24px;
                    min-height: 0;
                }
                .graphics-page__main {
                    flex: 1;
                    overflow-y: auto;
                    padding-right: 8px;
                }
                .graphics-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
                    gap: 16px;
                }
                .graphics-grid__sentinel {
                    grid-column: 1 / -1;
                    padding: 24px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                .graphics-page__sidebar {
                    width: 320px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                }
                .graphic-card {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                    text-align: center;
                }
                .graphic-card:hover { border-color: var(--accent-blue); background: var(--bg-row-hover); }
                .graphic-card--selected { border-color: var(--accent-blue); box-shadow: 0 0 0 2px var(--accent-blue); }
                
                .graphic-card__img-container {
                    width: 100%;
                    aspect-ratio: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--bg-tertiary);
                    border-radius: 8px;
                    overflow: hidden;
                }
                .graphic-card__img-container img {
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                }
                .graphic-card span {
                    font-size: 0.75rem;
                    font-weight: 500;
                    color: var(--text-primary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    width: 100%;
                }
                .graphic-card .type-tag {
                    font-size: 0.6rem;
                    text-transform: uppercase;
                    color: var(--text-muted);
                    background: var(--bg-tertiary);
                    padding: 2px 6px;
                    border-radius: 4px;
                }

                .graphic-details__preview {
                    width: 100%;
                    aspect-ratio: 16/10;
                    background: var(--bg-tertiary);
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 20px;
                    overflow: hidden;
                }
                .graphic-details__preview img {
                    max-width: 90%;
                    max-height: 90%;
                    object-fit: contain;
                }
                .graphic-details h3 { margin-bottom: 16px; font-size: 1.2rem; }
                .graphic-details__info { display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; }
                .graphic-details__info p { font-size: 0.85rem; color: var(--text-secondary); }
                .graphic-details__info code { background: var(--bg-tertiary); padding: 2px 4px; border-radius: 4px; font-size: 0.8rem; }
                .source-url { overflow: hidden; text-overflow: ellipsis; }
                .source-url a { color: var(--accent-blue); text-decoration: none; }

                .upload-form { max-width: 600px; }
                .upload-form h2 { margin-bottom: 24px; }
                .form-group { margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px; }
                .form-group label { font-size: 0.9rem; font-weight: 600; }
                .form-group input, .form-group select {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    padding: 10px;
                    border-radius: 6px;
                    color: white;
                }
                .file-input-group { display: flex; align-items: center; gap: 12px; }
                .file-input-group span { font-size: 0.8rem; color: var(--text-muted); }
                .file-input-group button { background: var(--bg-tertiary); border: 1px solid var(--border-color); color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
                .btn-submit { background: var(--accent-blue); color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 600; cursor: pointer; margin-top: 16px; }
                .upload-preview { margin-top: 12px; width: 100px; height: 100px; border-radius: 8px; border: 1px solid var(--border-color); overflow: hidden; }
                .upload-preview img { width: 100%; height: 100%; object-fit: contain; }

                .btn-primary { background: var(--accent-blue); color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 500; cursor: pointer; }
                .btn-danger { background: var(--accent-red); color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 500; cursor: pointer; }
                .btn-delete { background: var(--accent-red); color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; width: 100%; }
                
                .sidebar-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); text-align: center; }

                .fetch-queue {
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 20px;
                }
                .fetch-queue h3 { font-size: 0.9rem; margin-bottom: 0; color: var(--accent-blue); }
                .fetch-queue__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
                .fetch-rate { font-size: 0.7rem; color: var(--text-muted); font-weight: 600; }
                
                .progress-container {
                    height: 16px;
                    background: var(--bg-secondary);
                    border-radius: 8px;
                    margin-bottom: 12px;
                    position: relative;
                    overflow: hidden;
                    border: 1px solid var(--border-color);
                }
                .progress-bar {
                    height: 100%;
                    background: var(--accent-blue);
                    transition: width 0.3s ease;
                }
                .progress-text {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.65rem;
                    font-weight: 700;
                    color: white;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
                }

                .fetch-queue__list { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto; }
                .fetch-queue__more { font-size: 0.7rem; color: var(--text-muted); text-align: center; padding: 4px; }
                
                .api-queue {
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 20px;
                }
                .api-queue h3 { font-size: 0.9rem; margin-bottom: 8px; color: var(--accent-green); }
                .api-queue__stats { display: flex; align-items: center; gap: 16px; }
                .api-stat { display: flex; flex-direction: column; gap: 2px; }
                .api-stat__label { font-size: 0.6rem; text-transform: uppercase; color: var(--text-muted); }
                .api-stat__value { font-size: 0.9rem; font-weight: 700; color: white; }

                .fetch-queue__item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                    background: var(--bg-secondary);
                    padding: 4px 8px;
                    border-radius: 4px;
                }
                .spinner-mini {
                    width: 12px;
                    height: 12px;
                    border: 2px solid rgba(255,255,255,0.1);
                    border-top-color: var(--accent-blue);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}

function GraphicCard({ graphic, isSelected, onClick }: { graphic: Graphic; isSelected: boolean; onClick: () => void }) {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        gfxRegistry.loadById(graphic.id).then(url => setUrl(url || null));
    }, [graphic.id]);

    return (
        <div className={`graphic-card ${isSelected ? 'graphic-card--selected' : ''}`} onClick={onClick}>
            <div className="graphic-card__img-container">
                {url ? <img src={url} alt={graphic.commonName} /> : <div className="spinner-small" />}
            </div>
            <span>{graphic.commonName}</span>
            <div className="type-tag">
                {graphic.type.replace('_', ' ')}
                {graphic.associationType && ` (${graphic.associationType})`}
            </div>
        </div>
    );
}
