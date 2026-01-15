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
  Filter as FilterIcon,
  X,
  Loader2,
  GripVertical
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
const COL_SETTINGS_PREFIX = 'os_nav_cols_';

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

// Helper to safely access nested properties, robust to array traversal
const getNestedValue = (obj: any, path: string): any => {
  if (!obj) return null;
  const properties = path.split('.');
  let current = obj;

  for (const prop of properties) {
    if (current === null || current === undefined) return null;

    if (Array.isArray(current)) {
      current = current.map((item: any) => item ? item[prop] : null).filter((val: any) => val !== null && val !== undefined);
      if (Array.isArray(current) && current.length === 0) return null;
    } else {
      current = current[prop];
    }
  }

  return current;
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
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [columnsInitialized, setColumnsInitialized] = useState(false);
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false);
  const [columnSearch, setColumnSearch] = useState('');
  const columnSelectorRef = useRef<HTMLDivElement>(null);
  
  // Refs for State (needed for event handlers to access latest state)
  const columnWidthsRef = useRef(columnWidths);
  const visibleColumnsRef = useRef(visibleColumns);
  
  useEffect(() => { columnWidthsRef.current = columnWidths; }, [columnWidths]);
  useEffect(() => { visibleColumnsRef.current = visibleColumns; }, [visibleColumns]);

  // Drag Refs
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Infinite Scroll Ref
  const loadMoreObserver = useRef<IntersectionObserver | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

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
    setFilters(prev => ({ ...prev, from: 0 })); // Reset pagination on config change
  };

  // Helper to save column state
  const saveColumnState = (cols: string[], widths: Record<string, number>) => {
      try {
          const key = `${COL_SETTINGS_PREFIX}${config.index}`;
          localStorage.setItem(key, JSON.stringify({ columns: cols, widths }));
      } catch (e) {
          console.warn("Failed to save column settings");
      }
  };

  // Load Columns from LocalStorage on Index Change
  useEffect(() => {
      const key = `${COL_SETTINGS_PREFIX}${config.index}`;
      const savedSettings = localStorage.getItem(key);
      
      if (savedSettings) {
          try {
              const parsed = JSON.parse(savedSettings);
              if (parsed.columns && Array.isArray(parsed.columns)) {
                  setVisibleColumns(parsed.columns);
                  setColumnWidths(parsed.widths || {});
                  setColumnsInitialized(true);
                  return;
              }
          } catch (e) {
              console.error("Error parsing saved columns", e);
          }
      }
      // If no saved settings, reset to uninitialized so auto-detect logic runs
      setColumnsInitialized(false);
      setVisibleColumns(['_id', '_score']);
      setColumnWidths({});
  }, [config.index]);


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

  // Auto-select valid index when indices change
  useEffect(() => {
    if (indices.length > 0) {
      const isCurrentValid = indices.some(idx => idx.index === config.index);
      if (!isCurrentValid) {
        const firstIndex = indices[0].index;
        if (config.index !== firstIndex) {
            handleSaveConfig({ ...config, index: firstIndex });
        }
      }
    }
  }, [indices, config.index]);

  // Fetch Mapping
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
    if (!config.useDemoMode && (indicesError || loadingIndices)) {
        return; 
    }

    setLoading(true);
    setError(null);
    try {
      const response = await OpenSearchService.search(config, filters);
      
      setData(prevData => {
         if (filters.from === 0) return response;
         if (prevData) {
             return {
                 ...response,
                 hits: {
                     ...response.hits,
                     hits: [...prevData.hits.hits, ...response.hits.hits]
                 }
             };
         }
         return response;
      });

    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [config, filters, indicesError, loadingIndices]);

  // Initialize columns based on the first document if NOT already initialized from storage
  useEffect(() => {
    if (!columnsInitialized && data && data.hits.hits.length > 0) {
        const firstDoc = data.hits.hits[0];
        if (firstDoc && firstDoc._source) {
            const keys = Object.keys(firstDoc._source);
            const initialCols = ['_id', '_score', ...keys.slice(0, 8)];
            
            const initialWidths: Record<string, number> = {};
            initialCols.forEach(col => {
                initialWidths[col] = col === '_id' ? 150 : 200;
            });
            
            setVisibleColumns(initialCols);
            setColumnWidths(initialWidths);
            setColumnsInitialized(true);
            saveColumnState(initialCols, initialWidths);
        }
    }
  }, [data, columnsInitialized, config.index]);

  // Debounced fetch
  useEffect(() => {
    const timer = setTimeout(() => {
        fetchData();
    }, 400); 
    return () => clearTimeout(timer);
  }, [fetchData]);

  // Infinite Scroll Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
        (entries) => {
            if (entries[0].isIntersecting && !loading && data) {
                if (data.hits.hits.length < data.hits.total.value) {
                    setFilters(prev => ({ ...prev, from: prev.from + prev.size }));
                }
            }
        },
        { threshold: 0.1, rootMargin: '200px' }
    );

    loadMoreObserver.current = observer;
    
    if (loadMoreTriggerRef.current) {
        observer.observe(loadMoreTriggerRef.current);
    }

    return () => observer.disconnect();
  }, [loading, data]);

  const toggleGeoFilter = () => {
    setFilters(prev => ({
      ...prev,
      geo: { ...prev.geo, enabled: !prev.geo.enabled },
      from: 0 
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
      const newCols = visibleColumns.includes(col) 
          ? visibleColumns.filter(c => c !== col) 
          : [...visibleColumns, col];
      
      setVisibleColumns(newCols);
      
      // Initialize width if new
      if (!columnWidths[col]) {
          const newWidths = { ...columnWidths, [col]: 200 };
          setColumnWidths(newWidths);
          saveColumnState(newCols, newWidths);
      } else {
          saveColumnState(newCols, columnWidths);
      }
  };

  // --- Column Drag & Drop Logic ---
  const handleDragStart = (e: React.DragEvent<HTMLTableHeaderCellElement>, index: number) => {
      dragItem.current = index;
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnter = (e: React.DragEvent<HTMLTableHeaderCellElement>, index: number) => {
     dragOverItem.current = index;
  };

  const handleDragEnd = () => {
      const dragIndex = dragItem.current;
      const dropIndex = dragOverItem.current;

      if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex) {
          const newCols = [...visibleColumns];
          const draggedCol = newCols[dragIndex];
          newCols.splice(dragIndex, 1);
          newCols.splice(dropIndex, 0, draggedCol);
          setVisibleColumns(newCols);
          saveColumnState(newCols, columnWidths);
      }
      
      dragItem.current = null;
      dragOverItem.current = null;
  };

  // --- Column Resize Logic ---
  const startResize = (e: React.MouseEvent, col: string) => {
      e.preventDefault();
      e.stopPropagation();
      
      const startXCoord = e.pageX;
      const startWidthVal = columnWidths[col] || 200;
      let currentWidth = startWidthVal;

      const onMouseMove = (moveEvent: MouseEvent) => {
          const diff = moveEvent.pageX - startXCoord;
          currentWidth = Math.max(50, startWidthVal + diff); // Min width 50px
          
          setColumnWidths(prev => ({
              ...prev,
              [col]: currentWidth
          }));
      };

      const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          document.body.style.cursor = 'default';
          
          // Save the final width for persistence
          const finalWidths = {
              ...columnWidthsRef.current,
              [col]: currentWidth
          };
          saveColumnState(visibleColumnsRef.current, finalWidths);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'col-resize';
  };

  const renderCell = (hit: OpenSearchHit<DocumentSource>, col: string) => {
      if (col === '_id') return <span className="font-mono text-gray-500 truncate block" title={hit._id}>{hit._id}</span>;
      if (col === '_score') return <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-xs font-medium">{hit._score?.toFixed(2)}</span>;
      if (col === '_index') return hit._index;

      const val = getNestedValue(hit._source, col);
      
      if (val === null || val === undefined) return <span className="text-gray-300">-</span>;
      
      if (Array.isArray(val)) {
         if (val.every(v => typeof v !== 'object' || v === null)) {
             return <span className="text-gray-700 text-sm truncate block" title={val.join(', ')}>{val.join(', ')}</span>;
         }
         return <span className="text-xs font-mono text-gray-400 block truncate">{JSON.stringify(val)}</span>;
      }

      if (typeof val === 'object') return <span className="text-xs font-mono text-gray-400 block truncate">{JSON.stringify(val)}</span>;
      return <span className="text-gray-700 text-sm block truncate" title={String(val)}>{String(val)}</span>;
  };
  
  const filteredFields = availableFields.filter(f => f.path.toLowerCase().includes(columnSearch.toLowerCase()));

  const totalLoaded = data?.hits.hits.length || 0;
  const totalAvailable = data?.hits.total.value || 0;

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
              onClick={() => { setFilters(prev => ({ ...prev, from: 0 })); fetchData(); }}
              className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all duration-200"
              title="Refresh Data"
            >
              <RefreshCw size={20} className={loading && totalLoaded === 0 ? 'animate-spin' : ''} />
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
          <div className="bg-white z-40 flex flex-col shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
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
                        onClick={() => {
                            setIsColumnSelectorOpen(!isColumnSelectorOpen);
                            if (!isColumnSelectorOpen) setColumnSearch(''); // Reset search on open
                        }}
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
                        <div className="absolute right-0 top-full mt-2 w-[600px] bg-white rounded-2xl shadow-xl border border-gray-100 ring-1 ring-black/5 z-50 animate-in slide-in-from-top-2 duration-200 flex flex-col max-h-[500px]">
                            <div className="p-3 border-b border-gray-50">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-semibold text-xs text-gray-400 uppercase tracking-wider">Visible Columns</span>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => {
                                                const allCols = ['_id', '_score', ...availableFields.map(f => f.path)];
                                                setVisibleColumns(allCols);
                                                saveColumnState(allCols, columnWidths);
                                            }}
                                            className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors px-2 py-1 hover:bg-blue-50 rounded"
                                        >
                                            All
                                        </button>
                                        <button 
                                            onClick={() => {
                                                setVisibleColumns([]);
                                                saveColumnState([], columnWidths);
                                            }}
                                            className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors px-2 py-1 hover:bg-gray-50 rounded"
                                        >
                                            None
                                        </button>
                                    </div>
                                </div>
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                    <input 
                                        type="text"
                                        value={columnSearch}
                                        onChange={(e) => setColumnSearch(e.target.value)}
                                        placeholder="Find field..."
                                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500/50 focus:bg-white transition-all"
                                        autoFocus
                                    />
                                    {columnSearch && (
                                        <button 
                                            onClick={() => setColumnSearch('')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="overflow-y-auto flex-1 p-2 space-y-0.5 custom-scrollbar grid grid-cols-2 gap-x-2 content-start">
                                <label className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={visibleColumns.includes('_id')} 
                                        onChange={() => toggleColumn('_id')} 
                                        className="rounded text-blue-600 focus:ring-blue-500 border-gray-300 w-4 h-4 shrink-0" 
                                    />
                                    <span className="text-sm text-gray-700 font-medium">ID</span>
                                </label>
                                <label className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={visibleColumns.includes('_score')} 
                                        onChange={() => toggleColumn('_score')} 
                                        className="rounded text-blue-600 focus:ring-blue-500 border-gray-300 w-4 h-4 shrink-0" 
                                    />
                                    <span className="text-sm text-gray-700 font-medium">Score</span>
                                </label>
                                {filteredFields.map(field => (
                                    <label key={field.path} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                                        <input 
                                            type="checkbox" 
                                            checked={visibleColumns.includes(field.path)} 
                                            onChange={() => toggleColumn(field.path)} 
                                            className="rounded text-blue-600 focus:ring-blue-500 border-gray-300 w-4 h-4 shrink-0" 
                                        />
                                        <span className="text-sm text-gray-700 truncate font-medium" title={field.path}>
                                            {field.path} <span className="text-xs text-gray-400 font-normal ml-1">({field.type})</span>
                                        </span>
                                    </label>
                                ))}
                                {filteredFields.length === 0 && availableFields.length > 0 && (
                                    <div className="col-span-2 px-3 py-4 text-center text-xs text-gray-400 italic">
                                        No fields match "{columnSearch}"
                                    </div>
                                )}
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
                  {/* Geo inputs retained */}
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
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white sticky top-0 z-20">
                <div className="text-sm text-gray-500">
                  {loading && totalLoaded === 0 ? (
                      <span className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                          Searching...
                      </span>
                  ) : (
                    <>Found <span className="font-bold text-gray-900">{totalAvailable.toLocaleString() ?? 0}</span> results</>
                  )}
                </div>
                
                <div className="text-xs font-medium text-gray-400">
                    Showing {totalLoaded.toLocaleString()} of {totalAvailable.toLocaleString()}
                </div>
              </div>

              {/* Table / List */}
              <div className="flex-1 overflow-auto bg-white relative">
                {loading && !data && totalLoaded === 0 ? (
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
                  <>
                    <table className="w-max min-w-full text-left border-collapse table-fixed">
                      <thead className="bg-gray-50/95 backdrop-blur text-gray-500 text-[11px] uppercase tracking-wider font-bold sticky top-0 z-10 border-b border-gray-100 shadow-sm">
                        <tr>
                          {visibleColumns.map((col, index) => (
                            <th 
                                key={col} 
                                className="relative px-3 py-4 group select-none hover:bg-gray-100/50 transition-colors"
                                style={{ width: columnWidths[col] || 200 }}
                                draggable
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragEnter={(e) => handleDragEnter(e, index)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => e.preventDefault()}
                            >
                              <div className="flex items-center gap-2">
                                <span className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
                                    <GripVertical size={14} />
                                </span>
                                <span className="truncate" title={col}>{col.replace(/_/g, '')}</span>
                              </div>
                              
                              {/* Resize Handle */}
                              <div 
                                className="absolute right-[-12px] top-0 bottom-0 w-6 cursor-col-resize z-50 flex justify-center group-hover:opacity-100 hover:opacity-100"
                                onMouseDown={(e) => startResize(e, col)}
                                onClick={(e) => e.stopPropagation()}
                              >
                                  <div className="w-[1px] h-full bg-blue-300 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                              </div>
                            </th>
                          ))}
                          <th className="px-6 py-4 text-right w-24 sticky right-0 bg-gray-50/95 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {data?.hits.hits.map((hit) => (
                          <tr key={hit._id} className="hover:bg-blue-50/30 transition-colors group">
                            {visibleColumns.map(col => (
                              <td key={`${hit._id}-${col}`} className="px-3 py-4 overflow-hidden border-r border-transparent hover:border-gray-100" style={{ width: columnWidths[col] || 200 }}>
                                {renderCell(hit, col)}
                              </td>
                            ))}
                            <td className="px-6 py-4 text-right sticky right-0 bg-white group-hover:bg-blue-50/30 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
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
                    
                    {/* Infinite Scroll Trigger & Loading State */}
                    {totalLoaded < totalAvailable && (
                        <div ref={loadMoreTriggerRef} className="py-8 flex justify-center w-full">
                            {loading ? (
                                <div className="flex items-center gap-2 text-sm text-gray-400 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100">
                                    <Loader2 className="animate-spin text-blue-500" size={16} />
                                    <span>Loading more results...</span>
                                </div>
                            ) : (
                                <div className="h-4 w-full"></div>
                            )}
                        </div>
                    )}
                  </>
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