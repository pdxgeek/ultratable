import { useState, useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { backupService } from '../services/backupService';
import { useLeague } from '../context/LeagueContext';
import { database } from '../services/db';

interface SchemaBlockProps {
    title: string;
    description: string;
    code: string;
    tag?: string;
}

function SchemaBlock({ title, description, code, tag = 'Interface' }: SchemaBlockProps) {
    return (
        <div className="schema-block">
            <div className="schema-block__header">
                <div className="schema-block__title-row">
                    <h3 className="schema-block__title">{title}</h3>
                    <span className="schema-block__tag">{tag}</span>
                </div>
                <p className="schema-block__description">{description}</p>
            </div>
            <div className="code-container">
                <SyntaxHighlighter
                    language="typescript"
                    style={vscDarkPlus}
                    customStyle={{
                        margin: 0,
                        padding: '24px',
                        borderRadius: '0',
                        fontSize: '0.9rem',
                        background: 'transparent',
                        lineHeight: '1.7',
                    }}
                >
                    {code}
                </SyntaxHighlighter>
            </div>
        </div>
    );
}

export default function DataPage() {
    const { activeLeague, activeSeason, isLoading } = useLeague();
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [message, setMessage] = useState<{ text: string; mode: 'success' | 'error' | 'info' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExport = async () => {
        if (!activeLeague || !activeSeason) return;
        setIsExporting(true);
        setMessage({ text: 'Generating archive...', mode: 'info' });
        try {
            // Backup service still expects numeric IDs for some operations, 
            // but we can pass the NanoID as string and cast if necessary
            // or better, fix the backup service.
            const blob = await backupService.exportToZip(activeLeague.id as any, activeSeason.season);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ultratable_${activeLeague.commonName.toLowerCase().replace(/\s+/g, '_')}_${activeSeason.season}.ula`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setMessage({ text: 'Backup exported successfully!', mode: 'success' });
        } catch (err: any) {
            console.error('Export failed:', err);
            setMessage({ text: `Export failed: ${err.message}`, mode: 'error' });
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        setMessage({ text: 'Importing data...', mode: 'info' });
        try {
            const manifest = await backupService.importFromZip(file);
            setMessage({
                text: `Successfully imported "${manifest.leagueName}" (${manifest.season}). Refresh the page to see changes.`,
                mode: 'success'
            });
            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err: any) {
            console.error('Import failed:', err);
            setMessage({ text: `Import failed: ${err.message}`, mode: 'error' });
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="page data-page">
            <div style={{ marginBottom: '48px' }}>
                <h1 className="page__title" style={{ fontSize: '2.5rem', marginBottom: '12px' }}>Data Management</h1>
                <p className="page__subtitle" style={{ fontSize: '1.2rem', opacity: 0.8 }}>
                    Inspect code schemas, manage local backups, and migrate season data.
                </p>
            </div>

            {/* Backup/Restore Actions */}
            <div className="card" style={{ marginBottom: '64px', padding: '32px', background: 'var(--card-bg-elevated)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Backup & Restore</h2>
                        <p style={{ opacity: 0.7 }}>Export your current league data to an offline `.ula` archive or restore from a previous backup.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            accept=".ula,.zip"
                            onChange={handleFileChange}
                        />
                        <button
                            className="btn btn--secondary"
                            onClick={handleImportClick}
                            disabled={isImporting || isExporting}
                        >
                            {isImporting ? 'Importing...' : 'Restore Backup'}
                        </button>
                        <button
                            className="btn btn--primary"
                            onClick={handleExport}
                            disabled={isExporting || isImporting || !activeLeague || isLoading}
                        >
                            {isExporting ? 'Exporting...' : 'Export Season (.ula)'}
                        </button>
                    </div>
                </div>

                {message && (
                    <div style={{
                        padding: '12px 16px',
                        borderRadius: '6px',
                        background: message.mode === 'success' ? 'rgba(76, 175, 80, 0.1)' : message.mode === 'error' ? 'rgba(244, 67, 54, 0.1)' : 'rgba(33, 150, 243, 0.1)',
                        color: message.mode === 'success' ? '#81c784' : message.mode === 'error' ? '#e57373' : '#64b5f6',
                        border: `1px solid ${message.mode === 'success' ? '#4caf50' : message.mode === 'error' ? '#f44336' : '#2196f3'}`,
                        fontSize: '0.9rem'
                    }}>
                        {message.text}
                    </div>
                )}

                {activeLeague && activeSeason && !isLoading && (
                    <div style={{ marginTop: '24px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Target: <strong>{activeLeague.commonName}</strong> ({activeSeason.season})
                    </div>
                )}
            </div>

            {/* System Maintenance */}
            <div className="card" style={{ marginBottom: '64px', padding: '32px', background: 'var(--card-bg-elevated)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>System Maintenance</h2>
                        <p style={{ opacity: 0.7 }}>Repair data associations and clear caches to resolve sync issues.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            className="btn btn--secondary"
                            onClick={async () => {
                                setMessage({ text: 'Repairing associations...', mode: 'info' });
                                try {
                                    const count = await database.repairTeamAssociations();
                                    setMessage({ text: `Successfully repaired associations for ${count} seasons!`, mode: 'success' });
                                } catch (err: any) {
                                    setMessage({ text: `Repair failed: ${err.message}`, mode: 'error' });
                                }
                            }}
                        >
                            Repair Season Team Associations
                        </button>
                        <button
                            className="btn btn--danger"
                            onClick={async () => {
                                if (confirm('Are you absolutely sure? This will purge ALL local data including custom leagues and rules.')) {
                                    setMessage({ text: 'Purging all data...', mode: 'info' });
                                    try {
                                        await database.clearAllCache();
                                        window.location.reload();
                                    } catch (err: any) {
                                        setMessage({ text: `Purge failed: ${err.message}`, mode: 'error' });
                                    }
                                }
                            }}
                        >
                            Purge All Data
                        </button>
                    </div>
                </div>
            </div>

            <h2 style={{ fontSize: '1.5rem', marginBottom: '24px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>Core Domain (Top Level)</h2>
            <div className="schema-grid" style={{ marginBottom: '64px' }}>
                <SchemaBlock
                    title="LeagueConfig"
                    tag="Root Entity"
                    description="The foundational configuration for a league season. Orchestrates rules, integration bindings, and manual point modifications."
                    code={`export interface LeagueConfig {
  id: number;
  name: string;
  season: number;
  rules: {
    promotionSlots: number;
    playoffStart: number;
    relegationStart: number;
    pointsForWin: number;
    pointsForDraw: number;
    pointsForLoss: number;
    pointModifications?: PointModification[];
  };
  integrations: IntegrationName;
}`}
                />

                <SchemaBlock
                    title="IntegrationReference"
                    tag="Mapping"
                    description="Formal link to a remote provider's data. Entities store a list of these to allow multi-mapping."
                    code={`export interface IntegrationReference {
  integrationName: IntegrationName; // e.g. 'api-football'
  remoteId: string;                 // e.g. '33'
}`}
                />

                <SchemaBlock
                    title="Team"
                    tag="Core Entity"
                    description="The unified representation of a club across all data providers. Their source is determined by the League."
                    code={`export interface Team extends BaseEntity {
  id: string; // Internal NanoID
  externalReferences: IntegrationReference[];
  commonName: string;
  shortCode: string | null;
  logo: BlobURL;
  venue: string | null;
  city: string | null;
}`}
                />

                <SchemaBlock
                    title="Fixture"
                    tag="Core Entity"
                    description="A point-in-time match event. Fully denormalized references for instant UI rendering."
                    code={`export interface Fixture extends BaseEntity {
  id: string;
  externalReferences: IntegrationReference[];
  date: ISOString;
  status: 'scheduled' | 'played' | 'live' | 'postponed';
  homeGoals: number | null;
  awayGoals: number | null;
  venue: string | null;
  gameweek: number;
  eventsLoaded: boolean;
}`}
                />

                <SchemaBlock
                    title="Player"
                    tag="Core Entity"
                    description="Professional athletes within the ecosystem. Associated with teams and fixtures through events and lineups."
                    code={`export interface Player extends BaseEntity {
  id: string; // Internal NanoID
  externalReferences: IntegrationReference[];
  commonName: string;
  number: number;
  pos: 'GK' | 'DF' | 'MF' | 'FW';
  photo?: BlobURL;
}`}
                />
            </div>

            <h2 style={{ fontSize: '1.5rem', marginBottom: '24px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>Derived & Support Structures</h2>
            <div className="schema-grid">
                <SchemaBlock
                    title="StandingsRow"
                    tag="Calculated"
                    description="The compiled product of fixtures and league rules. Used to power the live standings table."
                    code={`export interface StandingsRow {
  position: number;
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalDifference: number;
  points: number;
  form: FormEntry[]; // Latest 5 matches
}`}
                />

                <SchemaBlock
                    title="PointModification"
                    tag="Rule Override"
                    description="Manual adjustments to team points (e.g., federation deductions or appeals)."
                    code={`export interface PointModification {
  teamId: string;
  modification: number; // Positive or negative integer
  note: string;         // Reason (e.g., "Financial breach")
}`}
                />

                <SchemaBlock
                    title="IntegrationCapabilities"
                    tag="Configuration"
                    description="Granular control over which provider powers specific data types. Values represent the Integration Name."
                    code={`export interface IntegrationCapabilities {
  fixtures: IntegrationName;    // e.g. 'api-football'
  standings: IntegrationName;   // Source for live tables
  basicTeamInfo: IntegrationName;
  teamLogos: IntegrationName;
  roster: IntegrationName;
  playerPhotos: IntegrationName;
}`}
                />
            </div>
        </div>
    );
}
