import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Users, BookOpen, GraduationCap, UserMinus, Search } from 'lucide-react';
import {
  listDisciplines, createDiscipline, updateDiscipline, deleteDiscipline,
  addGroupToDiscipline, removeGroupFromDiscipline,
  addInstructorToDiscipline, removeInstructorFromDiscipline,
} from '../../api/disciplines';
import { listGroups } from '../../api/groups';
import { listUsers } from '../../api/users';
import Modal from '../../components/Modal';
import ConfirmModal from '../../components/ConfirmModal';
import { CardSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';

const DISC_COLORS = [
  'from-indigo-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-600',
];

export default function DisciplinesPage() {
  const [disciplines, setDisciplines] = useState([]);
  const [groups, setGroups] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [form, setForm] = useState({ name: '', short_name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function load() {
    try {
      const [discs, grps, instr] = await Promise.all([
        listDisciplines(),
        listGroups(),
        listUsers({ role: 'instructor', page: 1, per_page: 100 }),
      ]);
      setDisciplines(discs);
      setGroups(grps);
      setInstructors(instr.items);
    } catch {
      toast('Помилка завантаження');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!form.name.trim()) { toast('Введіть назву дисципліни'); return; }
    setSaving(true);
    try {
      if (modal.mode === 'create') {
        await createDiscipline({ name: form.name, short_name: form.short_name || null, description: form.description || null });
        toast('Дисципліну створено', 'success');
      } else {
        await updateDiscipline(modal.disc.id, { name: form.name, short_name: form.short_name || null, description: form.description || null });
        toast('Оновлено', 'success');
      }
      setModal(null);
      load();
    } catch (err) {
      toast(err.response?.data?.detail || 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(disc) {
    try {
      await deleteDiscipline(disc.id);
      toast('Видалено', 'success');
      setConfirmDel(null);
      load();
    } catch (err) {
      toast(err.response?.data?.detail || 'Помилка видалення');
    }
  }

  async function toggleGroup(disc, groupId) {
    const assigned = disc.group_ids.includes(groupId);
    try {
      if (assigned) await removeGroupFromDiscipline(disc.id, groupId);
      else await addGroupToDiscipline(disc.id, groupId);
      load();
    } catch (err) {
      toast(err.response?.data?.detail || 'Помилка');
    }
  }

  const [instrSearch, setInstrSearch] = useState('');

  const modalDisc = modal?.disc ? disciplines.find(d => d.id === modal.disc.id) ?? modal.disc : null;

  async function handleAssignInstructor(instrId, discId) {
    try {
      if (discId) {
        await addInstructorToDiscipline(discId, instrId);
        toast('Викладача призначено', 'success');
      } else {
        await removeInstructorFromDiscipline(modalDisc.id, instrId);
        toast('Викладача відкріплено');
      }
      await load();
    } catch (err) {
      toast(err.response?.data?.detail || 'Помилка');
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Дисципліни</h1>
          <p className="text-slate-500 text-sm mt-0.5">Керування навчальними дисциплінами та доступом</p>
        </div>
        <button
          onClick={() => { setForm({ name: '', short_name: '', description: '' }); setModal({ mode: 'create' }); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all shadow-sm shadow-indigo-200"
        >
          <Plus size={16} />
          Нова дисципліна
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : disciplines.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <BookOpen size={28} className="text-slate-300" />
          </div>
          <p className="text-slate-400 font-medium">Дисциплін ще немає</p>
          <p className="text-slate-300 text-sm mt-1">Натисніть «Нова дисципліна» щоб розпочати</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {disciplines.map((disc, idx) => {
            const assignedGroups = groups.filter(g => disc.group_ids?.includes(g.id));
            const assignedInstr = instructors.filter(i => i.discipline_ids?.includes(disc.id));
            const gradient = DISC_COLORS[idx % DISC_COLORS.length];
            return (
              <div key={disc.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden group hover:shadow-md transition-shadow">
                {/* Color bar */}
                <div className={`h-1.5 bg-gradient-to-r ${gradient}`} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-lg shrink-0`}>
                      {disc.name[0]}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setForm({ name: disc.name, short_name: disc.short_name ?? '', description: disc.description ?? '' }); setModal({ mode: 'edit', disc }); }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setConfirmDel(disc)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <h2 className="font-semibold text-slate-800 text-sm leading-snug">
                    {disc.short_name && (
                      <span className="inline-block mr-2 text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 align-middle tracking-wide">{disc.short_name}</span>
                    )}
                    {disc.name}
                  </h2>
                  {disc.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{disc.description}</p>
                  )}

                  <div className="mt-4 space-y-2 text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                      <GraduationCap size={13} className="text-slate-400 shrink-0" />
                      <span>
                        {assignedGroups.length > 0
                          ? assignedGroups.map(g => g.name).join(', ')
                          : <span className="text-slate-300 italic">групи не призначено</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users size={13} className="text-slate-400 shrink-0" />
                      <span>
                        {assignedInstr.length > 0
                          ? assignedInstr.map(i => i.full_name.split(' ')[0] + ' ' + (i.full_name.split(' ')[1]?.[0] ?? '') + '.').join(', ')
                          : <span className="text-slate-300 italic">викладача не призначено</span>}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => setModal({ mode: 'groups', disc })}
                      className="flex-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg py-2 transition-colors"
                    >
                      Групи
                    </button>
                    <button
                      onClick={() => { setInstrSearch(''); setModal({ mode: 'instructors', disc }); }}
                      className="flex-1 text-xs font-medium text-violet-600 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-lg py-2 transition-colors"
                    >
                      Викладачі
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit modal */}
      {modal && modal.mode !== 'groups' && (
        <Modal
          title={modal.mode === 'create' ? 'Нова дисципліна' : 'Редагувати дисципліну'}
          onClose={() => setModal(null)}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Назва <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                autoFocus
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Абревіатура</label>
              <input
                type="text"
                value={form.short_name}
                maxLength={20}
                placeholder="МТ, ЗІ, ОС..."
                onChange={e => setForm(f => ({ ...f, short_name: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Опис</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-60 transition-colors"
              >
                {saving ? 'Збереження...' : 'Зберегти'}
              </button>
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2.5 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Скасувати
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Groups modal */}
      {modal?.mode === 'groups' && modalDisc && (
        <Modal title={`Групи — ${modalDisc.name}`} onClose={() => { setModal(null); load(); }}>
          <div className="space-y-1">
            {groups.length === 0 ? (
              <p className="text-slate-400 text-sm">Груп ще немає</p>
            ) : (
              groups.map(g => {
                const checked = modalDisc.group_ids?.includes(g.id);
                return (
                  <label key={g.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 cursor-pointer group">
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 group-hover:border-indigo-400'}`}>
                      {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <input type="checkbox" checked={checked} onChange={() => toggleGroup(modalDisc, g.id)} className="sr-only" />
                    <span className="text-sm text-slate-700 font-medium">{g.name}</span>
                  </label>
                );
              })
            )}
          </div>
        </Modal>
      )}

      {/* Instructors modal */}
      {modal?.mode === 'instructors' && modalDisc && (
        <Modal title={`Викладачі — ${modalDisc.name}`} onClose={() => { setModal(null); load(); }} size="wide">
          <div className="space-y-4">
            {/* Current instructors */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Призначені</p>
              {instructors.filter(i => i.discipline_id === modalDisc.id).length === 0 ? (
                <p className="text-sm text-slate-400 italic py-2">Викладачів не призначено</p>
              ) : (
                <div className="space-y-1">
                  {instructors.filter(i => i.discipline_id === modalDisc.id).map(i => (
                    <div key={i.id} className="flex items-center justify-between bg-violet-50 rounded-xl px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-xs font-semibold text-violet-600">
                          {i.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">{i.full_name}</p>
                          <p className="text-xs text-slate-400 font-mono">{i.login}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleAssignInstructor(i.id, null)}
                        title="Відкріпити"
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-rose-500 transition-colors"
                      >
                        <UserMinus size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Available instructors */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Доступні</p>
              <div className="relative mb-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  value={instrSearch}
                  onChange={e => setInstrSearch(e.target.value)}
                  placeholder="Пошук за ПІБ..."
                  className="w-full pl-8 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {(() => {
                const available = instructors.filter(i =>
                  !i.discipline_ids?.length &&
                  (!instrSearch || i.full_name.toLowerCase().includes(instrSearch.toLowerCase()))
                );
                return available.length === 0 ? (
                  <p className="text-sm text-slate-400 italic py-2 text-center">
                    {instructors.filter(i => !i.discipline_ids?.length).length === 0
                      ? 'Всі викладачі вже призначені'
                      : 'Нічого не знайдено'}
                  </p>
                ) : (
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {available.map(i => (
                      <div key={i.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600">
                            {i.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{i.full_name}</p>
                            <p className="text-xs text-slate-400 font-mono">{i.login}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleAssignInstructor(i.id, modalDisc.id)}
                          className="flex items-center gap-1.5 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Plus size={12} /> Додати
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm delete */}
      {confirmDel && (
        <ConfirmModal
          title="Видалити дисципліну?"
          message={`«${confirmDel.name}» буде видалено разом з усіма прив'язками.`}
          onConfirm={() => handleDelete(confirmDel)}
          onCancel={() => setConfirmDel(null)}
          confirmLabel="Видалити"
        />
      )}
    </div>
  );
}
