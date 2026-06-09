import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmModal({
  isOpen, title, message, onConfirm, onClose, onCancel,
  danger, variant, confirmLabel = 'Підтвердити', requireCheck = false, checkLabel,
}) {
  const [checked, setChecked] = useState(false);
  const handleClose = onClose || onCancel || (() => {});
  const isDanger = danger !== undefined ? danger : (variant === 'danger' || variant === undefined ? true : false);
  const canConfirm = !requireCheck || checked;

  if (isOpen === false) return null;

  function handleConfirm() {
    if (!canConfirm) return;
    setChecked(false);
    onConfirm();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) { setChecked(false); handleClose(); } }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-modal-in p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isDanger ? 'bg-red-50' : 'bg-amber-50'}`}>
            <AlertTriangle size={20} className={isDanger ? 'text-red-500' : 'text-amber-500'} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">{title}</h3>
            {message && <p className="text-sm text-slate-500 mt-1">{message}</p>}
          </div>
        </div>

        {requireCheck && (
          <label className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              className="w-4 h-4 accent-red-500 cursor-pointer"
            />
            <span className="text-sm text-red-700 font-medium">
              {checkLabel || 'Так, я дійсно хочу видалити'}
            </span>
          </label>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <button
            onClick={() => { setChecked(false); handleClose(); }}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Скасувати
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              isDanger ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
