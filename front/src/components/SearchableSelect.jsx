import { useEffect, useRef, useState } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';

/**
 * items: [{ id, label, sub? }]   — sub — додатковий текст (назва групи)
 * groups: [{ key, label, items }] — якщо передано, items ігнорується
 */
export default function SearchableSelect({ value, onChange, placeholder = '— Оберіть —', items = [], groups = [], className = '' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const allItems = groups.length
    ? groups.flatMap(g => g.items)
    : items;

  const selected = allItems.find(i => i.id === value);

  const filtered = query.trim()
    ? allItems.filter(i =>
        i.label.toLowerCase().includes(query.toLowerCase()) ||
        (i.sub && i.sub.toLowerCase().includes(query.toLowerCase()))
      )
    : allItems;

  const filteredGroups = groups.length
    ? (query.trim()
        ? [{ key: '__search__', label: '', items: filtered }]
        : groups)
    : null;

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleOpen() {
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleSelect(id) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  function handleClear(e) {
    e.stopPropagation();
    onChange('');
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between gap-2 border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-slate-300 transition-all text-left"
      >
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate text-slate-800 font-medium">{selected.label}</span>
            {selected.sub && (
              <span className="shrink-0 text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">{selected.sub}</span>
            )}
          </span>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
        <span className="flex items-center gap-1 shrink-0">
          {value && (
            <span onClick={handleClear} className="text-slate-300 hover:text-slate-500 transition-colors cursor-pointer">
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
              <Search size={13} className="text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Пошук..."
                className="flex-1 bg-transparent text-sm outline-none text-slate-700 placeholder-slate-400"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {filteredGroups ? (
              filteredGroups.map(g => (
                <div key={g.key}>
                  {g.label && (
                    <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50 sticky top-0">
                      {g.label}
                    </div>
                  )}
                  {g.items.length === 0 ? null : g.items.map(item => (
                    <ItemRow key={item.id} item={item} selected={value === item.id} onSelect={handleSelect} />
                  ))}
                </div>
              ))
            ) : (
              filtered.map(item => (
                <ItemRow key={item.id} item={item} selected={value === item.id} onSelect={handleSelect} />
              ))
            )}
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-slate-400">Нічого не знайдено</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ItemRow({ item, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors ${
        selected ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      <span className="flex-1 truncate font-medium">{item.label}</span>
      {item.sub && (
        <span className="shrink-0 text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">{item.sub}</span>
      )}
    </button>
  );
}
