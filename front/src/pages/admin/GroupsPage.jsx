import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Users, UserMinus, Search, GraduationCap } from 'lucide-react';
import { listGroups, createGroup, updateGroup, deleteGroup, listGroupStudents } from '../../api/groups';
import { listUsers, updateUser } from '../../api/users';
import Modal from '../../components/Modal';
import ConfirmModal from '../../components/ConfirmModal';
import { CardSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';

const GROUP_COLORS = [
  'from-indigo-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-600',
];

export default function GroupsPage() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'create' | 'edit' | 'members' | 'add'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: '' });
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [ungrouped, setUngrouped] = useState([]);
  const [addSearch, setAddSearch] = useState('');
  const toast = useToast();

  async function load() {
    try { setGroups(await listGroups()); }
    catch { toast('Помилка завантаження'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm({ name: '' });
    setSelected(null);
    setModal('create');
  }

  function openEdit(g) {
    setForm({ name: g.name });
    setSelected(g);
    setModal('edit');
  }

  async function openMembers(g) {
    setSelected(g);
    setModal('members');
    setMembersLoading(true);
    try { setMembers(await listGroupStudents(g.id)); }
    catch { toast('Помилка завантаження'); }
    finally { setMembersLoading(false); }
  }

  async function openAdd(g) {
    setSelected(g);
    setAddSearch('');
    setModal('add');
    try {
      const res = await listUsers({ role: 'student', per_page: 200 });
      setUngrouped(res.items.filter(u => !u.group_id && u.is_active));
    } catch { toast('Помилка завантаження'); }
  }

  async function handleSave() {
    if (!form.name.trim()) { toast('Введіть назву групи'); return; }
    setSaving(true);
    try {
      if (modal === 'create') {
        await createGroup({ name: form.name.trim() });
        toast('Групу створено', 'success');
      } else {
        await updateGroup(selected.id, { name: form.name.trim() });
        toast('Збережено', 'success');
      }
      setModal(null);
      load();
    } catch (err) {
      toast(err.response?.data?.detail || 'Помилка збереження');
    } finally { setSaving(false); }
  }

  async function handleDelete(g) {
    try {
      await deleteGroup(g.id);
      toast('Групу видалено');
      load();
    } catch (err) {
      toast(err.response?.data?.detail || 'Помилка видалення');
    }
  }

  async function handleRemoveMember(userId) {
    try {
      await updateUser(userId, { group_id: null });
      setMembers(m => m.filter(u => u.id !== userId));
      setGroups(gs => gs.map(g => g.id === selected.id ? { ...g, student_count: g.student_count - 1 } : g));
      toast('Здобувача відраховано з групи');
    } catch { toast('Помилка'); }
  }

  async function handleAddMember(userId) {
    try {
      await updateUser(userId, { group_id: selected.id });
      setUngrouped(u => u.filter(s => s.id !== userId));
      setGroups(gs => gs.map(g => g.id === selected.id ? { ...g, student_count: g.student_count + 1 } : g));
      toast('Здобувача додано до групи', 'success');
    } catch { toast('Помилка'); }
  }

  const filteredAdd = ungrouped.filter(u =>
    !addSearch || u.full_name.toLowerCase().includes(addSearch.toLowerCase())
  );

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Групи</h1>
          <p className="text-slate-500 text-sm mt-0.5">Навчальні групи та склад здобувачів</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
          <Plus size={15} /> Нова група
        </button>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <GraduationCap size={24} className="text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">Груп ще немає</p>
          <p className="text-slate-400 text-sm mt-1">Натисніть «Нова група» щоб додати першу</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((g, i) => (
            <div key={g.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:border-slate-200 hover:shadow-md transition-all group">
              <div className={`h-2 bg-gradient-to-r ${GROUP_COLORS[i % GROUP_COLORS.length]}`} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${GROUP_COLORS[i % GROUP_COLORS.length]} flex items-center justify-center text-white font-bold text-sm`}>
                      {g.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{g.name}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Users size={11} /> {g.student_count} здобувач{g.student_count !== 1 ? 'ів' : ''}
                      </p>
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => openEdit(g)} title="Перейменувати"
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmDel(g)} title="Видалити"
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-rose-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button onClick={() => openMembers(g)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 px-3 py-2 rounded-xl transition-colors">
                    <Users size={13} /> Склад
                  </button>
                  <button onClick={() => openAdd(g)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-xl transition-colors">
                    <Plus size={13} /> Додати
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal isOpen={modal === 'create' || modal === 'edit'} onClose={() => setModal(null)}
        title={modal === 'create' ? 'Нова група' : 'Перейменувати групу'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Назва групи <span className="text-red-500">*</span></label>
            <input value={form.name} onChange={e => setForm({ name: e.target.value })}
              placeholder="н-р 2024-А або Взвод 1"
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-60 transition-colors">
              {saving ? 'Збереження...' : modal === 'create' ? 'Створити' : 'Зберегти'}
            </button>
            <button onClick={() => setModal(null)}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium py-2.5 rounded-xl transition-colors">
              Скасувати
            </button>
          </div>
        </div>
      </Modal>

      {/* Members modal */}
      <Modal isOpen={modal === 'members'} onClose={() => setModal(null)}
        title={`Склад групи: ${selected?.name}`} size="wide">
        {membersLoading ? (
          <div className="py-6"><CardSkeleton /></div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-slate-400">
            <Users size={32} className="mb-3 opacity-40" />
            <p className="text-sm">Група порожня</p>
            <button onClick={() => openAdd(selected)}
              className="mt-3 text-sm text-indigo-600 hover:underline font-medium">
              Додати здобувачів
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {members.map(u => (
              <div key={u.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-600">
                    {u.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{u.full_name}</p>
                    <p className="text-xs text-slate-400 font-mono">{u.login}</p>
                  </div>
                </div>
                <button onClick={() => handleRemoveMember(u.id)} title="Видалити з групи"
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-rose-500 transition-colors">
                  <UserMinus size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Add members modal */}
      <Modal isOpen={modal === 'add'} onClose={() => setModal(null)}
        title={`Додати до групи: ${selected?.name}`} size="wide">
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input value={addSearch} onChange={e => setAddSearch(e.target.value)}
              placeholder="Пошук за ПІБ..."
              className="w-full pl-8 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          {filteredAdd.length === 0 ? (
            <p className="text-center py-8 text-slate-400 text-sm">
              {ungrouped.length === 0 ? 'Немає здобувачів без групи' : 'Нічого не знайдено'}
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {filteredAdd.map(u => (
                <div key={u.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600">
                      {u.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{u.full_name}</p>
                      <p className="text-xs text-slate-400 font-mono">{u.login}</p>
                    </div>
                  </div>
                  <button onClick={() => handleAddMember(u.id)}
                    className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                    <Plus size={12} /> Додати
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Confirm delete */}
      <ConfirmModal
        isOpen={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => { handleDelete(confirmDel); setConfirmDel(null); }}
        title="Видалити групу"
        message={`Групу «${confirmDel?.name}» буде видалено. Здобувачі залишаться в системі, але без групи.`}
        confirmLabel="Видалити"
        variant="danger"
      />
    </div>
  );
}
