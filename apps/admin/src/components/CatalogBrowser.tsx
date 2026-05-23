import React from 'react';
import { CheckCircle2, Download, Globe, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

interface CatalogLeague {
    id: string;
    sourceId: number;
    name: string;
    type: string;
    logo?: string;
    country: string;
}

interface ManagedLeague {
    id: string;
    sourceId: number;
    name: string;
}

interface Country {
    id: string;
    name: string;
    code?: string;
}

interface CatalogBrowserProps {
    countries: Country[];
    selectedCountry: string;
    setSelectedCountry: (id: string) => void;
    catalogLeagues: CatalogLeague[];
    managedLeagues: ManagedLeague[];
    activateLeague: (id: string) => void;
    actionLoading: string | null;
    initializeCatalog: () => void;
}

export const CatalogBrowser: React.FC<CatalogBrowserProps> = ({
    countries,
    selectedCountry,
    setSelectedCountry,
    catalogLeagues,
    managedLeagues,
    activateLeague,
    actionLoading,
    initializeCatalog,
}) => {
    const isEmpty = countries.length === 0;
    const isInitializing = actionLoading === 'init-catalog';
    const isFetchingCountryLeagues = actionLoading === `country-${selectedCountry}`;
    return (
        <section className="bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm space-y-8 relative overflow-hidden isolate group/box1 transition-all hover:border-slate-800">
            <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/5 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
            <div className="flex items-center justify-between relative z-10">
                <div>
                    <h3 className="text-xl font-semibold text-white flex items-center gap-3">
                        <Globe className="w-5 h-5 text-sky-400" />
                        Catalog Browser
                    </h3>
                    <p className="text-sm text-slate-400 mt-2">
                        Browse the full provider registry and activate leagues for management.
                    </p>
                </div>
                {!isEmpty && (
                    <Select
                        value={selectedCountry || undefined}
                        onValueChange={(v) => setSelectedCountry(v)}
                    >
                        <SelectTrigger className="min-w-[200px] h-10 bg-slate-900 border-slate-700/50 text-white focus-visible:border-sky-500 focus-visible:ring-0">
                            <SelectValue placeholder="Select Country..." />
                        </SelectTrigger>
                        <SelectContent>
                            {countries.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            {isEmpty ? (
                <div className="py-20 text-center border border-dashed border-slate-800/40 rounded-xl bg-slate-900/10 relative z-10">
                    <Globe className="w-8 h-8 text-slate-700 mx-auto mb-4 opacity-30" />
                    <p className="text-sm text-slate-400 font-medium tracking-tight mb-2">
                        Catalog is empty.
                    </p>
                    <p className="text-xs text-slate-500 mb-6">
                        Pull the country and league registry from the upstream provider to get
                        started.
                    </p>
                    <Button
                        variant="outline"
                        onClick={initializeCatalog}
                        disabled={isInitializing}
                        className="h-9 text-xs font-semibold text-sky-400 hover:text-white hover:bg-sky-500/10 border-sky-500/30 disabled:opacity-30"
                    >
                        <Download className="w-4 h-4" />
                        {isInitializing ? 'Initializing...' : 'Initialize Catalog'}
                    </Button>
                </div>
            ) : selectedCountry && isFetchingCountryLeagues ? (
                <div className="py-20 text-center border border-dashed border-slate-800/40 rounded-xl bg-slate-900/10 relative z-10">
                    <Loader2 className="w-6 h-6 animate-spin text-sky-500 mx-auto mb-4" />
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                        Fetching leagues...
                    </p>
                </div>
            ) : selectedCountry ? (
                <div className="max-h-[420px] overflow-y-auto border border-slate-800/40 rounded-xl bg-slate-900/20 relative z-10 backdrop-blur-sm">
                    <Table>
                        <TableHeader className="sticky top-0 z-10">
                            <TableRow className="bg-slate-900 border-slate-800/60 hover:bg-slate-900">
                                <TableHead className="px-6 py-4 font-semibold text-slate-400">
                                    League
                                </TableHead>
                                <TableHead className="px-6 py-4 font-semibold text-slate-400 text-center">
                                    Type
                                </TableHead>
                                <TableHead className="px-6 py-4 font-semibold text-slate-400 text-right">
                                    Action
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-slate-800/40">
                            {catalogLeagues.map((l) => {
                                const isManaged = managedLeagues.some(
                                    (ml) => ml.sourceId === l.sourceId,
                                );
                                return (
                                    <TableRow
                                        key={l.id}
                                        className="hover:bg-slate-800/20 border-0"
                                    >
                                        <TableCell className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {l.logo ? (
                                                    <img
                                                        src={l.logo}
                                                        className="w-6 h-6 rounded bg-white p-0.5"
                                                        alt={l.name}
                                                    />
                                                ) : (
                                                    <div className="w-6 h-6 bg-slate-800 rounded" />
                                                )}
                                                <span className="font-medium text-slate-200">
                                                    {l.name}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-6 py-4 text-center">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded border border-slate-700/30 font-mono">
                                                {l.type}
                                            </span>
                                        </TableCell>
                                        <TableCell className="px-6 py-4 text-right">
                                            {isManaged ? (
                                                <span className="text-emerald-400 text-xs font-semibold flex items-center justify-end gap-1.5">
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    Active
                                                </span>
                                            ) : (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => activateLeague(l.id)}
                                                    disabled={actionLoading === l.id}
                                                    className="h-7 text-xs font-semibold text-sky-400 hover:text-white hover:bg-sky-500/10 border-sky-500/30 disabled:opacity-30"
                                                >
                                                    {actionLoading === l.id
                                                        ? 'Activating...'
                                                        : 'Activate'}
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            ) : (
                <div className="py-20 text-center border border-dashed border-slate-800/40 rounded-xl bg-slate-900/10 relative z-10 group/empty">
                    <Globe className="w-8 h-8 text-slate-700 mx-auto mb-4 opacity-20 group-hover/empty:scale-110 group-hover/empty:text-sky-500 transition-all duration-500" />
                    <p className="text-sm text-slate-500 font-medium tracking-tight">
                        Select a country above to browse and activate leagues.
                    </p>
                </div>
            )}
        </section>
    );
};
