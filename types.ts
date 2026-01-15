export interface OpenSearchConfig {
  nodes: string[];
  region: string;
  authType: 'profile' | 'manual';
  accessKey: string;
  secretKey: string;
  sessionToken?: string;
  profile?: string;
  index: string;
  useDemoMode: boolean;
  proxyUrl?: string;
}

export interface GeoFilterState {
  enabled: boolean;
  latitude: number;
  longitude: number;
  radius: number;
  unit: 'km' | 'mi';
  geoField: string; // Moved here
}

export type FilterOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'exists';

export interface FieldFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

export interface SearchFilters {
  query: string;
  geo: GeoFilterState;
  fieldFilters: FieldFilter[];
  from: number;
  size: number;
}

export interface FieldDefinition {
  path: string;
  type: string;
}

export interface OpenSearchHit<T = any> {
  _index: string;
  _id: string;
  _score: number;
  _source: T;
}

export interface OpenSearchResponse<T = any> {
  took: number;
  timed_out: boolean;
  hits: {
    total: {
      value: number;
      relation: string;
    };
    max_score: number;
    hits: OpenSearchHit<T>[];
  };
}

// Represents a generic document in our explorer
export interface DocumentSource {
  id?: string;
  name?: string;
  description?: string;
  location?: {
    lat: number;
    lon: number;
  };
  timestamp?: string;
  status?: string;
  [key: string]: any;
}

export interface IndexInfo {
  index: string;
  health: string;
  status: string;
  docsCount: string;
  storeSize: string;
}