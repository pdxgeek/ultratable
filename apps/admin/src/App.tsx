import React, { useState, useEffect } from 'react';
import { Database, Activity, Key, Globe, LayoutDashboard, CheckCircle2, AlertCircle, Trophy } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

type Tab = 'dashboard' | 'leagues' | 'api-keys' | 'database' | 'logs';

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
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'leagues', label: 'Inventory', icon: Globe },
    { id: 'api-keys', label: 'Integrations', icon: Key },
    { id: 'database', label: 'Infrastructure', icon: Database },
    { id: 'logs', label: 'System Logs', icon: Activity },
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
            {activeTab === 'leagues' && <LeaguesView />}
            {activeTab === 'logs' && (
              <div className="p-12 text-center text-slate-500 bg-slate-900/20 rounded-3xl border border-dashed border-slate-800/50">
                Log streaming will be available in Phase 3.
              </div>
            )}
          </div>
        </div>
      </main>
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

const LeaguesView = () => {
  const [leagues, setLeagues] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);

  const fetchLeagues = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `{ leagues { id name slug country logo } }`
        })
      });
      const json = await resp.json();
      setLeagues(json.data?.leagues || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const onIngest = async () => {
    setIngesting(true);
    try {
      const resp = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation { ingestLeagues { id name } }`
        })
      });
      if (!resp.ok) throw new Error('Sync Failed');
      await fetchLeagues();
    } catch (e) {
      console.error(e);
    } finally {
      setIngesting(false);
    }
  };

  useEffect(() => {
    fetchLeagues();
  }, []);

  return (
    <div className="space-y-12 pb-24">
      <div className="flex justify-between items-center bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm">
        <div>
          <h3 className="text-xl font-semibold text-white">Entity Inventory</h3>
          <p className="text-sm text-slate-400 mt-1">Manage and inspect synchronized football leagues and seasons.</p>
        </div>
        <button
          onClick={onIngest}
          disabled={ingesting}
          className="bg-white text-black px-6 py-2.5 rounded-lg font-semibold text-sm hover:bg-slate-200 transition-all flex items-center gap-3 disabled:opacity-50 shadow-sm"
        >
          <Activity className={cn("w-4 h-4", ingesting && "animate-spin")} />
          {ingesting ? 'Refresing...' : 'Fetch New Entities'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {loading ? (
          <div className="col-span-full py-32 text-center">
            <Activity className="w-8 h-8 text-slate-700 animate-spin mx-auto mb-6" />
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Accessing Cloud Registry...</p>
          </div>
        ) : leagues.length === 0 ? (
          <div className="col-span-full py-32 text-center bg-slate-900/10 border border-dashed border-slate-800/40 rounded-2xl">
            <Trophy className="w-12 h-12 text-slate-800 mx-auto mb-6 opacity-30" />
            <p className="text-slate-400 text-sm font-medium mb-1">Local database is empty.</p>
            <p className="text-xs text-slate-600">Run the initialization trigger above to seed your platform.</p>
          </div>
        ) : (
          leagues.map((league) => (
            <div key={league.id} className="bg-[#0d1117] border border-slate-800/60 p-8 rounded-2xl shadow-sm hover:border-slate-700 transition-all group">
              <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center p-3 mb-8 shadow-sm group-hover:scale-105 transition-transform">
                <img src={league.logo} alt={league.name} className="w-full h-full object-contain" />
              </div>
              <div className="mb-8">
                <h4 className="font-semibold text-white group-hover:text-sky-400 transition-colors">{league.name}</h4>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1.5">{league.country}</p>
              </div>
              <button className="w-full border border-slate-800/80 bg-slate-800/20 hover:bg-slate-800/50 py-2.5 rounded-lg text-xs font-semibold text-slate-400 transition-all">
                Inspect Data
              </button>
            </div>
          ))
        )}
      </div>
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

export default App;
