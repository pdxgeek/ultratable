import React, { useState } from 'react';
import { Key, CheckCircle2, AlertCircle } from 'lucide-react';
import { gqlFetch } from '../lib/api';

const ApiKeyView = ({ onUpdate }: { onUpdate: () => void }) => {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const onConfigure = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      const data = await gqlFetch<{ configureApiKey: boolean }>(
        `mutation ConfigureKey($key: String!) { configureApiKey(key: $key) }`,
        { key: value }
      );

      if (data.configureApiKey) {
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

export default ApiKeyView;
