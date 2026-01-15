import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Search, 
  MapPin, 
  Settings, 
  ChevronLeft, 
  ChevronRight, 
  Database,
  Eye,
  RefreshCw,
  List,
  Columns,
  Check
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

// Helper to safely access nested properties
const getNestedValue = (obj: any, path: string) => {
  if (!obj) return null;
  return path.split('.').reduce((prev, curr) => prev ? prev[curr] : null, obj);
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

  // Table Column State
  const [visibleColumns, setVisibleColumns] = useState<string[]>(['_id', '_score']);
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false);
  const columnSelectorRef = useRef<HTMLDivElement>(null);

  // Close column selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnSelectorRef.current && !columnSelectorRef.current.contains(event.target as Node)) {
        setIsColumnSelectorOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSaveConfig = (newConfig: OpenSearchConfig) => {
    setConfig(newConfig);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    } catch (e) {
      console.error("Failed to save config to local storage", e);
    }
    setData(null);
  };

  // Fetch available indices
  useEffect(() => {
    const loadIndices = async () => {
       // Clear indices to indicate loading and ensure UI updates
       setIndices([]);
       
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

  // Auto-select valid index when indices change (e.g. collection switch)
  useEffect(() => {
    if (indices.length > 0) {
      const isCurrentValid = indices.some(idx => idx.index === config.index);
      if (!isCurrentValid) {
        // Automatically select the first available index
        const firstIndex = indices[0].index;
        // Avoid infinite loops by only updating if different
        if (config.index !== firstIndex) {
            handleSaveConfig({ ...config, index: firstIndex });
        }
      }
    }
  }, [indices, config.index]);

  // Fetch Mapping & Set Default Columns
  useEffect(() => {
    const fetchMapping = async () => {
      try {
        const fields = await OpenSearchService.getMapping(config);
        setAvailableFields(fields);
        
        // Smart default columns
        const defaults = ['_id', '_score'];
        const candidates = ['name', 'title', 'message', 'status', 'level', 'timestamp', '@timestamp'];
        const found = fields.filter(f => candidates.includes(f.path)).map(f => f.path);
        
        // If we found some good candidates, use them. 
        // We only override defaults if the current visible columns are just the basic ID/Score
        setVisibleColumns(prev => {
             const isBasic = prev.length === 2 && prev.includes('_id') && prev.includes('_score');
             return isBasic && found.length > 0 ? [...defaults, ...found.slice(0, 4)] : prev;
        });

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
    }, 400); 
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

  const toggleColumn = (col: string) => {
      setVisibleColumns(prev => 
          prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
      );
  };

  const renderCell = (hit: OpenSearchHit<DocumentSource>, col: string) => {
      if (col === '_id') return <span className="font-mono text-slate-600 truncate block max-w-[150px]" title={hit._id}>{hit._id}</span>;
      if (col === '_score') return <span className="inline-block px-2 py-0.5 bg-slate-100 rounded text-xs">{hit._score?.toFixed(2)}</span>;
      if (col === '_index') return hit._index;

      const val = getNestedValue(hit._source, col);
      
      if (val === null || val === undefined) return <span className="text-slate-300">-</span>;
      if (typeof val === 'object') return <span className="text-xs font-mono text-slate-400">{JSON.stringify(val).slice(0, 30)}...</span>;
      return <span className="text-slate-800 text-sm">{String(val)}</span>;
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
          <div className="bg-white border-b border-slate-200 shadow-sm z-20 flex flex-col">
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

              {/* Action Buttons */}
              <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                 {/* Column Selector */}
                 <div className="relative" ref={columnSelectorRef}>
                    <button 
                        onClick={() => setIsColumnSelectorOpen(!isColumnSelectorOpen)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                            isColumnSelectorOpen 
                            ? 'bg-slate-100 text-slate-800 border-slate-300' 
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                        title="Select Columns"
                    >
                        <Columns size={18} />
                    </button>
                    {isColumnSelectorOpen && (
                        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-xl border border-slate-200 z-50 animate-in slide-in-from-top-2 duration-200 flex flex-col max-h-96">
                            <div className="p-3 border-b border-slate-100 font-semibold text-xs text-slate-500 uppercase">
                                Visible Columns
                            </div>
                            <div className="overflow-y-auto flex-1 p-2 space-y-1">
                                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={visibleColumns.includes('_id')} 
                                        onChange={() => toggleColumn('_id')}
                                        className="rounded text-accent focus:ring-accent"
                                    />
                                    <span className="text-sm text-slate-700">ID</span>
                                </label>
                                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={visibleColumns.includes('_score')} 
                                        onChange={() => toggleColumn('_score')}
                                        className="rounded text-accent focus:ring-accent"
                                    />
                                    <span className="text-sm text-slate-700">Score</span>
                                </label>
                                {availableFields.map(field => (
                                    <label key={field.path} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={visibleColumns.includes(field.path)} 
                                            onChange={() => toggleColumn(field.path)}
                                            className="rounded text-accent focus:ring-accent"
                                        />
                                        <span className="text-sm text-slate-700 truncate" title={field.path}>
                                            {field.path} <span className="text-xs text-slate-400">({field.type})</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                 </div>

                <button 
                  onClick={toggleGeoFilter}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                    filters.geo.enabled 
                      ? 'bg-blue-50 text-accent border-blue-200' 
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                  title="Toggle Geo Filter"
                >
                  <MapPin size={18} />
                  Geo
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
                          {visibleColumns.map(col => (
                              <th key={col} className="px-6 py-3 border-b border-slate-200 truncate max-w-[150px]" title={col}>
                                  {col.replace(/_/g, '').toUpperCase()}
                              </th>
                          ))}
                          <th className="px-6 py-3 border-b border-slate-200 text-right w-24">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data?.hits.hits.map((hit) => (
                          <tr key={hit._id} className="hover:bg-slate-50 transition-colors group">
                            {visibleColumns.map(col => (
                                <td key={`${hit._id}-${col}`} className="px-6 py-3 border-b border-slate-50">
                                    {renderCell(hit, col)}
                                </td>
                            ))}
                            <td className="px-6 py-3 text-right">
                               <button 
                                 onClick={() => setSelectedDoc(hit)}
                                 className="text-accent hover:text-blue-700 font-medium text-sm flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity w-full"
                               >
                                 <Eye size={16} />
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