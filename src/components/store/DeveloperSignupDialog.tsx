import { useState } from "react";
import { useAuthStore } from "../../authStore";
import { useT } from "../../translations";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

/// Gate shown the first time a user tries to publish a game — self-serve,
/// instant activation (no admin approval), since the per-game moderation
/// queue is what actually protects the storefront.
export function DeveloperSignupDialog({ onClose, onSuccess }: Props) {
  const t = useT();
  const becomeDeveloper = useAuthStore((s) => s.becomeDeveloper);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const [developerName, setDeveloperName] = useState("");
  const [developerBio, setDeveloperBio] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!developerName.trim()) return;
    clearError();
    const ok = await becomeDeveloper(developerName.trim(), developerBio.trim());
    if (ok) onSuccess();
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-md flex-col gap-4 rounded-lg bg-zinc-900 p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-100">{t("dev_signup_title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
            aria-label={t("dialog_cancel")}
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-zinc-400">{t("dev_signup_intro")}</p>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          {t("dev_signup_name_label")}
          <input
            value={developerName}
            onChange={(e) => setDeveloperName(e.target.value)}
            placeholder={t("dev_signup_name_placeholder")}
            required
            autoFocus
            className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          {t("dev_signup_bio_label")}
          <textarea
            value={developerBio}
            onChange={(e) => setDeveloperBio(e.target.value)}
            rows={3}
            placeholder={t("dev_signup_bio_placeholder")}
            className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
          />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            {t("dialog_cancel")}
          </button>
          <button
            type="submit"
            disabled={loading || !developerName.trim()}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {loading ? t("checkout_processing") : t("dev_signup_submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
