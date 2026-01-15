import React, { useState, useEffect } from 'react';
import { X, Server, Key, Globe, Database, Map } from 'lucide-react';
import { OpenSearchConfig } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: OpenSearchConfig;
  onSave: (config: OpenSearchConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, config, onSave }) => {
  const [formData, setFormData] = useState<OpenSearchConfig>(config);
  // Separate state for the textarea content
  const [nodesInput, setNodesInput] = useState(config.nodes.join('\n'));

  // Sync internal state if config prop updates
  useEffect(() => {
    setFormData(config);
    setNodesInput(config.nodes.join('\n'));
  }, [config]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Parse nodes input
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
            <strong>Note:</strong> Connecting directly to AWS OpenSearch Serverless from a browser typically requires a proxy to handle CORS and SigV4 signing. Enable <b>Demo Mode</b> to explore the UI without credentials.
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
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                <Globe size={16} /> Cluster Nodes
              </label>
              <div className="text-xs text-slate-500 mb-2">Enter one URL per line</div>
              <textarea
                name="nodes"
                value={nodesInput}
                onChange={(e) => setNodesInput(e.target.value)}
                placeholder="https://node-1.es.amazonaws.com&#10;https://node-2.es.amazonaws.com"
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                        <Database size={16} /> Index Name
                    </label>
                    <input
                        type="text"
                        name="index"
                        value={formData.index}
                        onChange={handleChange}
                        placeholder="my-logs-index"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                        <Map size={16} /> GeoPoint Field
                    </label>
                    <input
                        type="text"
                        name="geoField"
                        value={formData.geoField}
                        onChange={handleChange}
                        placeholder="location"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                  <Key size={16} /> Access Key
                </label>
                <input
                  type="password"
                  name="accessKey"
                  value={formData.accessKey}
                  onChange={handleChange}
                  placeholder="AKIA..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                  <Key size={16} /> Secret Key
                </label>
                <input
                  type="password"
                  name="secretKey"
                  value={formData.secretKey}
                  onChange={handleChange}
                  placeholder="wJalrX..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
              </div>
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