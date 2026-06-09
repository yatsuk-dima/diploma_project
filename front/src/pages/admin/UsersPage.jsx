import { useEffect, useState, useRef } from 'react';
import {
  Plus, Pencil, UserX, UserCheck, Search, ChevronLeft, ChevronRight,
  User, Users, GraduationCap, RefreshCw, Eye, EyeOff, Upload,
} from 'lucide-react';
import { listUsers, createUser, updateUser, deleteUser, bulkCreateUsers } from '../../api/users';
import { listGroups } from '../../api/groups';
import { listDisciplines } from '../../api/disciplines';
import Modal from '../../components/Modal';
import ConfirmModal from '../../components/ConfirmModal';
import { TableSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';

const PER_PAGE = 15;

const TABS = [
  { role: 'instructor', label: 'Викладачі', icon: User },
  { role: 'student', label: 'Здобувачі', icon: GraduationCap },
];

function RoleBadge({ role }) {
  if (role === 'admin') return <span className="text-xs bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-full font-medium">Адмін</span>;
  if (role === 'instructor') return <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full font-medium">Викладач</span>;
  return <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">Здобувач</span>;
}

function StatusDot({ active }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${active ? 'text-emerald-600' : 'text-slate-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      {active ? 'Активний' : 'Деактивований'}
    </span>
  );
}

const EMPTY_FORM = { full_name: '', login: '', password: '', group_id: '', discipline_ids: [] };

export default function UsersPage() {
  const [tab, setTab] = useState('instructor');
  const [data, setData] = useState({ items: [], total: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [disciplines, setDisciplines] = useState([]);
  const [modal, setModal] = useState(null); // null | 'create' | 'edit'
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [bulkModal, setBulkModal] = useState(false);
  const fileRef = useRef();
  const toast = useToast();

  async function load(p = page, role = tab) {
    setLoading(true);
    try {
      const res = await listUsers({ role, page: p, per_page: PER_PAGE });
      setData(res);
    } catch { toast('Помилка завантаження'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    Promise.all([listGroups(), listDisciplines()])
      .then(([g, d]) => { setGroups(g); setDisciplines(d); })
      .catch(() => {});
  }, []);

  useEffect(() => { setPage(1); load(1, tab); }, [tab]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setShowPwd(false);
    setEditUser(null);
    setModal('create');
  }

  function openEdit(u) {
    setForm({ full_name: u.full_name, login: u.login, password: '', group_id: u.group_id || '', discipline_ids: u.discipline_ids || [] });
    setShowPwd(false);
    setEditUser(u);
    setModal('edit');
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.full_name.trim()) { toast('Введіть ПІБ'); return; }
    if (!form.login.trim()) { toast('Введіть логін'); return; }
    if (modal === 'create' && !form.password.trim()) { toast('Введіть пароль'); return; }
    setSaving(true);
    try {
      if (modal === 'create') {
        const payload = {
          full_name: form.full_name.trim(),
          login: form.login.trim(),
          password: form.password,
          role: tab,
          group_id: tab === 'student' && form.group_id ? form.group_id : null,
          discipline_ids: tab === 'instructor' ? form.discipline_ids : [],
        };
        await createUser(payload);
        toast('Користувача створено', 'success');
      } else {
        const payload = {
          full_name: form.full_name.trim(),
          login: form.login.trim(),
          ...(form.password ? { password: form.password } : {}),
          ...(tab === 'student' ? { group_id: form.group_id || null } : { discipline_ids: form.discipline_ids }),
        };
        await updateUser(editUser.id, payload);
        toast('Збережено', 'success');
      }
      setModal(null);
      load(page, tab);
    } catch (err) {
      toast(err.response?.data?.detail || 'Помилка збереження');
    } finally { setSaving(false); }
  }

  async function handleToggleActive(u) {
    try {
      if (u.is_active) {
        await deleteUser(u.id);
        toast('Користувача деактивовано');
      } else {
        await updateUser(u.id, { is_active: true });
        toast('Користувача активовано', 'success');
      }
      load(page, tab);
    } catch (err) {
      toast(err.response?.data?.detail || 'Помилка');
    }
  }

  const filtered = data.items.filter(u =>
    !search || u.full_name.toLowerCase().includes(search.toLowerCase()) || u.login.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(data.total / PER_PAGE);

  async function handleBulkUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await bulkCreateUsers(file);
      toast(`Створено: ${res.created}${res.skipped.length ? `, пропущено: ${res.skipped.length}` : ''}`, 'success');
      setBulkModal(false);
      load(1, tab);
    } catch (err) {
      toast(err.response?.data?.detail || 'Помилка імпорту');
    } finally {
      e.target.value = '';
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Користувачі</h1>
          <p className="text-slate-500 text-sm mt-0.5">Управління викладачами та здобувачами</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setBulkModal(true)}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-colors">
            <Upload size={14} /> Імпорт CSV
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            <Plus size={15} /> Додати
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-5 w-fit">
        {TABS.map(({ role, label, icon: Icon }) => (
          <button key={role} onClick={() => setTab(role)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === role ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Пошук за ПІБ або логіном..."
          className="w-full max-w-sm pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6"><TableSkeleton rows={6} /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
              <Users size={20} className="text-slate-400" />
            </div>
            <p className="text-slate-500 font-medium">Немає користувачів</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">ПІБ</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Логін</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {tab === 'student' ? 'Група' : 'Дисципліна'}
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Статус</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(u => {
                const groupName = tab === 'student'
                  ? (groups.find(g => g.id === u.group_id)?.name ?? '—')
                  : null;
                const userDiscs = tab === 'instructor'
                  ? u.discipline_ids?.map(id => disciplines.find(d => d.id === id)).filter(Boolean)
                  : [];
                return (
                  <tr key={u.id} className={`hover:bg-slate-50/80 transition-colors group ${!u.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3.5 font-medium text-slate-800">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 text-xs font-semibold text-indigo-600">
                          {u.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        {u.full_name}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 font-mono text-xs">{u.login}</td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {tab === 'student' ? (
                        groupName ?? '—'
                      ) : userDiscs?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {userDiscs.map(d => (
                            <span key={d.id} className="inline-flex items-center gap-1 text-xs">
                              {d.short_name && (
                                <span className="font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700 tracking-wide">{d.short_name}</span>
                              )}
                              <span className="text-slate-600">{d.name}</span>
                            </span>
                          ))}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3.5"><StatusDot active={u.is_active} /></td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(u)} title="Редагувати"
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setConfirmDel(u)} title={u.is_active ? 'Деактивувати' : 'Активувати'}
                          className={`p-1.5 rounded-lg hover:bg-slate-100 transition-colors ${
                            u.is_active ? 'text-slate-400 hover:text-rose-500' : 'text-slate-400 hover:text-emerald-600'
                          }`}>
                          {u.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
          <span>Сторінка {page} з {totalPages} · всього {data.total}</span>
          <div className="flex gap-1">
            <button disabled={page === 1} onClick={() => { setPage(p => p - 1); load(page - 1, tab); }}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={16} />
            </button>
            <button disabled={page === totalPages} onClick={() => { setPage(p => p + 1); load(page + 1, tab); }}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal isOpen={!!modal} onClose={() => setModal(null)}
        title={modal === 'create' ? (tab === 'instructor' ? 'Новий викладач' : 'Новий здобувач') : 'Редагувати користувача'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">ПІБ <span className="text-red-500">*</span></label>
            <input value={form.full_name} onChange={e => set('full_name', e.target.value)}
              placeholder="Іваненко Іван Іванович"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Логін <span className="text-red-500">*</span></label>
            <input value={form.login} onChange={e => set('login', e.target.value)}
              placeholder="ivan.ivanenko"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Пароль {modal === 'edit' && <span className="text-slate-400 font-normal text-xs">(залиште порожнім щоб не змінювати)</span>}
              {modal === 'create' && <span className="text-red-500">*</span>}
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={form.password} onChange={e => set('password', e.target.value)}
                placeholder={modal === 'edit' ? '••••••••' : 'Мінімум 6 символів'}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button type="button" onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          {tab === 'student' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Навчальна група</label>
              <select value={form.group_id} onChange={e => set('group_id', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                <option value="">— Без групи —</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
          {tab === 'instructor' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Дисципліни</label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-2">
                {disciplines.length === 0
                  ? <p className="text-xs text-slate-400 px-1">Дисциплін немає</p>
                  : disciplines.map(d => {
                    const checked = form.discipline_ids.includes(d.id);
                    return (
                      <label key={d.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                          {checked && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <input type="checkbox" checked={checked} className="sr-only"
                          onChange={() => set('discipline_ids', checked
                            ? form.discipline_ids.filter(id => id !== d.id)
                            : [...form.discipline_ids, d.id]
                          )} />
                        <span className="text-sm text-slate-700">{d.name}</span>
                      </label>
                    );
                  })
                }
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-1">
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

      {/* Confirm deactivate/activate */}
      <ConfirmModal
        isOpen={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => { handleToggleActive(confirmDel); setConfirmDel(null); }}
        title={confirmDel?.is_active ? 'Деактивувати користувача' : 'Активувати користувача'}
        message={confirmDel?.is_active
          ? `${confirmDel?.full_name} більше не матиме доступу до системи.`
          : `${confirmDel?.full_name} знову отримає доступ до системи.`}
        confirmLabel={confirmDel?.is_active ? 'Деактивувати' : 'Активувати'}
        variant={confirmDel?.is_active ? 'danger' : 'normal'}
      />

      {/* Bulk import modal */}
      <Modal isOpen={bulkModal} onClose={() => setBulkModal(false)} title="Масовий імпорт користувачів">
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-1.5">
            <p className="font-medium text-slate-700">Формат CSV:</p>
            <p className="font-mono text-xs bg-white border border-slate-200 rounded-lg p-2 select-all">
              full_name,login,password,role,group_id
            </p>
            <p className="text-xs text-slate-400">role: instructor або student · group_id: UUID групи (необов'язково)</p>
          </div>
          <button onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 rounded-xl py-6 text-slate-500 hover:text-indigo-600 transition-all text-sm font-medium">
            <Upload size={18} />
            Обрати CSV файл
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleBulkUpload} />
        </div>
      </Modal>
    </div>
  );
}
