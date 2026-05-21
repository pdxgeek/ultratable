import { Activity, Database, Globe, Key, Trophy } from 'lucide-react';

import StatCard from './StatCard';

interface ConfigStatus {
    isDatabaseConnected: boolean;
    apiFootballKeyMasked: string | null;
    databaseUrlMasked: string | null;
    supabaseUrlMasked: string | null;
    supabaseAnonKeyMasked: string | null;
}

const DashboardView = ({ config }: { config: ConfigStatus | null }) => (
    <div className="space-y-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard
                label="PostgreSQL"
                value={config?.isDatabaseConnected ? 'Active' : 'Disconnected'}
                subValue={config?.databaseUrlMasked || 'Missing connection string'}
                isError={!config?.isDatabaseConnected}
                icon={Database}
            />
            <StatCard
                label="Supabase"
                value={config?.supabaseUrlMasked ? 'Online' : 'Pending'}
                subValue={config?.supabaseUrlMasked || 'Configuration required'}
                isError={!config?.supabaseUrlMasked}
                icon={Globe}
            />
            <StatCard
                label="API-Football"
                value={config?.apiFootballKeyMasked ? 'Authorized' : 'Restricted'}
                subValue={config?.apiFootballKeyMasked || 'Access key missing'}
                isError={!config?.apiFootballKeyMasked}
                icon={Key}
            />
        </div>

        <section>
            <h3 className="text-lg font-medium text-white mb-6">System Health</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-sky-500/10 rounded-xl text-sky-500">
                            <Trophy className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-white">Coverage Status</h4>
                            <p className="text-xs text-slate-500">
                                Data mapped across all providers
                            </p>
                        </div>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed mb-8">
                        Your ingestion index is ready for synchronization. Once active, this service
                        will track points deductions, fixture adjustments, and team availability
                        automatically.
                    </p>
                    <button className="bg-white text-black px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-200 transition-colors shadow-sm">
                        Initialize Data Sync
                    </button>
                </div>

                <div className="bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500">
                            <Activity className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-white">Ingestion Monitor</h4>
                            <p className="text-xs text-slate-500">Background task performance</p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500 underline decoration-slate-800 underline-offset-4">
                                Queue Capacity
                            </span>
                            <span className="font-mono text-emerald-400">Stable</span>
                        </div>
                        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 transition-all duration-1000"
                                style={{ width: config?.isDatabaseConnected ? '100%' : '10%' }}
                            />
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                            Real-time diagnostics are processed at the edge. The system is currently
                            in standby mode awaiting the first worker trigger.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    </div>
);

export default DashboardView;
