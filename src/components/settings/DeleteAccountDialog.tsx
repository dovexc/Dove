import { useState } from "react";
import { useAuthStore } from "../../authStore";
import { useT } from "../../translations";

interface Props {
  onClose: () => void;
}

export function DeleteAccountDialog({ onClose }: Props) {
  const t = useT();
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const confirmWord = t("settings_delete_account_confirm_input").match(/"(.+?)"/)?.[1] ?? "löschen";
  const canConfirm = password.length > 0 && confirmText.trim().toLowerCase() === confirmWord.toLowerCase();

  async function handleConfirm() {
    clearError();
    setSubmitting(true);
    const ok = await deleteAccount(password);
    setSubmitting(false);
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg bg-zinc-900 p-6 shadow-xl">
        <h2 className="text-lg font-bold text-zinc-100">
          {t("settings_delete_account_confirm_title")}
        </h2>
        <p className="text-sm text-zinc-300">{t("settings_delete_account_confirm_body")}</p>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          {t("settings_current_password")}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-red-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          {t("settings_delete_account_confirm_input")}
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-red-500"
          />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            {t("dialog_cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || submitting}
            className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {t("settings_delete_account_confirm_button")}
          </button>
        </div>
      </div>
    </div>
  );
}
