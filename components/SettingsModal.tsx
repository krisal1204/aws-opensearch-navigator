import React, { useState, useEffect, useCallback } from 'react';
import { X, Server, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
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
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  
  // UI State
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Discovery States
  const [discovering, setDiscovering] = useState(false);
  const [discoveredCollections, setDiscoveredCollections] = useState<{name: string, endpoint: string, id: string}[]>([]);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  // Sync internal state if config prop updates
  useEffect(() => {
    setFormData(config);
    setNodesInput(config.nodes.join('\n'));
  }, [config]);

  // Load profiles when modal opens
  useEffect(() => {
    if (isOpen) {
      const fetchProfiles = async () => {
        setLoadingProfiles(true);
        try {
          const proxy = config.proxyUrl || '/api/proxy';
          // Robust replacement to find the correct profiles endpoint relative to the proxy path
          // If proxy is /api/proxy -> /api/aws-profiles
          // If proxy is http://host/api/proxy -> http://host/api/aws-profiles
          const profilesUrl = proxy.replace(/\/proxy\/?$/, '/aws-profiles');
          
          const res = await fetch(profilesUrl);
          if (res.ok) {
            const data = await res.json();
            setProfiles(data.profiles || []);
          }
        } catch (e) {
          console.warn("Could not load AWS profiles from backend", e);
        } finally {
          setLoadingProfiles(false);
        }
      };
      fetchProfiles();
    }
  }, [isOpen, config.proxyUrl]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleAuthTypeChange = (type: 'profile' | 'manual') => {
    setFormData(prev => ({
      ...prev,
      authType: type,
      profile: type === 'manual' ? '' : prev.profile,
      accessKey: type === 'profile' ? '' : prev.accessKey,
      secretKey: type === 'profile' ? '' : prev.secretKey
    }));
  };

  // 1. Discover Clusters via AWS
  // Wrapped in useCallback to safely use in useEffect dependency arrays
  const handleDiscoverClusters = useCallback(async () => {
    setDiscovering(true);
    setDiscoveryError(null);
    try {
        const proxy = formData.proxyUrl || '/api/proxy';
        // Robust replacement for discovery endpoint
        const baseUrl = proxy.replace(/\/proxy\/?$/, '/aws-discovery');
        
        const payload: any = {
            region: formData.region,
            authType: formData.authType
        };
        
        if (formData.authType === 'profile') {
            payload.profile = formData.profile;
        } else {
            payload.credentials = {
                accessKey: formData.accessKey,
                secretKey: formData.secretKey,
                sessionToken: formData.sessionToken
            };
        }

        const res = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();
        
        if (!res.ok) {
            throw new Error(result.error || result.message || 'Failed to discover clusters');
        }

        if (result.collections && result.collections.length > 0) {
            setDiscoveredCollections(result.collections);
            
            // Auto-populate logic:
            // If the current input is empty, OR if the current input is NOT in the new list of collections,
            // we default to the first collection found.
            setNodesInput(currentInput => {
                const isCurrentInNewList = result.collections.some((c: any) => c.endpoint === currentInput?.trim());
                if (!currentInput || !currentInput.trim() || !isCurrentInNewList) {
                     return result.collections[0].endpoint;
                }
                return currentInput;
            });
        } else {
            setDiscoveryError("No Serverless Collections found.");
            setDiscoveredCollections([]);
        }
    } catch (e: any) {
        console.error("Discovery failed", e);
        setDiscoveryError(e.message || "Discovery failed");
        setDiscoveredCollections([]);
    } finally {
        setDiscovering(false);
    }
  }, [formData.proxyUrl, formData.region, formData.authType, formData.profile, formData.accessKey, formData.secretKey, formData.sessionToken]);

  // Auto-discover when profile or region changes
  useEffect(() => {
     if (isOpen && formData.authType === 'profile' && formData.profile) {
         // Debounce slightly to handle rapid changes or initial load
         const timer = setTimeout(() => {
             handleDiscoverClusters();
         }, 100);
         return () => clearTimeout(timer);
     }
  }, [formData.authType, formData.profile, formData.region, isOpen, handleDiscoverClusters]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const cleanNodes = nodesInput
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    onSave({
      ...formData,
      nodes: cleanNodes
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Server className="w-5 h-5 text-accent" />
            Connect
          </h2>
          <div className="flex items-center gap-4">
             <div className="flex items-center">
                <input
                    type="checkbox"
                    id="useDemoMode"
                    name="useDemoMode"
                    checked={formData.useDemoMode}
                    onChange={handleChange}
                    className="w-4 h-4 text-accent rounded border-gray-300 focus:ring-accent"
                />
                <label htmlFor="useDemoMode" className="ml-2 text-sm text-slate-600 font-medium cursor-pointer">
                    Demo Mode
                </label>
             </div>
             <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={24} />
             </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1">
          <div className={`space-y-6 transition-opacity ${formData.useDemoMode ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            
            {/* Step 1: Auth */}
            <div className="space-y-3">
               <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                 <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">1</span>
                 Authentication
               </h3>
               
               <div className="ml-7">
                   <div className="flex p-1 bg-slate-100 rounded-lg mb-3 w-full">
                    <button
                        type="button"
                        onClick={() => handleAuthTypeChange('profile')}
                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-sm font-medium rounded-md transition-all ${
                        formData.authType === 'profile' 
                            ? 'bg-white text-accent shadow-sm' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        AWS Profile
                    </button>
                    <button
                        type="button"
                        onClick={() => handleAuthTypeChange('manual')}
                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-sm font-medium rounded-md transition-all ${
                        formData.authType === 'manual' 
                            ? 'bg-white text-accent shadow-sm' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        Access Keys
                    </button>
                    </div>

                    {formData.authType === 'profile' ? (
                        <div>
                        <select
                            name="profile"
                            value={formData.profile || ''}
                            onChange={handleChange}
                            disabled={loadingProfiles || profiles.length === 0}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
                        >
                            <option value="">-- Select AWS Profile --</option>
                            {profiles.map(p => (
                            <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                        {profiles.length === 0 && !loadingProfiles && (
                            <p className="text-xs text-orange-400 mt-1">No profiles found in ~/.aws/credentials</p>
                        )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <input
                                type="password"
                                name="accessKey"
                                value={formData.accessKey}
                                onChange={handleChange}
                                placeholder="Access Key ID"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
                            />
                            <input
                                type="password"
                                name="secretKey"
                                value={formData.secretKey}
                                onChange={handleChange}
                                placeholder="Secret Access Key"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
                            />
                            <input
                                type="password"
                                name="sessionToken"
                                value={formData.sessionToken || ''}
                                onChange={handleChange}
                                placeholder="Session Token (Optional)"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
                            />
                        </div>
                    )}
               </div>
            </div>

            <div className="w-full border-t border-slate-100"></div>

            {/* Step 2: Collection */}
            <div className="space-y-3">
               <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">2</span>
                        Collection
                    </h3>
                    <button 
                       type="button"
                       onClick={handleDiscoverClusters}
                       disabled={discovering}
                       className="text-xs text-accent hover:text-blue-700 flex items-center gap-1 disabled:opacity-50 font-medium"
                    >
                       <RefreshCw size={12} className={discovering ? 'animate-spin' : ''} />
                       Discover
                    </button>
               </div>
               
               <div className="ml-7">
                   {discoveryError && (
                      <div className="text-xs text-red-500 mb-2">{discoveryError}</div>
                   )}
                   
                   {discoveredCollections.length > 0 ? (
                       <select
                           value={nodesInput}
                           onChange={(e) => setNodesInput(e.target.value)}
                           className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
                       >
                           <option value="" disabled>Select Collection</option>
                           {discoveredCollections.map(c => (
                               <option key={c.id} value={c.endpoint}>{c.name} ({c.id})</option>
                           ))}
                           <option value={nodesInput}>Custom URL...</option>
                       </select>
                   ) : (
                       <div className="text-sm text-slate-500 italic border border-dashed border-slate-300 rounded-lg p-3 text-center">
                          {discovering ? 'Discovering collections...' : 'Select a profile to auto-discover collections'}
                       </div>
                   )}
               </div>
            </div>

            {/* Advanced Settings Toggle */}
            <div className="pt-2">
                <button 
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-800 font-medium w-full"
                >
                   {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                   Advanced Settings
                </button>
                
                {showAdvanced && (
                   <div className="mt-3 ml-2 pl-4 border-l-2 border-slate-100 space-y-4 animate-in slide-in-from-top-2 duration-200">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Region</label>
                            <input
                                type="text"
                                name="region"
                                value={formData.region}
                                onChange={handleChange}
                                placeholder="us-east-1"
                                className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:border-accent outline-none"
                            />
                        </div>
                         <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Proxy URL</label>
                            <input
                                type="text"
                                name="proxyUrl"
                                value={formData.proxyUrl || ''}
                                onChange={handleChange}
                                placeholder="/api/proxy"
                                className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:border-accent outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Manual Node URL</label>
                            <textarea
                                name="nodes"
                                value={nodesInput}
                                onChange={(e) => setNodesInput(e.target.value)}
                                rows={2}
                                className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs font-mono focus:border-accent outline-none"
                            />
                        </div>
                   </div>
                )}
            </div>

          </div>
        </form>

        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button 
            type="button" 
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors text-sm"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit}
            className="px-6 py-2 bg-accent hover:bg-blue-600 text-white rounded-lg font-medium shadow-sm transition-colors text-sm"
          >
            Connect & Save
          </button>
        </div>
      </div>
    </div>
  );
};