import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, Pencil, Trash2, GripVertical, ArrowLeft, Save, AlertCircle,
} from 'lucide-react';
import {
  listQuestions, createQuestion, updateQuestion, deleteQuestion, patchDifficulty,
} from '../../api/questions';
import Modal from '../../components/Modal';
import ConfirmModal from '../../components/ConfirmModal';
import { useToast } from '../../components/Toast';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newOption() { return { id: crypto.randomUUID(), text: '' }; }
function newMatchItem() { return { id: crypto.randomUUID(), text: '' }; }

function emptyForm(order = 0) {
  return {
    type: 'single_choice', text: '', options: [newOption(), newOption()],
    correctSingle: '', correctMultiple: [], keywords: '', min_match: 1,
    matchLeft: [newMatchItem(), newMatchItem()],
    matchRight: [newMatchItem(), newMatchItem()],
    matchPairs: [],
    difficulty_level: '', order,
  };
}
function buildPayload(f) {
  const base = { type: f.type, text: f.text, order: f.order, difficulty_level: f.difficulty_level || null };
  if (f.type === 'single_choice') return { ...base, options: f.options.map(o => ({ id: o.id, text: o.text })), correct_answer: { option_id: f.correctSingle } };
  if (f.type === 'multiple_choice') return { ...base, options: f.options.map(o => ({ id: o.id, text: o.text })), correct_answer: { option_ids: f.correctMultiple } };
  if (f.type === 'matching') return {
    ...base,
    options: { left: f.matchLeft.map(i => ({ id: i.id, text: i.text })), right: f.matchRight.map(i => ({ id: i.id, text: i.text })) },
    correct_answer: { pairs: f.matchPairs },
  };
  const kws = f.keywords.split(',').map(k => k.trim()).filter(Boolean);
  return { ...base, options: null, correct_answer: { keywords: kws, min_match: Number(f.min_match) } };
}
function formFromQuestion(q) {
  if (q.type === 'matching') {
    const opts = q.options || {};
    return {
      type: 'matching', text: q.text,
      options: [], correctSingle: '', correctMultiple: [], keywords: '', min_match: 1,
      matchLeft: (opts.left || []).map(i => ({ id: i.id, text: i.text })),
      matchRight: (opts.right || []).map(i => ({ id: i.id, text: i.text })),
      matchPairs: q.correct_answer?.pairs ?? [],
      difficulty_level: q.difficulty_level ?? '', order: q.order,
    };
  }
  const opts = q.options || [];
  return {
    type: q.type, text: q.text,
    options: opts.length ? opts : [newOption(), newOption()],
    correctSingle: q.correct_answer?.option_id ?? '',
    correctMultiple: q.correct_answer?.option_ids ?? [],
    keywords: (q.correct_answer?.keywords ?? []).join(', '),
    min_match: q.correct_answer?.min_match ?? 1,
    matchLeft: [newMatchItem(), newMatchItem()],
    matchRight: [newMatchItem(), newMatchItem()],
    matchPairs: [],
    difficulty_level: q.difficulty_level ?? '', order: q.order,
  };
}

const DIFF_MAP = { easy: 'Легке', medium: 'Середнє', hard: 'Складне' };
const DIFF_CLS = {
  easy: 'bg-blue-50 text-blue-700 border-blue-200',
  medium: 'bg-green-50 text-green-700 border-green-200',
  hard: 'bg-red-50 text-red-700 border-red-200',
};
const TYPE_MAP = { single_choice: 'Один варіант', multiple_choice: 'Кілька', open_answer: 'Відкрита', matching: 'З\'єднання' };
const TYPE_CLS = { single_choice: 'bg-blue-50 text-blue-700', multiple_choice: 'bg-violet-50 text-violet-700', open_answer: 'bg-slate-100 text-slate-600', matching: 'bg-orange-50 text-orange-700' };

const inputCls = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all";

// ---------------------------------------------------------------------------
// Sortable row
// ---------------------------------------------------------------------------

