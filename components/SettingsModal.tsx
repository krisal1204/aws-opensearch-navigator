import React, { useState, useEffect } from 'react';
import { X, Server, Key, Globe, Database, Network, Users, Lock, RefreshCw, ChevronDown } from 'lucide-react';
import { OpenSearchConfig } from '../types';
import { OpenSearchService } from '../services/opensearchService';

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
  
  // Discovery States
  const [discovering, setDiscovering] = useState(false);
  const [discoveredClusters, setDiscoveredClusters] = useState<string[]>([]);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  // Index Fetching
  const [fetchingIndices, setFetchingIndices] = useState(false);
  const [discoveredIndices, setDiscoveredIndices] = useState<string[]>([]);

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
          const proxy = config.proxyUrl || 'http://localhost:3000/api/proxy';
          const baseUrl = new URL(proxy, window.location.origin).origin;
          
          const res = await fetch(`${baseUrl}/api/aws-profiles`);
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

  if (!isOpen) return null;

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
  const handleDiscoverClusters = async () => {
    setDiscovering(true);
    setDiscoveryError(null);
    try {
        const proxy = formData.proxyUrl || 'http://localhost:3000/api/proxy';
        // Construct discovery endpoint
        const baseUrl = proxy.replace(/\/proxy$/, '/aws-discovery');
        
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

        if (result.endpoints && result.endpoints.length > 0) {
            setDiscoveredClusters(result.endpoints);
            // Auto-select first if none selected
            if (!nodesInput) {
                setNodesInput(result.endpoints[0]);
            }
        } else {
            setDiscoveryError("No Serverless Collections found in this region.");
        }
    } catch (e: any) {
        console.error("Discovery failed", e);
        setDiscoveryError(e.message || "Discovery failed");
    } finally {
        setDiscovering(false);
    }
  };

  // 2. Fetch Indices from the configured Node
  const handleFetchIndices = async () => {
      setFetchingIndices(true);
      try {
          // Construct a temporary config to use the service
          const tempConfig: OpenSearchConfig = {
              ...formData,
              nodes: nodesInput.split('\n').filter(Boolean)
          };
          
          if (tempConfig.nodes.length === 0) return;

          const indices = await OpenSearchService.getIndices(tempConfig);
          const names = indices.map(i => i.index);
          setDiscoveredIndices(names);
          
          if (names.length > 0 && !names.includes(formData.index)) {
             setFormData(prev => ({...prev, index: names[0]}));
          }
      } catch (e) {
          console.error("Index fetch failed", e);
      } finally {
          setFetchingIndices(false);
      }
  };

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

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Server className="w-5 h-5 text-accent" />
            Connection Settings
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          
          <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-sm border border-blue-100 mb-4">
            <strong>Note:</strong> Connect to your OpenSearch Proxy (backend) for secure access, or use Demo Mode.
          </div>

          <div className="flex items-center mb-6">
            <input
              type="checkbox"
              id="useDemoMode"
              name="useDemoMode"
              checked={formData.useDemoMode}
              onChange={handleChange}
              className="w-5 h-5 text-accent rounded border-gray-300 focus:ring-accent"
            />
            <label htmlFor="useDemoMode" className="ml-2 text-slate-700 font-medium cursor-pointer">
              Use Demo Mode (Mock Data)
            </label>
          </div>

          <div className={`space-y-4 transition-opacity ${formData.useDemoMode ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            
            {/* Proxy & Region */}
             <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                        <Network size={16} /> Proxy URL
                    </label>
                    <input
                        type="text"
                        name="proxyUrl"
                        value={formData.proxyUrl || ''}
                        onChange={handleChange}
                        placeholder="http://localhost:3000/api/proxy"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
                    />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                        <Globe size={16} /> Region
                    </label>
                    <input
                        type="text"
                        name="region"
                        value={formData.region}
                        onChange={handleChange}
                        placeholder="us-east-1"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
                    />
                </div>
            </div>

            {/* Auth Section */}
             <div className="relative pt-2 pb-2">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-2 text-sm text-gray-500 font-medium">Authentication</span>
              </div>
            </div>

            <div className="flex p-1 bg-slate-100 rounded-lg mb-4">
              <button
                type="button"
                onClick={() => handleAuthTypeChange('profile')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${
                  formData.authType === 'profile' 
                    ? 'bg-white text-accent shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Users size={16} /> AWS Profile
              </button>
              <button
                type="button"
                onClick={() => handleAuthTypeChange('manual')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${
                  formData.authType === 'manual' 
                    ? 'bg-white text-accent shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Key size={16} /> Access Keys
              </button>
            </div>

            {formData.authType === 'profile' ? (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                   <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                     <Users size={16} /> Select Profile
                   </label>
                   <select
                     name="profile"
                     value={formData.profile || ''}
                     onChange={handleChange}
                     disabled={loadingProfiles || profiles.length === 0}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
                   >
                     <option value="">-- Select a Profile --</option>
                     {profiles.map(p => (
                       <option key={p} value={p}>{p}</option>
                     ))}
                   </select>
                   {profiles.length === 0 && !loadingProfiles && (
                     <p className="text-xs text-orange-400 mt-1">No profiles found. Check ~/.aws/credentials on the server.</p>
                   )}
                </div>
            ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                          <Lock size={16} /> Access Key
                          </label>
                          <input
                          type="password"
                          name="accessKey"
                          value={formData.accessKey}
                          onChange={handleChange}
                          placeholder="AKIA..."
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                          <Lock size={16} /> Secret Key
                          </label>
                          <input
                          type="password"
                          name="secretKey"
                          value={formData.secretKey}
                          onChange={handleChange}
                          placeholder="wJalrX..."
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
                          />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                          <Key size={16} /> Session Token (Optional)
                      </label>
                      <textarea
                          name="sessionToken"
                          value={formData.sessionToken || ''}
                          onChange={handleChange}
                          placeholder="IQoJb3JpZ2luX2Vj..."
                          rows={2}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent font-mono text-xs"
                      />
                    </div>
                </div>
            )}

            {/* Cluster & Index Selection */}
            <div className="relative pt-2 pb-2">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-2 text-sm text-gray-500 font-medium">Target</span>
              </div>
            </div>

            {/* Cluster Nodes with Discovery */}
            <div>
              <div className="flex justify-between items-center mb-1">
                 <label className="block text-sm font-medium text-slate-700 flex items-center gap-2">
                   <Globe size={16} /> Cluster Nodes
                 </label>
                 <button 
                   type="button"
                   onClick={handleDiscoverClusters}
                   disabled={discovering}
                   className="text-xs text-accent hover:text-blue-700 flex items-center gap-1 disabled:opacity-50"
                 >
                    <RefreshCw size={12} className={discovering ? 'animate-spin' : ''} />
                    {discovering ? 'Discovering...' : 'Discover Collections'}
                 </button>
              </div>
              
              {discoveryError && (
                 <div className="text-xs text-red-500 mb-2">{discoveryError}</div>
              )}

              {/* Toggle between Textarea and Select if discovery worked */}
              {discoveredClusters.length > 0 ? (
                 <div className="relative">
                    <select
                        value={nodesInput}
                        onChange={(e) => setNodesInput(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
                    >
                        {discoveredClusters.map(url => (
                            <option key={url} value={url}>{url}</option>
                        ))}
                        <option value={nodesInput}>Manual Entry...</option>
                    </select>
                    {nodesInput === discoveredClusters[0] && (
                        <button 
                          type="button"
                          onClick={() => setDiscoveredClusters([])}
                          className="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-red-500"
                        >
                            Reset
                        </button>
                    )}
                 </div>
              ) : (
                <textarea
                    name="nodes"
                    value={nodesInput}
                    onChange={(e) => setNodesInput(e.target.value)}
                    placeholder="https://<id>.us-east-1.aoss.amazonaws.com"
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent font-mono text-sm"
                />
              )}
            </div>

            {/* Initial Index with Fetch */}
            <div>
                <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-slate-700 flex items-center gap-2">
                        <Database size={16} /> Initial Index
                    </label>
                    {nodesInput.trim().length > 0 && (
                        <button 
                            type="button"
                            onClick={handleFetchIndices}
                            disabled={fetchingIndices}
                            className="text-xs text-accent hover:text-blue-700 flex items-center gap-1 disabled:opacity-50"
                        >
                            <RefreshCw size={12} className={fetchingIndices ? 'animate-spin' : ''} />
                            Fetch Indices
                        </button>
                    )}
                </div>
                
                {discoveredIndices.length > 0 ? (
                     <div className="relative">
                        <select
                            name="index"
                            value={formData.index}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
                        >
                             {discoveredIndices.map(idx => (
                                <option key={idx} value={idx}>{idx}</option>
                             ))}
                             <option value={formData.index}>Manual Entry...</option>
                        </select>
                     </div>
                ) : (
                    <input
                        type="text"
                        name="index"
                        value={formData.index}
                        onChange={handleChange}
                        placeholder="logs-v1"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
                    />
                )}
            </div>

          </div>
        </form>

        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button 
            type="button" 
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit}
            className="px-6 py-2 bg-accent hover:bg-blue-600 text-white rounded-lg font-medium shadow-sm transition-colors"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};