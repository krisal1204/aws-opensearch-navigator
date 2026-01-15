import React, { useState } from 'react';
import { Plus, X, Filter } from 'lucide-react';
import { FieldDefinition, FieldFilter, FilterOperator } from '../types';

interface FilterBuilderProps {
  fields: FieldDefinition[];
  activeFilters: FieldFilter[];
  onAddFilter: (filter: FieldFilter) => void;
  onRemoveFilter: (id: string) => void;
}

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'eq', label: 'Equals (=)' },
  { value: 'neq', label: 'Not Equals (!=)' },
  { value: 'contains', label: 'Contains' },
  { value: 'gt', label: 'Greater Than (>)' },
  { value: 'gte', label: 'Greater/Equal (>=)' },
  { value: 'lt', label: 'Less Than (<)' },
  { value: 'lte', label: 'Less/Equal (<=)' },
  { value: 'exists', label: 'Exists' },
];

export const FilterBuilder: React.FC<FilterBuilderProps> = ({ fields, activeFilters, onAddFilter, onRemoveFilter }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newFilter, setNewFilter] = useState<Partial<FieldFilter>>({
    operator: 'eq',
    value: ''
  });

  const handleAddField = () => {
    if (newFilter.field && newFilter.operator) {
      onAddFilter({
        id: crypto.randomUUID(),
        field: newFilter.field,
        operator: newFilter.operator,
        value: newFilter.value || ''
      } as FieldFilter);
      setNewFilter({ operator: 'eq', value: '' });
      setIsAdding(false);
    }
  };

  const getOperatorLabel = (op: FilterOperator) => OPERATORS.find(o => o.value === op)?.label || op;

  return (
    <div className="flex flex-col gap-3">
      {/* Active Filter Chips */}
      <div className="flex flex-wrap gap-2 items-center">
        {activeFilters.length === 0 && !isAdding && (
           <span className="text-xs text-slate-400 italic flex items-center gap-1">
             <Filter size={12} /> No active filters
           </span>
        )}
        
        {activeFilters.map(filter => (
          <div key={filter.id} className="flex items-center gap-2 bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1 rounded-full text-sm animate-in fade-in zoom-in duration-200">
            <span className="font-semibold">{filter.field}</span>
            <span className="text-blue-500 text-xs uppercase">{filter.operator}</span>
            {filter.operator !== 'exists' && <span className="font-mono">{filter.value}</span>}
            <button 
              onClick={() => onRemoveFilter(filter.id)}
              className="ml-1 hover:bg-blue-200 rounded-full p-0.5 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        {!isAdding ? (
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 text-sm text-accent hover:text-blue-700 font-medium px-2 py-1 hover:bg-slate-50 rounded transition-colors"
          >
            <Plus size={16} /> Add Filter
          </button>
        ) : (
          <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg p-1 shadow-sm animate-in slide-in-from-left-2 duration-200">
            <select
              className="text-sm border-none bg-transparent focus:ring-0 text-slate-700 font-medium cursor-pointer py-1 pl-2 pr-6"
              value={newFilter.field || ''}
              onChange={e => setNewFilter({ ...newFilter, field: e.target.value })}
            >
              <option value="" disabled>Select Field...</option>
              {fields.map(f => (
                <option key={f.path} value={f.path}>{f.path} ({f.type})</option>
              ))}
            </select>

            <div className="w-px h-4 bg-slate-300 mx-1"></div>

            <select
              className="text-sm border-none bg-transparent focus:ring-0 text-slate-600 py-1 pl-2 pr-6 cursor-pointer"
              value={newFilter.operator}
              onChange={e => setNewFilter({ ...newFilter, operator: e.target.value as FilterOperator })}
            >
              {OPERATORS.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>

            {newFilter.operator !== 'exists' && (
              <>
                <div className="w-px h-4 bg-slate-300 mx-1"></div>
                <input 
                  type="text" 
                  placeholder="Value..."
                  className="text-sm border-none bg-transparent focus:ring-0 text-slate-800 placeholder-slate-400 w-32 py-1"
                  value={newFilter.value}
                  onChange={e => setNewFilter({ ...newFilter, value: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleAddField()}
                  autoFocus
                />
              </>
            )}

            <button 
              onClick={handleAddField}
              disabled={!newFilter.field}
              className="bg-accent text-white p-1.5 rounded hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-accent transition-colors ml-1"
            >
              <Plus size={14} />
            </button>
            <button 
              onClick={() => setIsAdding(false)}
              className="text-slate-400 hover:text-slate-600 p-1.5"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};