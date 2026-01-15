import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  MapPin, 
  Settings, 
  ChevronLeft, 
  ChevronRight, 
  Database,
  Eye,
  RefreshCw,
  List
} from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';
import { JsonViewer } from './components/JsonViewer';
import { FilterBuilder } from './components/FilterBuilder';
import { OpenSearchService } from './services/opensearchService';
import { 
  OpenSearchConfig, 
  SearchFilters, 
  OpenSearchResponse, 
  OpenSearchHit, 
  DocumentSource,
  FieldDefinition,
  FieldFilter,
  IndexInfo
} from './types';

const INITIAL_CONFIG: OpenSearchConfig = {
  nodes: [],
  region: 'us-east-1',
  accessKey: '',
  secretKey: '',
  sessionToken: '',
  authType: 'profile', // Default to profile
  profile: 'default',
  index: 'logs-v1',
  useDemoMode: true,
  // Default to full URL for server
  proxyUrl: 'http://localhost:3000/api/proxy'
};

const INITIAL_FILTERS: SearchFilters = {
  query: '',
  geo: {
    enabled: false,
    latitude: 34.0522, // Los Angeles default
    longitude: -118.2437,
    radius: 50,
    unit: 'km',
    geoField: 'location' // Default geo field
  },
  fieldFilters: [],
  from: 0,
  size: 20
};

const STORAGE_KEY = 'opensearch_navigator_config_v1';

const loadConfig = (): OpenSearchConfig => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...INITIAL_CONFIG, ...JSON.parse(stored) };
    }
  } catch (err) {
    console.warn('Failed to load config from storage', err);
  }
  return INITIAL_CONFIG;
};

