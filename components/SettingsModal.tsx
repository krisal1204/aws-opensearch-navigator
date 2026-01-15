import React, { useState, useEffect, useRef } from 'react';
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
  
  // Discovery State
  const [collections, setCollections] = useState<{name: string, id: string, endpoint: string}[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  
  // Track if discovery was triggered automatically
  const discoveryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleDiscover = async (configToUse: OpenSearchConfig, isAuto = false) => {
    setIsDiscovering(true);
    if (!isAuto) setDiscoveryError(null); 
    
    try {
        const payload = {
            region: configToUse.region,
            profile: configToUse.authType === 'profile' ? configToUse.profile : undefined,
            credentials: configToUse.authType === 'manual' ? {
                accessKey: configToUse.accessKey,
                secretKey: configToUse.secretKey,
                sessionToken: configToUse.sessionToken
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
        
        // If we found collections and the current input is empty, auto-select the first one
        if (found.length > 0 && (!nodesInput || nodesInput.trim() === '')) {
             setNodesInput(found[0].endpoint);
        }

        if (found.length === 0 && !isAuto) {
            setDiscoveryError('No OpenSearch Serverless collections found in this region.');
        } else if (found.length > 0) {
            setDiscoveryError(null);
        }
    } catch (e: any) {
        if (!isAuto) {
             setDiscoveryError(e.message || 'Discovery failed');
        }
        console.warn("Discovery failed:", e.message);
    } finally {
        setIsDiscovering(false);
    }
  };

  // Auto-discovery effect watching relevant fields
  useEffect(() => {
    if (formData.useDemoMode) return;
    
    // Check if we have enough info to scan
    const hasProfile = formData.authType === 'profile' && formData.profile && formData.profile !== '';
    const hasManual = formData.authType === 'manual' && formData.accessKey && formData.secretKey && formData.secretKey.length > 10;
    
    if (hasProfile || hasManual) {
        if (discoveryTimeoutRef.current) clearTimeout(discoveryTimeoutRef.current);
        
        discoveryTimeoutRef.current = setTimeout(() => {
            handleDiscover(formData, true);
        }, 800);
    }
    
    return () => {
        if (discoveryTimeoutRef.current) clearTimeout(discoveryTimeoutRef.current);
    };
  }, [
      formData.authType, 
      formData.profile, 
      formData.accessKey, 
      formData.secretKey, 
      formData.sessionToken, 
      formData.region, 
      formData.useDemoMode
  ]);

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
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50 flex-none bg-white z-10">
          <h2 className="text-base font-semibold text-slate-800">Configuration</h2>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 custom-scrollbar">
            <form onSubmit={handleSave} className="p-6 space-y-6">
                
                {/* Mode Toggle */}
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${formData.useDemoMode ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'}`}>
                        <Server size={16} />
                        </div>
                        <div>
                        <p className="text-sm font-medium text-slate-700">{formData.useDemoMode ? 'Demo Mode' : 'Live Connection'}</p>
                        <p className="text-xs text-slate-400">{formData.useDemoMode ? 'Using mock data' : 'Connected to AWS'}</p>
                        </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="useDemoMode" checked={formData.useDemoMode} onChange={handleChange} className="sr-only peer" />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>

                {!formData.useDemoMode && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                        
                        {/* Authentication Section */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                <Shield size={12} /> Authentication
                            </h3>
                            
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
                                    <p className="text-xs text-slate-500">~/.aws/credentials</p>
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
                                    <p className="text-xs text-slate-500">Access Key & Secret</p>
                                </button>
                            </div>

                            {formData.authType === 'profile' ? (
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
                            ) : (
                                <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                                    <input 
                                        type="password"
                                        name="accessKey"
                                        value={formData.accessKey}
                                        onChange={handleChange}
                                        placeholder="Access Key ID"
                                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none"
                                    />
                                    <input 
                                        type="password"
                                        name="secretKey"
                                        value={formData.secretKey}
                                        onChange={handleChange}
                                        placeholder="Secret Access Key"
                                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none"
                                    />
                                    <input 
                                        type="password"
                                        name="sessionToken"
                                        value={formData.sessionToken}
                                        onChange={handleChange}
                                        placeholder="Session Token (Optional)"
                                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Region & Proxy */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">AWS Region</label>
                                <div className="relative">
                                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                    <input 
                                        type="text" 
                                        name="region"
                                        value={formData.region}
                                        onChange={handleChange}
                                        className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none shadow-sm"
                                        placeholder="us-east-1"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Proxy Path</label>
                                <input 
                                    type="text" 
                                    name="proxyUrl"
                                    value={formData.proxyUrl}
                                    onChange={handleChange}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none shadow-sm"
                                    placeholder="/api/proxy"
                                />
                            </div>
                        </div>

                        {/* Collection Discovery & Endpoint */}
                        <div className="space-y-3 pt-2 border-t border-slate-100">
                             <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                    <Cloud size={12} /> Serverless Collection
                                </h3>
                                <button 
                                    type="button"
                                    onClick={() => handleDiscover(formData, false)}
                                    disabled={isDiscovering}
                                    className="text-blue-600 hover:text-blue-700 text-xs font-medium flex items-center gap-1 transition-colors"
                                >
                                    {isDiscovering ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                    {isDiscovering ? 'Scanning...' : 'Refresh List'}
                                </button>
                             </div>

                            {discoveryError && (
                                <div className="p-2 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-xs text-red-600">
                                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                    <span>{discoveryError}</span>
                                </div>
                            )}
                            
                            {/* Collection Dropdown */}
                            {collections.length > 0 ? (
                                <div className="relative group">
                                    <select
                                        onChange={(e) => {
                                            if (e.target.value) setNodesInput(e.target.value);
                                        }}
                                        className="w-full appearance-none bg-white border border-blue-200 text-slate-700 text-sm rounded-xl px-4 py-3 pr-8 outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm transition-all hover:border-blue-300 cursor-pointer"
                                        value={collections.find(c => nodesInput.includes(c.endpoint))?.endpoint || ""}
                                    >
                                        <option value="" disabled>Select a collection...</option>
                                        {collections.map(c => (
                                            <option key={c.id} value={c.endpoint}>{c.name} ({c.id})</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-blue-500">
                                        <ChevronRight size={16} className="rotate-90" />
                                    </div>
                                </div>
                            ) : (
                                !isDiscovering && !discoveryError && (
                                    <div className="text-xs text-slate-400 italic px-1">
                                        No collections found. Configure authentication above to scan.
                                    </div>
                                )
                            )}

                             {/* Manual Endpoint Input */}
                            <div className="space-y-1.5 pt-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cluster Endpoint URL</label>
                                <textarea 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-mono resize-none shadow-inner"
                                    rows={2}
                                    placeholder="https://search-domain.region.es.amazonaws.com"
                                    value={nodesInput}
                                    onChange={(e) => setNodesInput(e.target.value)}
                                />
                            </div>
                        </div>

                    </div>
                )}
            </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-50 bg-white flex justify-end gap-3 z-10">
            <button 
                type="button" 
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-colors"
            >
                Cancel
            </button>
            <button 
                onClick={handleSave}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
                Save Configuration
            </button>
        </div>
      </div>
    </div>
  );
};