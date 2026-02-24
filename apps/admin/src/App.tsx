import React, { useState, useEffect } from 'react';
import { Database, Activity, Key, Globe, LayoutDashboard, CheckCircle2, AlertCircle, Trophy, Play, History, Settings, Loader2, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

type Tab = 'dashboard' | 'leagues' | 'api-keys' | 'database' | 'workers' | 'logs';

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
  const [jobs, setJobs] = useState<any[]>([]);
  const [executions, setExecutions] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
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
            {activeTab === 'logs' && <LogsView logs={logs} onRefresh={fetchWorkerData} />}
          </div>
        </div>
      </main>
    </div>
  );
};

const WorkersView = ({ jobs, executions, loading, onRefresh }: {
  jobs: any[],
  executions: any[],
  loading: boolean,
  onRefresh: () => Promise<void>
}) => {
  const [runningJob, setRunningJob] = useState<string | null>(null);

  const runJob = async (name: string) => {
    setRunningJob(name);
    try {
      await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation Run($name: String!) { runJob(name: $name) { id status } }`,
          variables: { name }
        })
      });
      await onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setRunningJob(null);
    }
  };

  if (loading && jobs.length === 0) {
    return (
      <div className="py-32 text-center bg-slate-900/10 border border-dashed border-slate-800/40 rounded-3xl">
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin mx-auto mb-6" />
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Waking Workers...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Jobs Header */}
      <div className="flex justify-between items-center bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/5 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
        <div className="relative z-10">
          <h3 className="text-xl font-semibold text-white flex items-center gap-3">
            <Activity className="w-5 h-5 text-sky-400" />
            Background Service Registry
          </h3>
          <p className="text-sm text-slate-400 mt-2 font-normal leading-relaxed max-w-lg">
            Monitor and manually trigger scheduled tasks. The system utilizes a distributed job runner to ensure data freshless across all providers.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Active Jobs List */}
        <div className="lg:col-span-2 space-y-6">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-2">Active Jobs</h4>
          <div className="grid grid-cols-1 gap-4">
            {jobs.map(job => (
              <div key={job.id} className="bg-[#0d1117] border border-slate-800/60 p-6 rounded-2xl hover:border-slate-700 transition-all group flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-5">
                  <div className={cn(
                    "p-3 rounded-xl transition-colors",
                    job.isActive ? "bg-sky-500/10 text-sky-400" : "bg-slate-800/40 text-slate-500"
                  )}>
                    <Settings className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="font-semibold text-white tracking-tight">{job.name}</h5>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800/50">
                        {job.scheduleCron || 'Manual Only'}
                      </span>
                      {job.lastRunAt && (
                        <span className="text-[10px] text-slate-400">
                          Last Run: {new Date(job.lastRunAt).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => runJob(job.name)}
                  disabled={runningJob === job.name}
                  className="p-2.5 bg-sky-500/10 text-sky-400 hover:bg-sky-500 hover:text-white rounded-xl transition-all disabled:opacity-30 group/btn relative"
                  title="Run Now"
                >
                  {runningJob === job.name ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Play className="w-5 h-5 fill-current transition-transform group-hover/btn:scale-110" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Execution History */}
        <div className="space-y-6">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-2 flex items-center justify-between">
            Recent History
            <History className="w-3.5 h-3.5 opacity-40" />
          </h4>
          <div className="bg-[#0b0f15]/50 border border-slate-800/60 rounded-3xl overflow-hidden backdrop-blur-md">
            <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-800/40">
              {executions.length === 0 ? (
                <div className="p-12 text-center text-slate-600">
                  <p className="text-xs font-medium">No system events logged yet.</p>
                </div>
              ) : (
                executions.map(ex => (
                  <div key={ex.id} className="p-5 hover:bg-slate-800/20 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className={cn(
                        "text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                        ex.status === 'success' ? "bg-emerald-500/10 text-emerald-400" :
                          ex.status === 'failed' ? "bg-red-500/10 text-red-400" :
                            "bg-amber-500/10 text-amber-400"
                      )}>
                        {ex.status}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {new Date(ex.startedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 font-medium truncate mb-1">
                      {jobs.find(j => j.id === ex.jobId)?.name || 'Unknown Job'}
                    </div>
                    <div className="flex gap-4 items-center">
                      {ex.processedCount > 0 && (
                        <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-medium">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500/50" />
                          {ex.processedCount} records
                        </div>
                      )}
                      {ex.apiCallsCount > 0 && (
                        <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-medium">
                          <Globe className="w-3 h-3 text-sky-500/50" />
                          {ex.apiCallsCount} API calls
                        </div>
                      )}
                    </div>
                    {ex.errorMessage && (
                      <p className="text-[10px] text-red-400/80 leading-relaxed font-normal mt-2 bg-red-950/20 p-2 rounded-lg border border-red-500/10">
                        {ex.errorMessage}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

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
        label="RapidAPI"
        value={config?.apiFootballKeyMasked ? 'Authorized' : 'Restricted'}
        subValue={config?.apiFootballKeyMasked ? 'X-RapidAPI Key Active' : 'Access key missing'}
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
              <p className="text-xs text-slate-500">Data mapped across all providers</p>
            </div>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed mb-8">
            Your ingestion index is ready for synchronization. Once active, this service will track points deductions, fixture adjustments, and team availability automatically.
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
              <span className="text-slate-500 underline decoration-slate-800 underline-offset-4">Queue Capacity</span>
              <span className="font-mono text-emerald-400">Stable</span>
            </div>
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: config?.isDatabaseConnected ? '100%' : '10%' }} />
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Real-time diagnostics are processed at the edge. The system is currently in standby mode awaiting the first worker trigger.
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
);

const ApiKeyView = ({ onUpdate }: { onUpdate: () => void }) => {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const onConfigure = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      const response = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation ConfigureKey($key: String!) { configureApiKey(key: $key) }`,
          variables: { key: value }
        })
      });

      if (!response.ok) throw new Error('Network response not ok');
      const result = await response.json();

      if (result.data?.configureApiKey) {
        setStatus('success');
        setValue('');
        setTimeout(() => setStatus('idle'), 3000);
        onUpdate();
      } else {
        setStatus('error');
      }
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  return (
    <div className="max-w-3xl space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm">
        <h3 className="text-lg font-semibold text-white mb-2">RapidAPI Credentials</h3>
        <p className="text-sm text-slate-400 mb-10 leading-relaxed font-normal">
          Provide your API-Football authentication key. This key will be securely committed to the server&apos;s environment and used for all subsequent data fetches.
        </p>

        <form onSubmit={onConfigure} className="space-y-8">
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
              <Key className="w-3.5 h-3.5" />
              RapidAPI Secret Key
            </label>
            <input
              type="password"
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/10 transition-all font-mono"
              placeholder="e.g. 29da7bc40b13..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center gap-6 pt-2">
            <button
              type="submit"
              disabled={status === 'loading'}
              className="bg-sky-500 hover:bg-sky-400 text-white px-8 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50 transition-all shadow-sm shadow-sky-500/10"
            >
              {status === 'loading' ? 'Encrypting...' : 'Update Integration'}
            </button>

            {status === 'success' && (
              <span className="text-emerald-400 text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Key synchronized
              </span>
            )}

            {status === 'error' && (
              <span className="text-red-400 text-xs font-medium flex items-center gap-2 animate-pulse">
                <AlertCircle className="w-4 h-4" />
                Cloud write failure
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

const DatabaseView = ({ config, onUpdate }: { config: ConfigStatus | null, onUpdate: () => void }) => {
  const [dbUrl, setDbUrl] = useState('');
  const [sUrl, setSUrl] = useState('');
  const [sKey, setSKey] = useState('');
  const [dbStatus, setDbStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [sStatus, setSStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const onConfigureDb = async (e: React.FormEvent) => {
    e.preventDefault();
    setDbStatus('loading');
    try {
      const response = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation Configure($url: String!) { configureDatabase(url: $url) }`,
          variables: { url: dbUrl }
        })
      });
      if (!response.ok) throw new Error('Response Error');
      const result = await response.json();
      if (result.data?.configureDatabase) {
        setDbStatus('success');
        setDbUrl('');
        setTimeout(() => setDbStatus('idle'), 3000);
        onUpdate();
      } else {
        setDbStatus('error');
      }
    } catch (err) {
      console.error(err);
      setDbStatus('error');
    }
  };

  const onConfigureSupabase = async (e: React.FormEvent) => {
    e.preventDefault();
    setSStatus('loading');
    try {
      const response = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation ConfigureSup($url: String!, $key: String!) { configureSupabase(url: $url, anonKey: $key) }`,
          variables: { url: sUrl, key: sKey }
        })
      });
      if (!response.ok) throw new Error('Response Error');
      const result = await response.json();
      if (result.data?.configureSupabase) {
        setSStatus('success');
        setSUrl('');
        setSKey('');
        setTimeout(() => setSStatus('idle'), 3000);
        onUpdate();
      } else {
        setSStatus('error');
      }
    } catch (err) {
      console.error(err);
      setSStatus('error');
    }
  };

  return (
    <div className="max-w-4xl space-y-16 pb-24">
      {/* Database Setup */}
      <section className="bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm">
        <div className="flex items-center gap-5 mb-10">
          <div className={cn(
            "p-4 rounded-xl shadow-sm transition-colors",
            config?.isDatabaseConnected ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
          )}>
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-white">PostgreSQL Connection</h3>
            <p className="text-sm text-slate-400 mt-1">The primary relational store for engine data.</p>
          </div>
        </div>

        <div className="bg-slate-900/40 rounded-xl p-6 mb-10 border border-slate-800/40">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Connection String</span>
            <span className={cn(
              "text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
              config?.isDatabaseConnected ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
            )}>
              {config?.isDatabaseConnected ? 'Live' : 'Inactive'}
            </span>
          </div>
          <code className="text-xs font-mono text-slate-400 block break-all leading-relaxed">
            {config?.databaseUrlMasked || 'No direct connection has been mapped yet.'}
          </code>
        </div>

        <form onSubmit={onConfigureDb} className="space-y-6">
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-400">Connection Endpoint</label>
            <input
              type="text"
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 focus:border-sky-500/50 focus:outline-none transition-all font-mono"
              placeholder="postgresql://user:pass@host:port/dbname"
              value={dbUrl}
              onChange={(e) => setDbUrl(e.target.value)}
              required
            />
          </div>
          <div className="flex items-center gap-6">
            <button
              type="submit"
              disabled={dbStatus === 'loading'}
              className="bg-white text-black px-8 py-2.5 rounded-lg font-semibold text-sm hover:bg-slate-200 transition-all"
            >
              {dbStatus === 'loading' ? 'Verifying...' : 'Commit Changes'}
            </button>
            {dbStatus === 'success' && <p className="text-emerald-400 text-xs font-medium">Write successful. Restarting engine.</p>}
            {dbStatus === 'error' && <p className="text-red-400 text-xs font-medium">Connection test failed.</p>}
          </div>
        </form>
      </section>

      {/* Supabase SDK */}
      <section className="bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm">
        <div className="flex items-center gap-5 mb-10">
          <div className="p-4 bg-emerald-500/10 rounded-xl text-emerald-500 shadow-sm">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-white">Supabase Cloud Platform</h3>
            <p className="text-sm text-slate-400 mt-1">Cloud primitives for storage and real-time synchronization.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          <div className="bg-slate-900/40 p-5 rounded-xl border border-slate-800/40">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Project Host</p>
            <p className="text-xs font-mono text-slate-400">{config?.supabaseUrlMasked || 'Pending'}</p>
          </div>
          <div className="bg-slate-900/40 p-5 rounded-xl border border-slate-800/40">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Public Access Key</p>
            <p className="text-xs font-mono text-slate-400">{config?.supabaseAnonKeyMasked || 'Pending'}</p>
          </div>
        </div>

        <form onSubmit={onConfigureSupabase} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-400">Project Endpoint</label>
              <input
                type="text"
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-700 focus:border-emerald-500/50 focus:outline-none transition-all font-mono"
                placeholder="https://project.supabase.co"
                value={sUrl}
                onChange={(e) => setSUrl(e.target.value)}
                required
              />
            </div>
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-400">Anon Key / Service Key</label>
              <input
                type="password"
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-700 focus:border-emerald-500/50 focus:outline-none transition-all font-mono"
                placeholder="eyJhbG..."
                value={sKey}
                onChange={(e) => setSKey(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button
              type="submit"
              disabled={sStatus === 'loading'}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2.5 rounded-lg font-semibold text-sm transition-all shadow-sm shadow-emerald-600/10"
            >
              {sStatus === 'loading' ? 'Encrypting...' : 'Sync Credentials'}
            </button>
            {sStatus === 'success' && <p className="text-emerald-400 text-xs font-medium">SDK initialized successfully.</p>}
            {sStatus === 'error' && <p className="text-red-400 text-xs font-medium">Validation failed.</p>}
          </div>
        </form>
      </section>

      <div className="bg-slate-900/20 border border-slate-800/40 p-8 rounded-2xl flex gap-6 items-start">
        <AlertCircle className="w-5 h-5 text-slate-500 mt-1" />
        <p className="text-sm text-slate-400 leading-relaxed max-w-3xl font-normal">
          All configuration updates are written to the <code className="text-emerald-400 font-mono">.env</code> file. The service will automatically cycle and re-initialize connections upon detection of environment changes.
        </p>
      </div>
    </div>
  );
};

const LeaguesManagementView = ({ jobs = [], executions = [] }: { jobs?: any[], executions?: any[] }) => {
  const [countries, setCountries] = useState<any[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [catalogLeagues, setCatalogLeagues] = useState<any[]>([]);
  const [managedLeagues, setManagedLeagues] = useState<any[]>([]);

  // Box 2 (Importer) State
  const [selectedCatalogLeagueId, setSelectedCatalogLeagueId] = useState<string>('');
  const [catalogLeagueMetadata, setCatalogLeagueMetadata] = useState<any | null>(null);
  const [seasonsForCatalogLeague, setSeasonsForCatalogLeague] = useState<any[]>([]);

  // Box 3 (Config) State
  const [selectedConfigLeagueId, setSelectedConfigLeagueId] = useState<string>('');
  const [configSeasons, setConfigSeasons] = useState<any[]>([]);
  const [selectedConfigSeasonId, setSelectedConfigSeasonId] = useState<string>('');

  const [deductions, setDeductions] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = async () => {
    console.log('LeaguesManagementView: Fetching countries and managed leagues...');
    try {
      const resp = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query {
              catalogCountries { id name code flag }
              leagues { id name sourceId }
            }
          `
        })
      });
      const json = await resp.json();
      setCountries(json.data?.catalogCountries || []);
      setManagedLeagues(json.data?.leagues || []);
    } catch (e) {
      console.error('LeaguesManagementView: fetchData error:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCatalogLeagues = async (countryId: string) => {
    if (!countryId) return;
    try {
      const resp = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query($id: String!) { catalogLeagues(countryId: $id) { id name type logo sourceId seasons { year current } } }`,
          variables: { id: countryId }
        })
      });
      const json = await resp.json();
      setCatalogLeagues(json.data?.catalogLeagues || []);
    } catch (e) {
      console.error('LeaguesManagementView: fetchCatalogLeagues error:', e);
    }
  };

  const refreshProviderSeasons = async () => {
    if (!catalogLeagueMetadata) return;
    setActionLoading('refresh-catalog');
    try {
      const resp = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation($id: String!) { refreshCatalogSeasons(catalogId: $id) { id seasons { year current } } }`,
          variables: { id: catalogLeagueMetadata.id }
        })
      });
      const json = await resp.json();
      if (json.data?.refreshCatalogSeasons) {
        setCatalogLeagueMetadata({
          ...catalogLeagueMetadata,
          seasons: json.data.refreshCatalogSeasons.seasons
        });
      }
    } catch (e) {
      console.error('Refresh error:', e);
    } finally {
      setActionLoading(null);
    }
  };

  const fetchInternalSeasons = async (leagueId: string, setTask: (seasons: any[]) => void) => {
    try {
      const resp = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query($id: String!) { seasons(leagueId: $id) { id year configJson fixtureCount teamCount } }`,
          variables: { id: leagueId }
        })
      });
      const json = await resp.json();
      setTask(json.data?.seasons || []);
    } catch (e) {
      console.error('LeaguesManagementView: fetchInternalSeasons error:', e);
    }
  };

  const fetchCatalogMetadataBySourceId = async (sourceId: number) => {
    try {
      const resp = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query($sourceId: Int!) { catalogLeagues(sourceId: $sourceId) { id seasons { year current } } }`,
          variables: { sourceId }
        })
      });
      const json = await resp.json();
      if (json.data?.catalogLeagues?.[0]) {
        setCatalogLeagueMetadata(json.data.catalogLeagues[0]);
      }
    } catch (e) {
      console.error('LeaguesManagementView: fetchCatalogMetadataBySourceId error:', e);
    }
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (selectedCountry) fetchCatalogLeagues(selectedCountry);
    else setCatalogLeagues([]);
  }, [selectedCountry]);

  // Box 2 Effect
  useEffect(() => {
    if (selectedCatalogLeagueId) {
      fetchInternalSeasons(selectedCatalogLeagueId, setSeasonsForCatalogLeague);

      const league = managedLeagues.find(l => l.id === selectedCatalogLeagueId);
      if (league?.sourceId) {
        fetchCatalogMetadataBySourceId(league.sourceId);
      }
    } else {
      setSeasonsForCatalogLeague([]);
      setCatalogLeagueMetadata(null);
    }
  }, [selectedCatalogLeagueId, managedLeagues]); // Added managedLeagues to dependency array

  // Box 3 Effect
  useEffect(() => {
    if (selectedConfigLeagueId) {
      fetchInternalSeasons(selectedConfigLeagueId, setConfigSeasons);
    } else {
      setConfigSeasons([]);
      setSelectedConfigSeasonId('');
    }
  }, [selectedConfigLeagueId]);

  useEffect(() => {
    const season = configSeasons.find(s => s.id === selectedConfigSeasonId);
    if (season) {
      const config = JSON.parse(season.configJson || '{}');
      setDeductions(JSON.stringify(config.deductions || [], null, 2));
    } else {
      setDeductions('');
    }
  }, [selectedConfigSeasonId, configSeasons]);

  const activateLeague = async (catalogId: string) => {
    setActionLoading(catalogId);
    try {
      await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation($id: String!) { promoteLeague(catalogId: $id) { id name } }`,
          variables: { id: catalogId }
        })
      });
      await fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const importSeason = async (leagueId: string, year: number) => {
    const key = `${leagueId}-${year}`;
    setActionLoading(key);
    try {
      await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation($id: String!, $year: Int!) { importSeason(leagueId: $id, year: $year) { id year } }`,
          variables: { id: leagueId, year }
        })
      });
      // Refresh local seasons for both boxes if they happen to be showing this league
      if (selectedCatalogLeagueId === leagueId) {
        fetchInternalSeasons(leagueId, setSeasonsForCatalogLeague);
      }
      if (selectedConfigLeagueId === leagueId) {
        fetchInternalSeasons(leagueId, setConfigSeasons);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const syncSeasonData = async (leagueId: string, year: number) => {
    const key = `sync-${leagueId}-${year}`;
    setActionLoading(key);
    try {
      const league = managedLeagues.find(l => l.id === leagueId);
      if (!league?.sourceId) {
        alert('Source ID not found for league.');
        return;
      }

      await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation($id: Int!, $year: Int!) { syncFixtures(leagueId: $id, season: $year) { id } }`,
          variables: { id: league.sourceId, year }
        })
      });

      // Refresh to update counts
      await fetchInternalSeasons(leagueId, setConfigSeasons);
    } catch (e) {
      console.error('syncSeasonData error:', e);
    } finally {
      setActionLoading(null);
    }
  };

  const removeSeason = async (leagueId: string, seasonId: string, year: number) => {
    if (!window.confirm(`Are you sure you want to remove the ${year} season? This will delete all associated fixtures and standings data.`)) return;
    const key = `${leagueId}-${year}`;
    setActionLoading(key);
    try {
      await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation($id: String!) { removeSeason(seasonId: $id) }`,
          variables: { id: seasonId }
        })
      });
      // Refresh local seasons for both boxes
      if (selectedCatalogLeagueId === leagueId) {
        fetchInternalSeasons(leagueId, setSeasonsForCatalogLeague);
      }
      if (selectedConfigLeagueId === leagueId) {
        fetchInternalSeasons(leagueId, setConfigSeasons);
        if (selectedConfigSeasonId === seasonId) {
          setSelectedConfigSeasonId('');
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const saveConfig = async () => {
    if (!selectedConfigSeasonId) return;
    setActionLoading('save-config');
    try {
      let parsedDeductions = [];
      try {
        parsedDeductions = JSON.parse(deductions);
      } catch (e) {
        alert('Invalid JSON for deductions');
        return;
      }

      const config = { deductions: parsedDeductions };
      await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation($id: String!, $json: String!) { updateSeasonConfig(seasonId: $id, configJson: $json) { id } }`,
          variables: { id: selectedConfigSeasonId, json: JSON.stringify(config) }
        })
      });
      fetchInternalSeasons(selectedConfigLeagueId, setConfigSeasons);
      alert('Configuration saved successfully.');
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return (
    <div className="py-32 text-center bg-slate-900/10 border border-dashed border-slate-800/40 rounded-3xl">
      <Loader2 className="w-8 h-8 text-sky-500 animate-spin mx-auto mb-6" />
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Waking Registry...</p>
    </div>
  );

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-24">
      {/* Box 1: Catalog Browser */}
      <section className="bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm space-y-8 relative overflow-hidden group/box1 transition-all hover:border-slate-800">
        <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/5 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
        <div className="flex items-center justify-between relative z-10">
          <div>
            <h3 className="text-xl font-semibold text-white flex items-center gap-3">
              <Globe className="w-5 h-5 text-sky-400" />
              Box 1: Catalog Browser
            </h3>
            <p className="text-sm text-slate-400 mt-2">Browse the full provider registry and activate leagues for management.</p>
          </div>
          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            className="bg-slate-900 border border-slate-700/50 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500 transition-all min-w-[200px]"
          >
            <option value="">Select Country...</option>
            {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {selectedCountry ? (
          <div className="overflow-hidden border border-slate-800/40 rounded-xl bg-slate-900/20 relative z-10 backdrop-blur-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-900/50 border-b border-slate-800/60">
                  <th className="px-6 py-4 font-semibold text-slate-400">League</th>
                  <th className="px-6 py-4 font-semibold text-slate-400 text-center">Type</th>
                  <th className="px-6 py-4 font-semibold text-slate-400 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {catalogLeagues.map(l => {
                  const isManaged = managedLeagues.some(ml => ml.sourceId === l.sourceId);
                  return (
                    <tr key={l.id} className="hover:bg-slate-800/20 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {l.logo ? <img src={l.logo} className="w-6 h-6 rounded bg-white p-0.5" alt={l.name} /> : <div className="w-6 h-6 bg-slate-800 rounded" />}
                          <span className="font-medium text-slate-200">{l.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded border border-slate-700/30 font-mono">
                          {l.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isManaged ? (
                          <span className="text-emerald-400 text-xs font-semibold flex items-center justify-end gap-1.5">
                            <CheckCircle2 className="w-4 h-4" />
                            Active
                          </span>
                        ) : (
                          <button
                            onClick={() => activateLeague(l.id)}
                            disabled={actionLoading === l.id}
                            className="text-xs font-semibold text-sky-400 hover:text-white hover:bg-sky-500/10 px-3 py-1.5 rounded-lg border border-sky-500/30 transition-all disabled:opacity-30"
                          >
                            {actionLoading === l.id ? 'Activating...' : 'Activate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-20 text-center border border-dashed border-slate-800/40 rounded-xl bg-slate-900/10 relative z-10 group/empty">
            <Globe className="w-8 h-8 text-slate-700 mx-auto mb-4 opacity-20 group-hover/empty:scale-110 group-hover/empty:text-sky-500 transition-all duration-500" />
            <p className="text-sm text-slate-500 font-medium tracking-tight">Select a country above to browse and activate leagues.</p>
          </div>
        )}
      </section>

      {/* Box 2: Catalog Seasons */}
      <section className="bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm space-y-8 relative overflow-hidden group/box2 transition-all hover:border-slate-800">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
        <div className="flex items-center justify-between relative z-10">
          <div>
            <h3 className="text-xl font-semibold text-white flex items-center gap-3">
              <History className="w-5 h-5 text-indigo-400" />
              Box 2: Catalog Seasons
            </h3>
            <p className="text-sm text-slate-400 mt-2">Browse provider years and import them as local seasons.</p>
          </div>
          <select
            value={selectedCatalogLeagueId}
            onChange={(e) => setSelectedCatalogLeagueId(e.target.value)}
            className="bg-slate-900 border border-slate-700/50 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all min-w-[200px]"
          >
            <option value="">Select League...</option>
            {managedLeagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        {selectedCatalogLeagueId ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 relative z-10">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center p-1.5 overflow-hidden">
                  {managedLeagues.find(l => l.id === selectedCatalogLeagueId)?.logo ? (
                    <img
                      src={managedLeagues.find(l => l.id === selectedCatalogLeagueId)?.logo}
                      className="w-full h-full object-contain opacity-80"
                      alt=""
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-800/50 flex items-center justify-center">
                      <Globe className="w-5 h-5 text-slate-700" />
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Provider Catalog</h4>
                  <p className="text-xs text-white font-medium">{managedLeagues.find(l => l.id === selectedCatalogLeagueId)?.name}</p>
                </div>
              </div>
              <button
                onClick={refreshProviderSeasons}
                disabled={actionLoading === 'refresh-catalog'}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-all group/ref"
              >
                {actionLoading === 'refresh-catalog' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-slate-500 group-hover/ref:text-indigo-400 transition-colors" />
                )}
                <span className="text-[10px] font-bold text-slate-400 group-hover/ref:text-slate-200">Catalog Refresh</span>
              </button>
            </div>

            <div className="bg-slate-950/40 border border-slate-800/40 rounded-xl overflow-hidden backdrop-blur-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/60 bg-slate-900/40">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Year</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {catalogLeagueMetadata?.seasons?.slice().reverse().map((s: any) => {
                    const isImported = seasonsForCatalogLeague.some(ms => ms.year === s.year);
                    const isLoading = actionLoading === `${selectedCatalogLeagueId}-${s.year}`;
                    return (
                      <tr key={s.year} className="group/row hover:bg-slate-900/40 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span className={cn(
                              "text-sm font-semibold",
                              isImported ? "text-indigo-400" : "text-white"
                            )}>
                              {s.year}
                            </span>
                            {s.current && (
                              <span className="px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-[9px] font-bold text-sky-400 tracking-wider uppercase">Active</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isImported ? (
                            <div className="flex items-center justify-end gap-4">
                              <div className="flex items-center gap-2 text-indigo-400/60 font-semibold text-[10px] uppercase tracking-wider">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Imported
                              </div>
                              <button
                                onClick={() => {
                                  const seasonId = seasonsForCatalogLeague.find(ms => ms.year === s.year)?.id;
                                  if (seasonId) removeSeason(selectedCatalogLeagueId, seasonId, s.year);
                                }}
                                disabled={isLoading}
                                className="px-3 py-1 bg-slate-900 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/50 text-slate-500 hover:text-red-400 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                              >
                                {isLoading ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : 'Remove'}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => importSeason(selectedCatalogLeagueId, s.year)}
                              disabled={isLoading}
                              className="px-5 py-1.5 bg-slate-900 hover:bg-white border border-slate-700 hover:border-white text-slate-300 hover:text-black rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                            >
                              {isLoading ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : 'Import'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!catalogLeagueMetadata && (
                <div className="p-12 text-center italic text-slate-500 text-xs">
                  Awaiting catalog metadata...
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-20 text-center border border-dashed border-slate-800/40 rounded-xl bg-slate-900/10 relative z-10 group/empty2">
            <History className="w-8 h-8 text-slate-700 mx-auto mb-4 opacity-20 group-hover/empty2:scale-110 group-hover/empty2:text-indigo-400 transition-all duration-500" />
            <p className="text-sm text-slate-500 font-medium tracking-tight">Select a league to see importable years.</p>
          </div>
        )}
      </section>

      {/* Box 3: Season Configuration */}
      <section className="bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm space-y-8 relative overflow-hidden group/box3 transition-all hover:border-slate-800">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
        <div className="flex items-center justify-between relative z-10">
          <div>
            <h3 className="text-xl font-semibold text-white flex items-center gap-3">
              <Settings className="w-5 h-5 text-amber-400" />
              Box 3: Season Config
            </h3>
            <p className="text-sm text-slate-400 mt-2">Manage settings for imported seasons.</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedConfigLeagueId}
              onChange={(e) => setSelectedConfigLeagueId(e.target.value)}
              className="bg-slate-900 border border-slate-700/50 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition-all min-w-[200px]"
            >
              <option value="">Select League...</option>
              {managedLeagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select
              value={selectedConfigSeasonId}
              onChange={(e) => setSelectedConfigSeasonId(e.target.value)}
              disabled={!selectedConfigLeagueId || configSeasons.length === 0}
              className="bg-slate-900 border border-slate-700/50 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition-all min-w-[150px] disabled:opacity-30"
            >
              <option value="">Select Season...</option>
              {configSeasons.map(s => <option key={s.id} value={s.id}>{s.year}</option>)}
            </select>
          </div>
        </div>

        {selectedConfigSeasonId ? (
          <div className="space-y-8 relative z-10 animate-in fade-in duration-300">
            <div className="flex flex-col gap-4 w-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-8">
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <Database className="w-3 h-3" /> Data Volume
                    </h4>
                    <div className="flex items-center gap-4">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xl font-bold text-white">
                          {configSeasons.find(s => s.id === selectedConfigSeasonId)?.fixtureCount || 0}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">Fixtures</span>
                      </div>
                      <div className="w-px h-4 bg-slate-800" />
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xl font-bold text-white">
                          {configSeasons.find(s => s.id === selectedConfigSeasonId)?.teamCount || 0}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">Teams</span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const s = configSeasons.find(s => s.id === selectedConfigSeasonId);
                    if (s) syncSeasonData(selectedConfigLeagueId, s.year);
                  }}
                  disabled={actionLoading?.startsWith('sync-')}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white border border-indigo-500/20 rounded-lg transition-all font-bold text-xs uppercase tracking-wider disabled:opacity-30"
                >
                  {actionLoading?.startsWith('sync-') ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  {actionLoading?.startsWith('sync-') ? 'Syncing...' : 'Sync Data'}
                </button>
              </div>

              {/* Progress Bar */}
              {(() => {
                const s = configSeasons.find(s => s.id === selectedConfigSeasonId);
                const activeJob = executions.find(ex =>
                  ex.status === 'running' &&
                  ex.jobId === jobs.find(j => j.name === `sync-fixtures-${managedLeagues.find(l => l.id === selectedConfigLeagueId)?.sourceId}-${s?.year}`)?.id
                );

                if (activeJob && activeJob.totalCount > 0) {
                  const percent = Math.round((activeJob.processedCount / activeJob.totalCount) * 100);
                  return (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
                        <span>Synchronizing Fixtures...</span>
                        <span className="font-mono">{activeJob.processedCount} / {activeJob.totalCount} ({percent}%)</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700/30">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-sky-500 transition-all duration-500 ease-out shadow-[0_0_8px_rgba(99,102,241,0.4)]"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Points Deductions (JSON)</h4>
                <span className="text-[9px] text-slate-600 font-mono italic">Format: [ {"{"} "teamId": 123, "points": 4, "reason": "..." {"}"} ]</span>
              </div>
              <textarea
                value={deductions}
                onChange={(e) => setDeductions(e.target.value)}
                className="w-full h-48 bg-slate-950/80 border border-slate-800/80 rounded-xl p-6 font-mono text-xs text-sky-300 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/10 transition-all"
                placeholder='[ { "teamId": 0, "points": 0, "reason": "" } ]'
              />
            </div>

            <div className="flex items-center justify-between border-t border-slate-800/40 pt-8">
              <div className="flex items-center gap-4 text-slate-500 text-xs italic">
                <AlertCircle className="w-4 h-4" />
                Changes affect standings compile immediately.
              </div>
              <button
                onClick={saveConfig}
                disabled={actionLoading === 'save-config'}
                className="bg-amber-500 hover:bg-amber-400 text-black px-8 py-2.5 rounded-lg font-bold text-sm transition-all shadow-[0_4px_12px_rgba(245,158,11,0.2)] disabled:opacity-50"
              >
                {actionLoading === 'save-config' ? 'Saving...' : 'Apply Configuration'}
              </button>
            </div>
          </div>
        ) : (
          <div className="py-20 text-center border border-dashed border-slate-800/40 rounded-xl bg-slate-900/10 relative z-10">
            <Settings className="w-8 h-8 text-slate-700 mx-auto mb-4 opacity-20" />
            <p className="text-sm text-slate-500 font-medium tracking-tight">
              {configSeasons.length === 0 && selectedConfigLeagueId ? "No imported seasons found for this league." : "Select a league and season to manage its settings."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

const StatCard = ({ label, value, subValue, isError, icon: Icon }: any) => {
  return (
    <div className={cn(
      "p-8 rounded-2xl border transition-all duration-300",
      isError
        ? "border-red-500/20 bg-red-500/5"
        : "bg-[#0d1117] border-slate-800/60 shadow-sm hover:border-slate-700"
    )}>
      <div className="flex items-center gap-4 mb-6">
        <div className={cn(
          "p-2.5 rounded-lg",
          isError ? "bg-red-500/10 text-red-500" : "bg-sky-500/10 text-sky-500"
        )}>
          {Icon && <Icon className="w-5 h-5" />}
        </div>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{label}</span>
      </div>
      <div>
        <p className={cn(
          "text-2xl font-semibold tracking-tight mb-2",
          isError ? "text-red-400" : "text-white"
        )}>{value}</p>
        <p className="text-[11px] text-slate-500 font-normal truncate leading-relaxed">{subValue}</p>
      </div>
    </div>
  );
};

const LogsView = ({ logs, onRefresh }: { logs: any[], onRefresh: () => Promise<void> }) => {
  const [filter, setFilter] = useState<'all' | 'error' | 'warn' | 'info'>('all');

  const filteredLogs = logs.filter(log => filter === 'all' || log.level === filter);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex justify-between items-center bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
        <div className="relative z-10">
          <h3 className="text-xl font-semibold text-white flex items-center gap-3">
            <History className="w-5 h-5 text-indigo-400" />
            System Event Explorer
          </h3>
          <p className="text-sm text-slate-400 mt-2 font-normal leading-relaxed max-w-lg">
            Real-time diagnostic logs from the background workers and API services. Monitor data ingestion and infrastructure health.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-xl border border-slate-800/50 relative z-10">
          {(['all', 'error', 'warn', 'info'] as const).map(lvl => (
            <button
              key={lvl}
              onClick={() => setFilter(lvl)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                filter === lvl
                  ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"
              )}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#0b0f15]/80 border border-slate-800/60 rounded-3xl overflow-hidden backdrop-blur-xl shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800/60">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-900/40">Timestamp</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-900/40">Level</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-900/40">Module</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-900/40">Message</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-900/40 text-right">Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-24 text-center">
                    <History className="w-8 h-8 text-slate-800 mx-auto mb-4 opacity-20" />
                    <p className="text-xs font-medium text-slate-600 uppercase tracking-widest">No matching logs found</p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="group hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4 text-[11px] font-mono text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={cn(
                        "text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                        log.level === 'info' ? "bg-sky-500/10 text-sky-400" :
                          log.level === 'warn' ? "bg-amber-500/10 text-amber-400" :
                            "bg-red-500/10 text-red-400"
                      )}>
                        {log.level}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-tight whitespace-nowrap">
                      {log.module}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-300 max-w-md truncate group-hover:whitespace-normal group-hover:overflow-visible transition-all">
                      {log.message}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {log.context && (
                        <button
                          onClick={() => console.log(log.context)}
                          className="text-[10px] font-bold text-indigo-400/60 hover:text-indigo-400 transition-colors uppercase tracking-widest"
                        >
                          View JSON
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default App;