export default function App() {
  const [config, setConfig] = useState<OpenSearchConfig>(loadConfig);
  const [filters, setFilters] = useState<SearchFilters>(INITIAL_FILTERS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [data, setData] = useState<OpenSearchResponse<DocumentSource> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedDoc, setSelectedDoc] = useState<OpenSearchHit<DocumentSource> | null>(null);
  const [availableFields, setAvailableFields] = useState<FieldDefinition[]>([]);
  const [indices, setIndices] = useState<IndexInfo[]>([]);

  const handleSaveConfig = (newConfig: OpenSearchConfig) => {
    setConfig(newConfig);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    } catch (e) {
      console.error("Failed to save config to local storage", e);
    }
    setData(null);
  };

  // Fetch available indices when config nodes/creds change
  useEffect(() => {
    const loadIndices = async () => {
       if (config.nodes.length > 0 || config.useDemoMode) {
         try {
           const list = await OpenSearchService.getIndices(config);
           setIndices(list);
         } catch (e) {
           console.error("Error loading indices", e);
         }
       }
    };
    loadIndices();
  }, [config.nodes, config.accessKey, config.useDemoMode, config.proxyUrl, config.authType, config.profile, config.region]);

  // Fetch Mapping when config index changes
  useEffect(() => {
    const fetchMapping = async () => {
      try {
        const fields = await OpenSearchService.getMapping(config);
        setAvailableFields(fields);
      } catch (err) {
        console.warn("Could not fetch mapping", err);
      }
    };
    fetchMapping();
  }, [config.index, config.nodes, config.accessKey, config.useDemoMode, config.authType, config.profile, config.region]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await OpenSearchService.search(config, filters);
      setData(response);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [config, filters]);

  // Debounced fetch for query changes
  useEffect(() => {
    const timer = setTimeout(() => {
        fetchData();
    }, 400); // Simple debounce
    return () => clearTimeout(timer);
  }, [fetchData]);

  const handlePageChange = (direction: 'next' | 'prev') => {
    setFilters(prev => {
      const newFrom = direction === 'next' 
        ? prev.from + prev.size 
        : Math.max(0, prev.from - prev.size);
      return { ...prev, from: newFrom };
    });
  };

  const toggleGeoFilter = () => {
    setFilters(prev => ({
      ...prev,
      geo: { ...prev.geo, enabled: !prev.geo.enabled }
    }));
  };

  const addFieldFilter = (filter: FieldFilter) => {
    setFilters(prev => ({
      ...prev,
      from: 0,
      fieldFilters: [...prev.fieldFilters, filter]
    }));
  };

  const removeFieldFilter = (id: string) => {
    setFilters(prev => ({
      ...prev,
      from: 0,
      fieldFilters: prev.fieldFilters.filter(f => f.id !== id)
    }));
  };

  const handleIndexChange = (newIndex: string) => {
      handleSaveConfig({ ...config, index: newIndex });
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col h-screen overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 z-10 flex-none h-16">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-accent/10 p-2 rounded-lg">
              <Database className="text-accent" size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-tight">OpenSearch Navigator</h1>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className={`w-2 h-2 rounded-full ${config.useDemoMode ? 'bg-orange-400' : 'bg-green-500'}`}></span>
                {config.useDemoMode ? 'Demo Mode' : (config.nodes.length > 0 ? `${config.nodes.length} Node(s)` : 'No Nodes Configured')}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => fetchData()}
              className="p-2 text-slate-500 hover:text-accent hover:bg-slate-50 rounded-lg transition-colors"
              title="Refresh Data"
            >
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-200 transition-all text-sm font-medium"
            >
              <Settings size={18} />
              Settings
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          
          {/* Filter Bar */}
          <div className="bg-white border-b border-slate-200 shadow-sm z-10 flex flex-col">
            {/* Top Row: Index Select, Search & Toggles */}
            <div className="p-4 flex flex-col md:flex-row gap-4 max-w-7xl mx-auto w-full">
              
              {/* Index Selector */}
              <div className="w-full md:w-48 relative flex-none">
                 <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                   <List size={16} />
                 </div>
                 <select 
                   value={config.index}
                   onChange={(e) => handleIndexChange(e.target.value)}
                   className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm font-medium text-slate-700 truncate"
                 >
                    {indices.length > 0 ? (
                       indices.map(idx => (
                         <option key={idx.index} value={idx.index}>{idx.index} ({idx.docsCount})</option>
                       ))
                    ) : (
                       <option value={config.index}>{config.index}</option>
                    )}
                 </select>
                 <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <ChevronDownIcon />
                 </div>
              </div>

              {/* Search Input */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Search documents..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                  value={filters.query}
                  onChange={(e) => setFilters(prev => ({ ...prev, query: e.target.value, from: 0 }))}
                />
              </div>

              {/* Geo Filter Toggle */}
              <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                <button 
                  onClick={toggleGeoFilter}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                    filters.geo.enabled 
                      ? 'bg-blue-50 text-accent border-blue-200' 
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <MapPin size={18} />
                  Geo Filter
                </button>
              </div>
            </div>
            
            {/* Bottom Row: Dynamic Filters */}
            <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50/50">
              <div className="max-w-7xl mx-auto pt-3">
                 <FilterBuilder 
                   fields={availableFields} 
                   activeFilters={filters.fieldFilters}
                   onAddFilter={addFieldFilter}
                   onRemoveFilter={removeFieldFilter}
                 />
              </div>
            </div>

            {/* Geo Settings Drawer */}
            {filters.geo.enabled && (
               <div className="bg-blue-50/50 border-t border-blue-100 px-4 py-3 animate-in slide-in-from-top-2 fade-in duration-200">
                  <div className="max-w-7xl mx-auto flex items-end gap-4">
                     <div className="w-48">
                      <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Geo Point Field</label>
                      <input 
                        type="text" 
                        value={filters.geo.geoField}
                        onChange={(e) => setFilters(prev => ({ ...prev, geo: { ...prev.geo, geoField: e.target.value } }))}
                        placeholder="location"
                        className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded focus:border-accent focus:ring-1 focus:ring-accent outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Latitude</label>
                      <input 
                        type="number" 
                        value={filters.geo.latitude}
                        onChange={(e) => setFilters(prev => ({ ...prev, geo: { ...prev.geo, latitude: parseFloat(e.target.value) } }))}
                        className="w-32 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Longitude</label>
                      <input 
                        type="number" 
                        value={filters.geo.longitude}
                        onChange={(e) => setFilters(prev => ({ ...prev, geo: { ...prev.geo, longitude: parseFloat(e.target.value) } }))}
                        className="w-32 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                      />
                    </div>
                    <div>
                       <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Radius</label>
                       <div className="flex">
                           <input 
                             type="number" 
                             value={filters.geo.radius}
                             onChange={(e) => setFilters(prev => ({ ...prev, geo: { ...prev.geo, radius: parseFloat(e.target.value) } }))}
                             className="w-24 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-l focus:border-accent focus:ring-1 focus:ring-accent outline-none border-r-0"
                           />
                           <select
                              value={filters.geo.unit}
                              onChange={(e) => setFilters(prev => ({ ...prev, geo: { ...prev.geo, unit: e.target.value as 'km' | 'mi' } }))}
                              className="bg-slate-100 border border-slate-200 text-sm px-2 rounded-r focus:outline-none focus:border-accent hover:bg-slate-200 cursor-pointer text-slate-700"
                           >
                              <option value="km">KM</option>
                              <option value="mi">Miles</option>
                           </select>
                       </div>
                    </div>
                    <div className="flex-1 text-right text-xs text-slate-400 pb-2">
                       Filtering docs within {filters.geo.radius} {filters.geo.unit === 'mi' ? 'miles' : 'km'} of [{filters.geo.latitude}, {filters.geo.longitude}]
                    </div>
                  </div>
               </div>
            )}
          </div>

          {/* Data Table */}
          <div className="flex-1 overflow-auto bg-slate-50 p-4">
            <div className="max-w-7xl mx-auto bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden flex flex-col h-full">
              
              {/* Table Header */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-white sticky top-0 z-10">
                <div className="text-sm text-slate-500">
                  {loading ? 'Searching...' : (
                    <>Found <span className="font-semibold text-slate-900">{data?.hits.total.value ?? 0}</span> results</>
                  )}
                </div>
                <div className="flex items-center gap-2">
                   <button 
                     disabled={filters.from === 0 || loading}
                     onClick={() => handlePageChange('prev')}
                     className="p-1 hover:bg-slate-100 rounded disabled:opacity-30"
                   >
                     <ChevronLeft size={20} />
                   </button>
                   <span className="text-sm font-medium text-slate-600">
                     {filters.from + 1}-{Math.min((data?.hits.total.value || 0), filters.from + filters.size)}
                   </span>
                   <button 
                     disabled={!data || (filters.from + filters.size >= data.hits.total.value) || loading}
                     onClick={() => handlePageChange('next')}
                     className="p-1 hover:bg-slate-100 rounded disabled:opacity-30"
                   >
                     <ChevronRight size={20} />
                   </button>
                </div>
              </div>

              {/* Table Body */}
              <div className="flex-1 overflow-auto">
                 {loading && !data ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                       <RefreshCw className="animate-spin mb-2" size={32} />
                       <p>Loading data...</p>
                    </div>
                 ) : error ? (
                    <div className="flex flex-col items-center justify-center h-64 text-red-500 bg-red-50 p-6 rounded m-4">
                       <p className="font-bold">Error fetching data</p>
                       <p className="text-sm mt-1">{error}</p>
                    </div>
                 ) : (
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold sticky top-0">
                        <tr>
                          <th className="px-6 py-3 border-b border-slate-200">ID</th>
                          <th className="px-6 py-3 border-b border-slate-200">Name/Source</th>
                          <th className="px-6 py-3 border-b border-slate-200">Score</th>
                          <th className="px-6 py-3 border-b border-slate-200 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data?.hits.hits.map((hit) => (
                          <tr key={hit._id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-6 py-3 text-sm font-mono text-slate-600 truncate max-w-[150px]" title={hit._id}>
                              {hit._id}
                            </td>
                            <td className="px-6 py-3 text-sm text-slate-800">
                               <div className="font-medium">{hit._source.name || hit._source.title || 'Untitled Document'}</div>
                               <div className="text-xs text-slate-500 truncate max-w-md">{hit._source.description || JSON.stringify(hit._source).substring(0, 60)}...</div>
                            </td>
                            <td className="px-6 py-3 text-sm text-slate-500">
                              <span className="inline-block px-2 py-0.5 bg-slate-100 rounded text-xs">
                                {hit._score?.toFixed(2)}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-right">
                               <button 
                                 onClick={() => setSelectedDoc(hit)}
                                 className="text-accent hover:text-blue-700 font-medium text-sm flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                               >
                                 <Eye size={16} /> View JSON
                               </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                 )}
              </div>
            </div>
          </div>
        </main>

        {/* JSON Detail Slide-over Panel */}
        {selectedDoc && (
          <div className="absolute inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-[1px]" onClick={() => setSelectedDoc(null)}>
            <div 
              className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Document Details</h3>
                  <p className="text-xs font-mono text-slate-500 mt-0.5">{selectedDoc._id}</p>
                </div>
                <button 
                  onClick={() => setSelectedDoc(null)}
                  className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
                >
                  <ChevronRight size={24} />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-6">
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 overflow-x-auto">
                   <JsonViewer data={selectedDoc} initialExpanded={true} />
                </div>
              </div>
              <div className="p-4 border-t border-slate-100 bg-slate-50 text-xs text-slate-400 flex justify-between">
                 <span>Index: {selectedDoc._index}</span>
                 <span>Score: {selectedDoc._score}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSave={handleSaveConfig}
      />
    </div>
  );
}

const ChevronDownIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);