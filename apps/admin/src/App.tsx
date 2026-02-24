import React, { useState, useEffect } from 'react';
import { Database, Activity, Key, Globe, LayoutDashboard, ImageIcon, History } from 'lucide-react';
import { GraphicsView } from './components/GraphicsView';
import { LogsView } from './components/LogsView';
import type { LogEntry } from './components/LogsView';
import { cn } from './utils';


import WorkersView from './components/WorkersView';
import type { Job, Execution } from './components/WorkersView';
import DashboardView from './components/DashboardView';
import ApiKeyView from './components/ApiKeyView';
import DatabaseView from './components/DatabaseView';
import LeaguesManagementView from './components/LeaguesManagementView';
type Tab = 'dashboard' | 'leagues' | 'api-keys' | 'database' | 'workers' | 'graphics' | 'logs';

interface ConfigStatus {
  isDatabaseConnected: boolean;
  apiFootballKeyMasked: string | null;
  databaseUrlMasked: string | null;
  supabaseUrlMasked: string | null;
  supabaseAnonKeyMasked: string | null;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [config, setConfig] = useState<ConfigStatus | null>(null);

  // Worker State (Lifted)
  const [jobs, setJobs] = useState<Job[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [workersLoading, setWorkersLoading] = useState(true);

  const fetchWorkerData = async () => {
    try {
      const resp = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
                        query {
                            jobs { id name scheduleCron isActive lastRunAt updatedAt }
                            jobExecutions(limit: 20) { id jobId status startedAt finishedAt errorMessage processedCount totalCount apiCallsCount }
                            systemLogs(limit: 100) { id level module message context createdAt }
                        }
                    `
        })
      });
      const json = await resp.json();
      setJobs(json.data?.jobs || []);
      setExecutions(json.data?.jobExecutions || []);
      setLogs(json.data?.systemLogs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setWorkersLoading(false);
    }
  };

  const fetchStatus = async () => {
    try {
      const resp = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `{ configStatus { isDatabaseConnected apiFootballKeyMasked databaseUrlMasked supabaseUrlMasked supabaseAnonKeyMasked } }`
        })
      });
      const json = await resp.json();
      setConfig(json.data?.configStatus);
    } catch (e) {
      console.error('Failed to fetch status:', e);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchWorkerData();
    const interval = setInterval(() => {
      fetchStatus();
      fetchWorkerData();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'leagues', label: 'Inventory', icon: Globe },
    { id: 'api-keys', label: 'Integrations', icon: Key },
    { id: 'database', label: 'Infrastructure', icon: Database },
    { id: 'workers', label: 'Workers', icon: Activity },
    { id: 'graphics', label: 'Graphics', icon: ImageIcon },
    { id: 'logs', label: 'Logs', icon: History },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#020617] text-slate-200 font-sans selection:bg-sky-500/30">
      {/* Sidebar */}
      <aside className="w-72 bg-[#020617] border-r border-slate-800/40 flex flex-col shrink-0">
        <div className="p-8 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-sky-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Globe className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white leading-none">Ultra<span className="text-sky-400">Admin</span></span>
        </div>

        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto pt-4">
          <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Management</p>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as Tab)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative",
                activeTab === item.id
                  ? "bg-sky-500/10 text-sky-400 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.15)]"
                  : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
              )}
            >
              <item.icon className={cn(
                "w-5 h-5 transition-colors duration-200",
                activeTab === item.id ? "text-sky-400" : "text-slate-500 group-hover:text-slate-300"
              )} />
              <span className="font-medium tracking-tight">{item.label}</span>
              {activeTab === item.id && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 mt-auto">
          <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-4 space-y-4 backdrop-blur-xl">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2">Cloud Engine</p>
            <div className="space-y-3">
              <div className="flex items-center gap-3 px-2">
                <div className={cn("w-2 h-2 rounded-full", config?.isDatabaseConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-red-500 animate-pulse")} />
                <span className="text-xs font-medium text-slate-300">PostgreSQL</span>
              </div>
              <div className="flex items-center gap-3 px-2">
                <div className={cn("w-2 h-2 rounded-full", config?.apiFootballKeyMasked ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500 animate-pulse")} />
                <span className="text-xs font-medium text-slate-300">API-Football</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900/40 via-[#020617] to-[#020617]">
        <header className="h-20 border-b border-slate-800/40 flex items-center justify-between px-12 backdrop-blur-md sticky top-0 z-10 bg-[#020617]/50">
          <div>
            <h1 className="text-sm font-medium text-slate-500 flex items-center gap-2">
              Management <span className="text-slate-700">/</span>
              <span className="text-slate-200 capitalize underline decoration-sky-500/30 underline-offset-8 decoration-2 tracking-wide">{activeTab}</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800/50 rounded-full px-4 py-1.5 shadow-inner">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] italic">System Normal</span>
            </div>
          </div>
        </header>

        <div className="p-12 max-w-6xl mx-auto">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 transition-all ease-out">
            {activeTab === 'dashboard' && <DashboardView config={config} />}
            {activeTab === 'api-keys' && <ApiKeyView onUpdate={fetchStatus} />}
            {activeTab === 'database' && <DatabaseView config={config} onUpdate={fetchStatus} />}
            {activeTab === 'leagues' && <LeaguesManagementView jobs={jobs} executions={executions} />}
            {activeTab === 'workers' && (
              <WorkersView
                jobs={jobs}
                executions={executions}
                loading={workersLoading}
                onRefresh={fetchWorkerData}
              />
            )}
            {activeTab === 'graphics' && <GraphicsView />}
            {activeTab === 'logs' && <LogsView logs={logs} onRefresh={fetchWorkerData} />}
          </div>
        </div>
      </main>
    </div>
  );
};
export default App;

