import React, { useState, useEffect } from 'react';
import { X, Globe, Shield, Server, Key, ChevronRight, Check, Cloud, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { OpenSearchConfig } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: OpenSearchConfig;
  onSave: (config: OpenSearchConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, config, onSave }) => {
  const [formData, setFormData] = useState<OpenSearchConfig>(config);
  const [nodesInput, setNodesInput] = useState(config.nodes.join('\n'));
  const [profiles, setProfiles] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'connection' | 'auth'>('connection');

  // Discovery State
  const [collections, setCollections] = useState<{name: string, id: string, endpoint: string}[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  // Load profiles on mount
  useEffect(() => {
    if (isOpen) {
      const fetchProfiles = async () => {
        try {
          const proxy = config.proxyUrl || '/api/proxy';
          const profilesUrl = proxy.replace(/\/proxy\/?$/, '/aws-profiles');
          const res = await fetch(profilesUrl);
          if (res.ok) {
            const data = await res.json();
            setProfiles(data.profiles || []);
          }
        } catch (e) {
          console.warn("Could not load AWS profiles", e);
        }
      };
      fetchProfiles();
    }
  }, [isOpen, config.proxyUrl]);

  useEffect(() => {
    setFormData(config);
    setNodesInput(config.nodes.join('\n'));
    setCollections([]);
    setDiscoveryError(null);
  }, [config]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleDiscover = async () => {
    setIsDiscovering(true);
    setDiscoveryError(null);
    try {
        const payload = {
            region: formData.region,
            profile: formData.authType === 'profile' ? formData.profile : undefined,
            credentials: formData.authType === 'manual' ? {
                accessKey: formData.accessKey,
                secretKey: formData.secretKey,
                sessionToken: formData.sessionToken
            } : undefined
        };

        const res = await fetch('/api/aws-discovery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to scan collections');
        }

        const data = await res.json();
        const found = data.collections || [];
        setCollections(found);
        
        if (found.length === 0) {
            setDiscoveryError('No OpenSearch Serverless collections found in this region.');
        }
    } catch (e: any) {
        setDiscoveryError(e.message || 'Discovery failed');
    } finally {
        setIsDiscovering(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNodes = nodesInput.split('\n').map(s => s.trim()).filter(Boolean);
    onSave({
      ...formData,
      nodes: cleanNodes,
      useDemoMode: cleanNodes.length > 0 ? false : formData.useDemoMode
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden transform transition-all scale-100 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50 flex-none">
          <h2 className="text-base font-semibold text-slate-800">Settings</h2>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-4 gap-6 border-b border-slate-50 flex-none">
          <button 
            onClick={() => setActiveTab('connection')}
            className={`pb-3 text-sm font-medium transition-all relative ${activeTab === 'connection' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Connection
            {activeTab === 'connection' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full"></div>}
          </button>
          <button 
            onClick={() => setActiveTab('auth')}
            className={`pb-3 text-sm font-medium transition-all relative ${activeTab === 'auth' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Authentication
            {activeTab === 'auth' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full"></div>}
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
            <form onSubmit={handleSave} className="p-6">
            <div className="min-h-[320px]">
                {activeTab === 'connection' && (
                <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
                    
                    {/* Mode Toggle */}
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${formData.useDemoMode ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'}`}>
                        <Server size={16} />
                        </div>
                        <div>
                        <p className="text-sm font-medium text-slate-700">{formData.useDemoMode ? 'Demo Mode Active' : 'Live Connection'}</p>
                        <p className="text-xs text-slate-400">{formData.useDemoMode ? 'Using mock data' : 'Connected to OpenSearch'}</p>
                        </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="useDemoMode" checked={formData.useDemoMode} onChange={handleChange} className="sr-only peer" />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                    </div>

                    {/* Serverless Discovery UI */}
                    {!formData.useDemoMode && (
                        <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100 transition-all">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                                    <Cloud size={16} />
                                    </div>
                                    <div>
                                    <h3 className="text-xs font-bold text-blue-900 uppercase tracking-wide">Serverless Collections</h3>
                                    </div>
                                </div>
                                <button 
                                    type="button"
                                    onClick={handleDiscover}
                                    disabled={isDiscovering}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 shadow-sm text-blue-600 text-xs font-medium rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors"
                                >
                                    {isDiscovering ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                    {collections.length > 0 ? 'Refresh List' : 'Scan AWS'}
                                </button>
                            </div>

                            {discoveryError && (
                                <div className="mb-3 p-2 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-xs text-red-600">
                                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                    <span>{discoveryError}</span>
                                </div>
                            )}

                            {collections.length > 0 ? (
                                <div className="relative animate-in fade-in zoom-in-95 duration-200">
                                    <select
                                        onChange={(e) => {
                                            if (e.target.value) setNodesInput(e.target.value);
                                        }}
                                        className="w-full appearance-none bg-white border border-blue-200 text-slate-700 text-sm rounded-lg px-3 py-2.5 pr-8 outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                                        defaultValue=""
                                    >
                                        <option value="" disabled>Select a collection to connect...</option>
                                        {collections.map(c => (
                                            <option key={c.id} value={c.endpoint}>{c.name} ({c.id})</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400">
                                        <ChevronRight size={14} className="rotate-90" />
                                    </div>
                                </div>
                            ) : (
                                !isDiscovering && !discoveryError && (
                                    <p className="text-[11px] text-blue-400/80 leading-relaxed">
                                        Ensure your credentials in the <strong>Authentication</strong> tab have permissions to list collections (<code>aoss:ListCollections</code>).
                                    </p>
                                )
                            )}
                        </div>
                    )}

                    {/* Nodes Input */}
                    <div className={`space-y-2 transition-opacity duration-200 ${formData.useDemoMode ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cluster Endpoint</label>
                    <div className="relative">
                        <textarea 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-mono resize-none shadow-sm"
                            rows={2}
                            placeholder="https://search-domain.region.es.amazonaws.com"
                            value={nodesInput}
                            onChange={(e) => setNodesInput(e.target.value)}
                        />
                    </div>
                    <p className="text-[11px] text-slate-400">Enter the full endpoint URL including protocol (https://).</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">AWS Region</label>
                        <div className="relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input 
                            type="text" 
                            name="region"
                            value={formData.region}
                            onChange={handleChange}
                            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all shadow-sm"
                            placeholder="us-east-1"
                        />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Proxy Path</label>
                        <input 
                        type="text" 
                        name="proxyUrl"
                        value={formData.proxyUrl}
                        onChange={handleChange}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all shadow-sm"
                        placeholder="/api/proxy"
                        />
                    </div>
                    </div>

                </div>
                )}

                {activeTab === 'auth' && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                    <div className="flex gap-4">
                    <button
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, authType: 'profile' }))}
                        className={`flex-1 p-3 rounded-xl border text-left transition-all ${formData.authType === 'profile' ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                        <div className="flex items-center justify-between mb-1">
                            <span className={`text-sm font-semibold ${formData.authType === 'profile' ? 'text-blue-700' : 'text-slate-700'}`}>AWS Profile</span>
                            {formData.authType === 'profile' && <Check size={16} className="text-blue-600" />}
                        </div>
                        <p className="text-xs text-slate-500">Use local ~/.aws/credentials</p>
                    </button>
                    
                    <button
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, authType: 'manual' }))}
                        className={`flex-1 p-3 rounded-xl border text-left transition-all ${formData.authType === 'manual' ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                        <div className="flex items-center justify-between mb-1">
                            <span className={`text-sm font-semibold ${formData.authType === 'manual' ? 'text-blue-700' : 'text-slate-700'}`}>Static Keys</span>
                            {formData.authType === 'manual' && <Check size={16} className="text-blue-600" />}
                        </div>
                        <p className="text-xs text-slate-500">Manually enter access keys</p>
                    </button>
                    </div>

                    {formData.authType === 'profile' ? (
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Profile Name</label>
                        <div className="relative">
                            <select
                            name="profile"
                            value={formData.profile}
                            onChange={handleChange}
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none appearance-none transition-all shadow-sm"
                            >
                            <option value="">Select a profile...</option>
                            {profiles.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                            <ChevronRight size={16} className="rotate-90" />
                            </div>
                        </div>
                    </div>
                    ) : (
                    <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Access Key ID</label>
                            <input 
                            type="password"
                            name="accessKey"
                            value={formData.accessKey}
                            onChange={handleChange}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Secret Access Key</label>
                            <input 
                            type="password"
                            name="secretKey"
                            value={formData.secretKey}
                            onChange={handleChange}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Session Token (Optional)</label>
                            <input 
                            type="password"
                            name="sessionToken"
                            value={formData.sessionToken}
                            onChange={handleChange}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                            />
                        </div>
                    </div>
                    )}
                </div>
                )}
            </div>

            <div className="pt-6 mt-2 border-t border-slate-50 flex justify-end gap-3 sticky bottom-0 bg-white">
                <button 
                type="button" 
                onClick={onClose}
                className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl transition-colors"
                >
                Cancel
                </button>
                <button 
                type="submit"
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                Save Configuration
                </button>
            </div>
            </form>
        </div>
      </div>
    </div>
  );
};