function SortableRow({ q, idx, onEdit, onDelete, onDifficultyChange }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: q.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const [diffEdit, setDiffEdit] = useState(false);
  const [diffVal, setDiffVal] = useState(
    q.irt_difficulty_override !== null && q.irt_difficulty_override !== undefined
      ? String(q.irt_difficulty_override) : ''
  );

  return (
    <div ref={setNodeRef} style={style}
      className="bg-white border border-slate-100 rounded-2xl p-4 flex gap-3 items-start group hover:border-indigo-200 hover:shadow-sm transition-all">
      {/* Drag handle */}
      <button {...attributes} {...listeners}
        className="mt-0.5 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing transition-colors">
        <GripVertical size={18} />
      </button>

      {/* Number */}
      <span className="mt-0.5 w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold flex items-center justify-center shrink-0">{idx + 1}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_CLS[q.type]}`}>
            {TYPE_MAP[q.type]}
          </span>
          {q.difficulty_level && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${DIFF_CLS[q.difficulty_level]}`}>
              {DIFF_MAP[q.difficulty_level]}
            </span>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
            IRT: {q.effective_difficulty?.toFixed(2) ?? '0.00'}
            {q.irt_difficulty_override !== null && q.irt_difficulty_override !== undefined && ' ✎'}
          </span>
        </div>
        <p className="text-sm text-slate-700 line-clamp-2 leading-snug">{q.text}</p>

        {/* Inline difficulty editor */}
        {diffEdit ? (
          <div className="flex items-center gap-2 mt-2">
            <input type="number" step="0.1" value={diffVal}
              onChange={e => setDiffVal(e.target.value)} placeholder="напр. 1.5"
              className="border border-slate-200 rounded-lg px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            <button onClick={() => { onDifficultyChange(q.id, diffVal === '' ? null : Number(diffVal)); setDiffEdit(false); }}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700">Зберегти</button>
            <button onClick={() => setDiffEdit(false)} className="text-xs text-slate-400 hover:text-slate-600">×</button>
          </div>
        ) : (
          <button onClick={() => setDiffEdit(true)} className="text-xs text-slate-400 hover:text-indigo-600 mt-1 transition-colors">
            Змінити IRT складність
          </button>
        )}
      </div>

      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEdit(q)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
          <Pencil size={14} />
        </button>
        <button onClick={() => onDelete(q.id)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question form
// ---------------------------------------------------------------------------

function QuestionForm({ form, setForm, onSave, saving }) {
  function setF(key, val) { setForm(f => ({ ...f, [key]: val })); }
  function addOption() { setF('options', [...form.options, newOption()]); }
  function removeOption(id) {
    setF('options', form.options.filter(o => o.id !== id));
    if (form.correctSingle === id) setF('correctSingle', '');
    setF('correctMultiple', form.correctMultiple.filter(x => x !== id));
  }
  function updateOptionText(id, text) {
    setF('options', form.options.map(o => o.id === id ? { ...o, text } : o));
  }
  function toggleMultiple(id) {
    const cur = form.correctMultiple;
    setF('correctMultiple', cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  }

  // Matching helpers
  function updateMatchItem(side, id, text) {
    setF(side === 'left' ? 'matchLeft' : 'matchRight',
      form[side === 'left' ? 'matchLeft' : 'matchRight'].map(i => i.id === id ? { ...i, text } : i));
  }
  function addMatchItem(side) {
    setF(side === 'left' ? 'matchLeft' : 'matchRight',
      [...form[side === 'left' ? 'matchLeft' : 'matchRight'], newMatchItem()]);
  }
  function removeMatchItem(side, id) {
    setF(side === 'left' ? 'matchLeft' : 'matchRight',
      form[side === 'left' ? 'matchLeft' : 'matchRight'].filter(i => i.id !== id));
    setF('matchPairs', form.matchPairs.filter(p => p.left_id !== id && p.right_id !== id));
  }
  function setPairForLeft(leftId, rightId) {
    const filtered = form.matchPairs.filter(p => p.left_id !== leftId && p.right_id !== rightId);
    if (rightId) setF('matchPairs', [...filtered, { left_id: leftId, right_id: rightId }]);
    else setF('matchPairs', filtered);
  }

  const isChoice = form.type === 'single_choice' || form.type === 'multiple_choice';

  return (
    <div className="space-y-5">
      {/* Type selector */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Тип питання</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: 'single_choice', label: 'Один варіант' },
            { v: 'multiple_choice', label: 'Кілька варіантів' },
            { v: 'open_answer', label: 'Відкрита відповідь' },
            { v: 'matching', label: '🔗 З\'єднання пар' },
          ].map(({ v, label }) => (
            <button key={v} type="button" onClick={() => setF('type', v)}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                form.type === v
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Text */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Текст питання <span className="text-red-500">*</span>
        </label>
        <textarea value={form.text} onChange={e => setF('text', e.target.value)}
          rows={3} required
          className={inputCls + ' resize-none'}
          placeholder="Введіть текст питання..." />
      </div>

      {/* Options */}
      {isChoice && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-700">Варіанти відповідей</label>
            <button type="button" onClick={addOption}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium">
              <Plus size={13} /> Додати варіант
            </button>
          </div>
          <div className="space-y-2">
            {form.options.map(opt => (
              <div key={opt.id} className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center cursor-pointer transition-all ${
                  form.type === 'single_choice'
                    ? form.correctSingle === opt.id ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 hover:border-indigo-400'
                    : form.correctMultiple.includes(opt.id) ? 'rounded-md border-indigo-600 bg-indigo-600' : 'rounded-md border-slate-300 hover:border-indigo-400'
                }`}
                  onClick={() => form.type === 'single_choice' ? setF('correctSingle', opt.id) : toggleMultiple(opt.id)}>
                  {((form.type === 'single_choice' && form.correctSingle === opt.id) ||
                    (form.type === 'multiple_choice' && form.correctMultiple.includes(opt.id))) && (
                    <div className="w-2 h-2 bg-white rounded-full" />
                  )}
                </div>
                <input type="text" value={opt.text} onChange={e => updateOptionText(opt.id, e.target.value)}
                  placeholder="Текст варіанту"
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                {form.options.length > 2 && (
                  <button type="button" onClick={() => removeOption(opt.id)}
                    className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">Клікніть на кружечок/квадрат щоб позначити правильну відповідь</p>
        </div>
      )}

      {/* Open answer */}
      {form.type === 'open_answer' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Ключові слова (через кому)</label>
            <input type="text" value={form.keywords} onChange={e => setF('keywords', e.target.value)}
              placeholder="слово1, слово2, слово3"
              className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Мінімум збігів</label>
            <input type="number" min={1} value={form.min_match} onChange={e => setF('min_match', e.target.value)}
              className="w-28 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
      )}

      {/* Matching */}
      {form.type === 'matching' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-400">Додайте елементи ліворуч і праворуч, потім для кожного лівого елемента оберіть пару.</p>
          <div className="grid grid-cols-2 gap-4">
            {/* Left column */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700">Ліва колонка</label>
                <button type="button" onClick={() => addMatchItem('left')}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
                  <Plus size={12} /> Додати
                </button>
              </div>
              <div className="space-y-2">
                {form.matchLeft.map(item => (
                  <div key={item.id} className="flex items-center gap-1">
                    <input value={item.text} onChange={e => updateMatchItem('left', item.id, e.target.value)}
                      placeholder="Елемент..."
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    {form.matchLeft.length > 2 && (
                      <button type="button" onClick={() => removeMatchItem('left', item.id)}
                        className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-500 rounded-lg">×</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {/* Right column */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700">Права колонка</label>
                <button type="button" onClick={() => addMatchItem('right')}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
                  <Plus size={12} /> Додати
                </button>
              </div>
              <div className="space-y-2">
                {form.matchRight.map(item => (
                  <div key={item.id} className="flex items-center gap-1">
                    <input value={item.text} onChange={e => updateMatchItem('right', item.id, e.target.value)}
                      placeholder="Відповідь..."
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    {form.matchRight.length > 2 && (
                      <button type="button" onClick={() => removeMatchItem('right', item.id)}
                        className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-500 rounded-lg">×</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Correct pairs */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Правильні пари</label>
            <div className="space-y-2">
              {form.matchLeft.map(left => {
                const pairedRightId = form.matchPairs.find(p => p.left_id === left.id)?.right_id || '';
                return (
                  <div key={left.id} className="flex items-center gap-2 text-sm">
                    <span className="w-36 truncate px-2 py-1.5 bg-orange-50 border border-orange-200 rounded-lg text-orange-800 text-xs font-medium">
                      {left.text || '(порожньо)'}
                    </span>
                    <span className="text-slate-400 text-xs">→</span>
                    <select value={pairedRightId}
                      onChange={e => setPairForLeft(left.id, e.target.value)}
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      <option value="">— не вказано —</option>
                      {form.matchRight.map(right => (
                        <option key={right.id} value={right.id}>{right.text || '(порожньо)'}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Difficulty */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Рівень складності</label>
        <div className="flex gap-2">
          {[
            { v: '', label: 'Не вказано' },
            { v: 'easy', label: 'Легке' },
            { v: 'medium', label: 'Середнє' },
            { v: 'hard', label: 'Складне' },
          ].map(({ v, label }) => (
            <button key={v} type="button" onClick={() => setF('difficulty_level', v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                form.difficulty_level === v
                  ? v === '' ? 'bg-slate-700 text-white border-slate-700'
                    : v === 'easy' ? 'bg-blue-600 text-white border-blue-600'
                    : v === 'medium' ? 'bg-green-600 text-white border-green-600'
                    : 'bg-red-500 text-white border-red-500'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button type="button" onClick={onSave} disabled={saving}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl disabled:opacity-60 transition-colors">
          <Save size={15} />
          {saving ? 'Збереження...' : 'Зберегти'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function QuestionEditorPage() {
  const { id: testId } = useParams();
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [orderDirty, setOrderDirty] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const toast = useToast();
  const { user } = useAuthStore();
  const base = user?.role === 'admin' ? '/admin' : '/instructor';

  const sensors = useSensors(useSensor(PointerSensor));

  async function load() {
    try {
      setQuestions(await listQuestions(testId));
      setOrderDirty(false);
    } catch {
      toast('Помилка завантаження питань');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [testId]);

  function openAdd() { setForm(emptyForm(questions.length)); setModal({ mode: 'add' }); }
  function openEdit(q) { setForm(formFromQuestion(q)); setModal({ mode: 'edit', questionId: q.id }); }

  async function handleSave() {
    if (!form.text.trim()) { toast('Введіть текст питання'); return; }
    if ((form.type === 'single_choice' || form.type === 'multiple_choice') && form.options.some(o => !o.text.trim())) { toast('Заповніть усі варіанти'); return; }
    if (form.type === 'single_choice' && !form.correctSingle) { toast('Позначте правильну відповідь'); return; }
    if (form.type === 'multiple_choice' && form.correctMultiple.length === 0) { toast('Позначте хоча б одну правильну відповідь'); return; }
    if (form.type === 'matching') {
      if (form.matchLeft.some(i => !i.text.trim()) || form.matchRight.some(i => !i.text.trim())) { toast('Заповніть усі елементи з обох колонок'); return; }
      if (form.matchPairs.length !== form.matchLeft.length) { toast('Вкажіть пару для кожного лівого елемента'); return; }
    }

    setSaving(true);
    try {
      const payload = buildPayload(form);
      if (modal.mode === 'add') {
        await createQuestion(testId, payload);
        toast('Питання додано', 'success');
      } else {
        await updateQuestion(modal.questionId, payload);
        toast('Питання збережено', 'success');
      }
      setModal(null);
      load();
    } catch (err) {
      toast(err.response?.data?.detail || 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(qId) {
    try {
      await deleteQuestion(qId);
      toast('Питання видалено', 'success');
      setConfirmDel(null);
      load();
    } catch (err) {
      toast(err.response?.data?.detail || 'Помилка видалення');
    }
  }

  async function handleDifficultyChange(qId, val) {
    try {
      await patchDifficulty(qId, val);
      toast('Складність оновлено', 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.detail || 'Помилка');
    }
  }

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    setQuestions(qs => {
      const oldIdx = qs.findIndex(q => q.id === active.id);
      const newIdx = qs.findIndex(q => q.id === over.id);
      return arrayMove(qs, oldIdx, newIdx);
    });
    setOrderDirty(true);
  }

  async function saveOrder() {
    setSavingOrder(true);
    try {
      await Promise.all(questions.map((q, idx) => idx !== q.order ? updateQuestion(q.id, { order: idx }) : Promise.resolve()));
      toast('Порядок збережено', 'success');
      load();
    } catch {
      toast('Помилка збереження порядку');
    } finally {
      setSavingOrder(false);
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to={`${base}/tests`} className="flex items-center gap-1.5 text-slate-400 hover:text-indigo-600 text-sm transition-colors mb-1">
            <ArrowLeft size={14} /> Тести
          </Link>
          <h1 className="text-2xl font-bold text-slate-800">Редактор питань</h1>
          <p className="text-slate-400 text-sm mt-0.5">Перетягніть рядки для зміни порядку</p>
        </div>
        <div className="flex gap-3">
          {orderDirty && (
            <button onClick={saveOrder} disabled={savingOrder}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors">
              <Save size={15} />
              {savingOrder ? 'Збереження...' : 'Зберегти порядок'}
            </button>
          )}
          <button onClick={openAdd}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all shadow-sm shadow-indigo-200">
            <Plus size={16} />
            Додати питання
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {!loading && questions.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-5 text-sm items-center">
          <span className="text-slate-500">Всього: <strong className="text-slate-700">{questions.length}</strong></span>
          {['single_choice', 'multiple_choice', 'open_answer', 'matching'].map(t => {
            const count = questions.filter(q => q.type === t).length;
            return count > 0 && (
              <span key={t} className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${TYPE_CLS[t]}`}>
                {TYPE_MAP[t]}: {count}
              </span>
            );
          })}
          <span className="w-px h-4 bg-slate-200 mx-1" />
          {['easy', 'medium', 'hard'].map(d => {
            const count = questions.filter(q => q.difficulty_level === d).length;
            return count > 0 && (
              <span key={d} className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${DIFF_CLS[d]}`}>
                {DIFF_MAP[d]}: {count}
              </span>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-3 text-slate-400 py-20 justify-center">
          <span className="w-6 h-6 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
          Завантаження...
        </div>
      ) : questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
          <AlertCircle size={32} className="text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium">Питань ще немає</p>
          <button onClick={openAdd} className="mt-3 text-sm text-indigo-600 hover:underline font-medium">
            Додати перше питання →
          </button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={questions.map(q => q.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {questions.map((q, idx) => (
                <SortableRow key={q.id} q={q} idx={idx}
                  onEdit={openEdit}
                  onDelete={(id) => setConfirmDel(id)}
                  onDifficultyChange={handleDifficultyChange}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {modal && (
        <Modal title={modal.mode === 'add' ? 'Нове питання' : 'Редагувати питання'} onClose={() => setModal(null)} wide>
          <QuestionForm form={form} setForm={setForm} onSave={handleSave} saving={saving} />
        </Modal>
      )}

      {confirmDel && (
        <ConfirmModal
          title="Видалити питання?"
          message="Питання буде видалено без можливості відновлення."
          onConfirm={() => handleDelete(confirmDel)}
          onCancel={() => setConfirmDel(null)}
          confirmLabel="Видалити"
        />
      )}
    </div>
  );
}
