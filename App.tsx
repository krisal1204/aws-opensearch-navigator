import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Search, 
  MapPin, 
  Settings, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Database,
  Eye,
  RefreshCw,
  List,
  Columns,
  Check,
  AlertCircle,
  Filter as FilterIcon
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
  proxyUrl: '/api/proxy'
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
  const [loadingIndices, setLoadingIndices] = useState(false);
  const [indicesError, setIndicesError] = useState<string | null>(null);

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
       setIndices([]);
       setIndicesError(null);
       
       if (config.nodes.length > 0 || config.useDemoMode) {
         setLoadingIndices(true);
         try {
           const list = await OpenSearchService.getIndices(config);
           setIndices(list);
         } catch (e: any) {
           console.error("Error loading indices", e);
           setIndicesError(e.message || "Failed to load indices");
         } finally {
            setLoadingIndices(false);
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
    // CRITICAL: Don't fire search if we are in a bad state
    // We only search if:
    // 1. We are in Demo Mode OR
    // 2. We are in Live Mode AND there are no index loading errors AND indices are not currently loading
    if (!config.useDemoMode && (indicesError || loadingIndices)) {
        return; 
    }

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
  }, [config, filters, indicesError, loadingIndices]);

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
      if (col === '_id') return <span className="font-mono text-gray-500 truncate block max-w-[150px]" title={hit._id}>{hit._id}</span>;
      if (col === '_score') return <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-xs font-medium">{hit._score?.toFixed(2)}</span>;
      if (col === '_index') return hit._index;

      const val = getNestedValue(hit._source, col);
      
      if (val === null || val === undefined) return <span className="text-gray-300">-</span>;
      if (typeof val === 'object') return <span className="text-xs font-mono text-gray-400">{JSON.stringify(val).slice(0, 30)}...</span>;
      return <span className="text-gray-700 text-sm">{String(val)}</span>;
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col h-screen overflow-hidden font-sans text-gray-900">
      {/* Top Navigation Bar */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200/50 z-30 flex-none h-16 transition-all duration-200">
        <div className="max-w-[1600px] mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-600/20">
              <Database className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight leading-none">Navigator</h1>
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${config.useDemoMode ? 'bg-orange-400' : 'bg-emerald-500'}`}></span>
                {config.useDemoMode ? 'Demo Mode' : (config.nodes.length > 0 ? `${config.nodes.length} Node(s)` : 'No Nodes')}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => fetchData()}
              className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all duration-200"
              title="Refresh Data"
            >
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl shadow-sm transition-all duration-200 text-sm font-medium"
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
          <div className="bg-white z-20 flex flex-col shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
            {/* Top Row: Index Select, Search & Toggles */}
            <div className="p-4 flex flex-col lg:flex-row gap-4 max-w-[1600px] mx-auto w-full items-center">
              
              {/* Index Selector */}
              <div className="w-full lg:w-80 relative flex-none group">
                 <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10 group-focus-within:text-blue-500 transition-colors">
                   <List size={18} />
                 </div>
                 
                 {loadingIndices ? (
                    <div className="w-full pl-10 pr-4 py-2.5 bg-gray-50 rounded-xl text-sm text-gray-500 italic border border-transparent">
                        Loading...
                    </div>
                 ) : (indices.length > 0) ? (
                     <div className="relative">
                        <select 
                        value={config.index}
                        onChange={(e) => handleIndexChange(e.target.value)}
                        className="w-full pl-10 pr-10 py-2.5 bg-gray-50 hover:bg-gray-100 border border-transparent focus:bg-white focus:border-blue-500/30 focus:ring-4 focus:ring-blue-500/10 rounded-xl appearance-none outline-none text-sm font-medium text-gray-700 truncate cursor-pointer transition-all duration-200"
                        >
                            {indices.map(idx => (
                                <option key={idx.index} value={idx.index}>{idx.index} ({idx.docsCount})</option>
                            ))}
                        </select>
                        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                            <ChevronDown size={14} />
                        </div>
                     </div>
                 ) : (
                    <div className="relative">
                        <input 
                            type="text" 
                            value={config.index}
                            onChange={(e) => handleIndexChange(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500/30 focus:ring-4 focus:ring-blue-500/10 rounded-xl outline-none text-sm text-gray-700 placeholder-gray-400 transition-all duration-200"
                            placeholder="Enter Index Name"
                        />
                        {indicesError && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400" title={indicesError}>
                                <AlertCircle size={16} />
                            </div>
                        )}
                    </div>
                 )}
              </div>

              {/* Search Input */}
              <div className="flex-1 w-full relative group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                <input 
                  type="text" 
                  placeholder="Search documents..."
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 hover:bg-gray-100 border border-transparent focus:bg-white focus:border-blue-500/30 focus:ring-4 focus:ring-blue-500/10 rounded-xl outline-none transition-all duration-200 text-sm text-gray-700"
                  value={filters.query}
                  onChange={(e) => setFilters(prev => ({ ...prev, query: e.target.value, from: 0 }))}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 w-full lg:w-auto justify-end">
                 {/* Column Selector */}
                 <div className="relative" ref={columnSelectorRef}>
                    <button 
                        onClick={() => setIsColumnSelectorOpen(!isColumnSelectorOpen)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all duration-200 shadow-sm ${
                            isColumnSelectorOpen 
                            ? 'bg-gray-100 text-gray-900 border-gray-300' 
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                        title="Select Columns"
                    >
                        <Columns size={18} />
                        <span className="hidden xl:inline">Columns</span>
                    </button>
                    {isColumnSelectorOpen && (
                        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 ring-1 ring-black/5 z-50 animate-in slide-in-from-top-2 duration-200 flex flex-col max-h-[500px]">
                            <div className="p-4 border-b border-gray-50 flex items-center justify-between">
                                <span className="font-semibold text-xs text-gray-400 uppercase tracking-wider">Visible Columns</span>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => setVisibleColumns(['_id', '_score', ...availableFields.map(f => f.path)])}
                                        className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors px-2 py-1 hover:bg-blue-50 rounded"
                                    >
                                        All
                                    </button>
                                    <button 
                                        onClick={() => setVisibleColumns([])}
                                        className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors px-2 py-1 hover:bg-gray-50 rounded"
                                    >
                                        None
                                    </button>
                                </div>
                            </div>
                            <div className="overflow-y-auto flex-1 p-2 space-y-0.5 custom-scrollbar">
                                <label className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={visibleColumns.includes('_id')} 
                                        onChange={() => toggleColumn('_id')} 
                                        className="rounded text-blue-600 focus:ring-blue-500 border-gray-300 w-4 h-4" 
                                    />
                                    <span className="text-sm text-gray-700 font-medium">ID</span>
                                </label>
                                <label className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={visibleColumns.includes('_score')} 
                                        onChange={() => toggleColumn('_score')} 
                                        className="rounded text-blue-600 focus:ring-blue-500 border-gray-300 w-4 h-4" 
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Score</span>
                                </label>
                                {availableFields.map(field => (
                                    <label key={field.path} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                                        <input 
                                            type="checkbox" 
                                            checked={visibleColumns.includes(field.path)} 
                                            onChange={() => toggleColumn(field.path)} 
                                            className="rounded text-blue-600 focus:ring-blue-500 border-gray-300 w-4 h-4" 
                                        />
                                        <span className="text-sm text-gray-700 truncate font-medium" title={field.path}>
                                            {field.path} <span className="text-xs text-gray-400 font-normal ml-1">({field.type})</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                 </div>

                 <button 
                    onClick={toggleGeoFilter}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all duration-200 shadow-sm ${
                        filters.geo.enabled 
                        ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-blue-500/10' 
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    title="Toggle Geo Filter"
                 >
                    <MapPin size={18} />
                    <span className="hidden xl:inline">Geo Filter</span>
                 </button>
              </div>
            </div>

            {/* Filter Builder Area */}
            <div className="px-4 pb-4 bg-white">
               <div className="max-w-[1600px] mx-auto pt-2 pb-2">
                  <FilterBuilder 
                    fields={availableFields} 
                    activeFilters={filters.fieldFilters} 
                    onAddFilter={addFieldFilter}
                    onRemoveFilter={removeFieldFilter}
                  />
               </div>
            </div>

            {/* Geo Filter Panel */}
            {filters.geo.enabled && (
              <div className="bg-blue-50/50 border-t border-blue-100 px-6 py-4 animate-in slide-in-from-top-2 fade-in duration-200">
                <div className="max-w-[1600px] mx-auto flex flex-wrap items-end gap-6">
                  <div className="w-64">
                    <label className="block text-[10px] font-bold text-blue-400 mb-1.5 uppercase tracking-wider">Geo Point Field</label>
                    <input 
                      type="text" 
                      value={filters.geo.geoField}
                      onChange={(e) => setFilters(prev => ({ ...prev, geo: { ...prev.geo, geoField: e.target.value } }))}
                      placeholder="location"
                      className="w-full px-3 py-2 text-sm bg-white border border-blue-100 rounded-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none font-mono text-blue-900 placeholder-blue-300"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-blue-400 mb-1.5 uppercase tracking-wider">Latitude</label>
                    <input 
                      type="number" 
                      value={filters.geo.latitude}
                      onChange={(e) => setFilters(prev => ({ ...prev, geo: { ...prev.geo, latitude: parseFloat(e.target.value) } }))}
                      className="w-32 px-3 py-2 text-sm bg-white border border-blue-100 rounded-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none text-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-blue-400 mb-1.5 uppercase tracking-wider">Longitude</label>
                    <input 
                      type="number" 
                      value={filters.geo.longitude}
                      onChange={(e) => setFilters(prev => ({ ...prev, geo: { ...prev.geo, longitude: parseFloat(e.target.value) } }))}
                      className="w-32 px-3 py-2 text-sm bg-white border border-blue-100 rounded-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none text-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-blue-400 mb-1.5 uppercase tracking-wider">Radius</label>
                    <div className="flex shadow-sm rounded-lg overflow-hidden">
                      <input 
                        type="number" 
                        value={filters.geo.radius}
                        onChange={(e) => setFilters(prev => ({ ...prev, geo: { ...prev.geo, radius: parseFloat(e.target.value) } }))}
                        className="w-24 px-3 py-2 text-sm bg-white border border-blue-100 border-r-0 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none text-blue-900"
                      />
                      <select 
                        value={filters.geo.unit}
                        onChange={(e) => setFilters(prev => ({ ...prev, geo: { ...prev.geo, unit: e.target.value as any } }))}
                        className="bg-blue-50 border border-blue-100 text-sm px-3 focus:outline-none focus:bg-blue-100 cursor-pointer text-blue-700 font-medium"
                      >
                        <option value="km">KM</option>
                        <option value="mi">Miles</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex-1 text-right text-xs text-blue-400/80 pb-2 font-medium">
                    Filtering docs within <span className="text-blue-600 font-bold">{filters.geo.radius} {filters.geo.unit === 'mi' ? 'miles' : 'km'}</span> of [<span className="font-mono">{filters.geo.latitude}, {filters.geo.longitude}</span>]
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Results Area */}
          <div className="flex-1 overflow-auto bg-[#F9FAFB] p-6">
            <div className="max-w-[1600px] mx-auto bg-white border border-gray-100 rounded-2xl shadow-xl shadow-gray-200/50 overflow-hidden flex flex-col h-full ring-1 ring-black/5">
              {/* Results Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
                <div className="text-sm text-gray-500">
                  {loading ? (
                      <span className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                          Searching...
                      </span>
                  ) : (
                    <>Found <span className="font-bold text-gray-900">{data?.hits.total.value.toLocaleString() ?? 0}</span> results</>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    disabled={filters.from === 0 || loading}
                    onClick={() => handlePageChange('prev')}
                    className="p-1.5 hover:bg-gray-100 text-gray-500 hover:text-gray-900 rounded-lg disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="text-sm font-medium text-gray-700 font-mono px-2">
                     {filters.from + 1} - {Math.min((data?.hits.total.value || 0), filters.from + filters.size)}
                  </span>
                  <button 
                    disabled={!data || (filters.from + filters.size >= data.hits.total.value) || loading}
                    onClick={() => handlePageChange('next')}
                    className="p-1.5 hover:bg-gray-100 text-gray-500 hover:text-gray-900 rounded-lg disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

              {/* Table / List */}
              <div className="flex-1 overflow-auto bg-white">
                {loading && !data ? (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
                    <div className="relative">
                        <div className="w-12 h-12 rounded-full border-4 border-gray-100 border-t-blue-500 animate-spin"></div>
                    </div>
                    <p className="font-medium text-gray-500">Retrieving documents...</p>
                  </div>
                ) : indicesError && !config.useDemoMode ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-red-50/50 p-6">
                     <div className="bg-red-100 p-4 rounded-full mb-4 ring-4 ring-red-50">
                        <AlertCircle className="text-red-500" size={32} />
                     </div>
                     <p className="font-bold text-red-600 text-lg">Connection Failed</p>
                     <p className="text-sm mt-2 text-red-500 text-center max-w-lg font-mono bg-white p-4 rounded-xl border border-red-100 shadow-sm">{indicesError}</p>
                     <div className="mt-6 text-xs text-gray-500 max-w-md text-center">
                        <p className="mb-1 font-semibold text-gray-600">Troubleshooting:</p>
                        <p>1. Check AWS Credentials in Settings.</p>
                        <p>2. Verify "es:ESHttpGet" permissions on the resource.</p>
                        <p>3. Ensure Proxy is running and accessible.</p>
                     </div>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center h-64 text-red-500 bg-red-50 p-6 rounded-xl m-4">
                    <p className="font-bold">Error fetching data</p>
                    <p className="text-sm mt-1">{error}</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50/80 backdrop-blur text-gray-400 text-[11px] uppercase tracking-wider font-bold sticky top-0 z-10 border-b border-gray-100">
                      <tr>
                        {visibleColumns.map(col => (
                          <th key={col} className="px-6 py-4 truncate max-w-[200px]" title={col}>
                            {col.replace(/_/g, '')}
                          </th>
                        ))}
                        <th className="px-6 py-4 text-right w-24">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data?.hits.hits.map((hit) => (
                        <tr key={hit._id} className="hover:bg-blue-50/30 transition-colors group">
                          {visibleColumns.map(col => (
                            <td key={`${hit._id}-${col}`} className="px-6 py-4">
                              {renderCell(hit, col)}
                            </td>
                          ))}
                          <td className="px-6 py-4 text-right">
                             <button 
                               onClick={() => setSelectedDoc(hit)}
                               className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"
                               title="View Details"
                             >
                               <Eye size={18} />
                             </button>
                          </td>
                        </tr>
                      ))}
                      {data?.hits.hits.length === 0 && (
                          <tr>
                              <td colSpan={visibleColumns.length + 1} className="text-center py-20 text-gray-400">
                                  <div className="flex flex-col items-center gap-2">
                                    <Search size={32} className="text-gray-200" />
                                    <p>No results found matching your criteria</p>
                                  </div>
                              </td>
                          </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
          
        </main>

        {/* Document Details Sidebar (Overlay) */}
        {selectedDoc && (
          <div className="absolute inset-0 z-50 flex justify-end bg-black/10 backdrop-blur-[2px]" onClick={() => setSelectedDoc(null)}>
            <div className="w-full max-w-3xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 border-l border-gray-100" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-white">
                <div>
                   <h3 className="text-xl font-bold text-gray-900">Document Details</h3>
                   <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-mono rounded">{selectedDoc._index}</span>
                      <span className="text-gray-300">|</span>
                      <p className="text-xs font-mono text-gray-500">{selectedDoc._id}</p>
                   </div>
                </div>
                <button 
                  onClick={() => setSelectedDoc(null)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
                >
                  <ChevronRight size={24} />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-8 bg-[#F9FAFB]">
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm overflow-x-auto">
                   <JsonViewer data={selectedDoc} initialExpanded={true} />
                </div>
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