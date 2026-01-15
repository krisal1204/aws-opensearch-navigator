import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Filter, Check, ChevronDown } from 'lucide-react';
import { FieldDefinition, FieldFilter, FilterOperator } from '../types';

interface FilterBuilderProps {
  fields: FieldDefinition[];
  activeFilters: FieldFilter[];
  onAddFilter: (filter: FieldFilter) => void;
  onRemoveFilter: (id: string) => void;
}

const OPERATORS: { value: FilterOperator; label: string; short: string }[] = [
  { value: 'eq', label: 'Equals', short: '=' },
  { value: 'neq', label: 'Not Equals', short: '!=' },
  { value: 'contains', label: 'Contains', short: 'has' },
  { value: 'gt', label: 'Greater Than', short: '>' },
  { value: 'gte', label: 'Greater/Equal', short: '>=' },
  { value: 'lt', label: 'Less Than', short: '<' },
  { value: 'lte', label: 'Less/Equal', short: '<=' },
  { value: 'exists', label: 'Exists', short: '∃' },
];

export const FilterBuilder: React.FC<FilterBuilderProps> = ({ fields, activeFilters, onAddFilter, onRemoveFilter }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newFilter, setNewFilter] = useState<Partial<FieldFilter>>({
    operator: 'eq',
    value: ''
  });
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(event.target as Node)) {
        setIsAdding(false);
      }
    };
    if (isAdding) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAdding]);

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

  const getOperatorInfo = (op: FilterOperator) => OPERATORS.find(o => o.value === op) || { label: op, short: op };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Empty State */}
        {activeFilters.length === 0 && !isAdding && (
          <div className="text-sm text-gray-400 flex items-center gap-2 italic px-2">
             <Filter size={14} />
             <span>No active filters applied</span>
          </div>
        )}

        {/* Active Filters */}
        {activeFilters.map(filter => {
          const opInfo = getOperatorInfo(filter.operator);
          return (
            <div key={filter.id} className="group flex items-center bg-white border border-gray-200 shadow-sm rounded-lg overflow-hidden transition-all hover:border-blue-300 hover:shadow-md">
              <div className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 border-r border-gray-100">
                {filter.field}
              </div>
              <div className="px-2 py-1.5 text-xs font-bold text-blue-500 bg-blue-50/30">
                {opInfo.short}
              </div>
              {filter.operator !== 'exists' && (
                 <div className="px-3 py-1.5 text-xs font-mono text-gray-800 max-w-[150px] truncate">
                   {filter.value}
                 </div>
              )}
              <button 
                onClick={() => onRemoveFilter(filter.id)}
                className="px-2 py-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors border-l border-transparent hover:border-red-100"
                title="Remove filter"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}

        {/* Add Button */}
        {!isAdding ? (
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 font-medium px-3 py-1.5 rounded-lg border border-dashed border-gray-300 hover:border-blue-300 hover:bg-blue-50 transition-all"
          >
            <Plus size={16} />
            <span>Add Filter</span>
          </button>
        ) : (
          <div ref={formRef} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 bg-white border border-blue-200 ring-4 ring-blue-500/10 rounded-xl p-1.5 shadow-lg animate-in fade-in zoom-in-95 duration-200 absolute z-50 mt-2 sm:mt-0 sm:relative w-full sm:w-auto">
            
            {/* Field Select */}
            <div className="relative group w-full sm:w-auto">
              <select
                className="w-full sm:w-40 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none cursor-pointer"
                value={newFilter.field || ''}
                onChange={e => setNewFilter({ ...newFilter, field: e.target.value })}
                autoFocus
              >
                <option value="" disabled>Field</option>
                {fields.map(f => (
                  <option key={f.path} value={f.path}>{f.path}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
            </div>

            {/* Operator Select */}
            <div className="relative group w-full sm:w-auto">
              <select
                className="w-full sm:w-32 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none cursor-pointer font-medium text-gray-700"
                value={newFilter.operator}
                onChange={e => setNewFilter({ ...newFilter, operator: e.target.value as FilterOperator })}
              >
                {OPERATORS.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
               <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
            </div>

            {/* Value Input */}
            {newFilter.operator !== 'exists' && (
               <input 
                  type="text" 
                  placeholder="Value..."
                  className="w-full sm:w-48 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  value={newFilter.value}
                  onChange={e => setNewFilter({ ...newFilter, value: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleAddField()}
               />
            )}

            {/* Actions */}
            <div className="flex items-center gap-1 w-full sm:w-auto justify-end">
                <button 
                  onClick={handleAddField}
                  disabled={!newFilter.field}
                  className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors shadow-sm"
                  title="Apply Filter"
                >
                  <Check size={16} />
                </button>
                <button 
                  onClick={() => setIsAdding(false)}
                  className="bg-gray-100 text-gray-500 p-2 rounded-lg hover:bg-gray-200 hover:text-gray-700 transition-colors"
                  title="Cancel"
                >
                  <X size={16} />
                </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};