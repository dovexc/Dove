import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useAuthStore } from "../../authStore";
import { useLibraryStore } from "../../store";
import { formatSize } from "../../utils";
import { useI18nStore } from "../../i18nStore";
import { useT } from "../../translations";
import { OrderHistoryDialog } from "./OrderHistoryDialog";
import { TournamentPayoutsDialog } from "./TournamentPayoutsDialog";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

interface Props {
  onClose: () => void;
  onOpenGame: (catalogGameId: number) => void;
}

const LANGUAGES: { id: "de" | "en"; label: string }[] = [
  { id: "de", label: "Deutsch" },
  { id: "en", label: "English" },
];

export function SettingsView({ onClose, onOpenGame }: Props) {
  const t = useT();
  const language = useI18nStore((s) => s.language);
  const setLanguage = useI18nStore((s) => s.setLanguage);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const changePassword = useAuthStore((s) => s.changePassword);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const exportMyData = useAuthStore((s) => s.exportMyData);
  const authError = useAuthStore((s) => s.error);
  const authLoading = useAuthStore((s) => s.loading);
  const clearError = useAuthStore((s) => s.clearError);
  const games = useLibraryStore((s) => s.games);

  const [installDir, setInstallDir] = useState<string | null>(null);
  const [installDirError, setInstallDirError] = useState<string | null>(null);
  const [changingInstallDir, setChangingInstallDir] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  const [showPayouts, setShowPayouts] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  useEffect(() => {
    invoke<string>("get_install_dir")
      .then(setInstallDir)
      .catch(() => setInstallDir(null));
  }, []);

  const totalStorageBytes = games.reduce((sum, g) => sum + g.size_on_disk_bytes, 0);

  async function handleChangeInstallDir() {
    const picked = await open({
      directory: true,
      multiple: false,
      title: t("settings_install_dir_pick_title"),
    });
    if (typeof picked !== "string") return;

    setInstallDirError(null);
    setChangingInstallDir(true);
    try {
      await invoke("set_install_dir", { path: picked });
      setInstallDir(picked);
    } catch (e) {
      setInstallDirError(String(e));
    } finally {
      setChangingInstallDir(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setPasswordSuccess(false);
    const ok = await changePassword(currentPassword, newPassword);
    if (ok) {
      setCurrentPassword("");
      setNewPassword("");
      setPasswordSuccess(true);
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-zinc-950">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-100">{t("settings_title")}</h1>
          <button
            onClick={onClose}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
          >
            {t("close")}
          </button>
        </div>

        {/* Konto */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("settings_account")}
          </h2>
          <div className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500">{t("settings_email")}</p>
                <p className="text-sm text-zinc-200">{user?.email}</p>
              </div>
              <button
                onClick={() => {
                  logout();
                  onClose();
                }}
                className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-red-900/60"
              >
                {t("settings_logout")}
              </button>
            </div>

            <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
              <p className="text-sm font-medium text-zinc-200">{t("settings_order_history")}</p>
              <button
                onClick={() => setShowOrderHistory(true)}
                className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
              >
                {t("settings_order_history_open")}
              </button>
            </div>

            <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
              <p className="text-sm font-medium text-zinc-200">{t("settings_tournament_payouts")}</p>
              <button
                onClick={() => setShowPayouts(true)}
                className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
              >
                {t("settings_tournament_payouts_open")}
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="flex flex-col gap-3 border-t border-zinc-800 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {t("settings_change_password")}
              </p>
              {authError && <p className="text-sm text-red-400">{authError}</p>}
              {passwordSuccess && (
                <p className="text-sm text-emerald-400">{t("settings_password_changed")}</p>
              )}
              <label className="flex flex-col gap-1 text-sm text-zinc-300">
                {t("settings_current_password")}
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-zinc-300">
                {t("settings_new_password")}
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                />
              </label>
              <button
                type="submit"
                disabled={authLoading}
                className="self-end rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {t("settings_change_password")}
              </button>
            </form>
          </div>
        </section>

        {/* Privatsphäre */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("settings_privacy")}
          </h2>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <label className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-zinc-200">{t("settings_hide_profile")}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{t("settings_hide_profile_desc")}</p>
              </div>
              <input
                type="checkbox"
                checked={user?.is_profile_hidden ?? false}
                onChange={(e) => updateProfile({ is_profile_hidden: e.target.checked })}
                className="h-5 w-5 shrink-0 accent-sky-600"
              />
            </label>
          </div>
        </section>

        {/* Daten & Datenschutz */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("settings_data")}
          </h2>
          <div className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-zinc-200">{t("settings_export_data")}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{t("settings_export_data_desc")}</p>
              </div>
              <button
                onClick={() => exportMyData()}
                disabled={authLoading}
                className="shrink-0 rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
              >
                {t("settings_export_data")}
              </button>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-zinc-800 pt-4">
              <div>
                <p className="text-sm font-medium text-red-400">{t("settings_delete_account")}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{t("settings_delete_account_desc")}</p>
              </div>
              <button
                onClick={() => setShowDeleteAccount(true)}
                className="shrink-0 rounded bg-red-900/60 px-3 py-1.5 text-sm font-semibold text-red-300 hover:bg-red-900"
              >
                {t("settings_delete_account")}
              </button>
            </div>
          </div>
        </section>

        {/* Anwendung */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("settings_app")}
          </h2>
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div>
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-zinc-500">{t("settings_install_dir")}</p>
                <button
                  onClick={handleChangeInstallDir}
                  disabled={changingInstallDir}
                  className="shrink-0 rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                >
                  {t("settings_install_dir_change")}
                </button>
              </div>
              <p className="break-all text-sm text-zinc-200">
                {installDir ?? t("settings_determining")}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{t("settings_install_dir_note")}</p>
              {installDirError && (
                <p className="mt-1 text-xs text-red-400">{installDirError}</p>
              )}
            </div>
            <div className="border-t border-zinc-800 pt-3">
              <p className="text-xs text-zinc-500">{t("settings_storage_used")}</p>
              <p className="text-sm text-zinc-200">
                {formatSize(totalStorageBytes)} ({games.length} {t("settings_games_in_library")})
              </p>
            </div>
          </div>
        </section>

        {/* Sprache */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("settings_language")}
          </h2>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex gap-2">
              {LANGUAGES.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLanguage(l.id)}
                  className={`rounded px-3.5 py-1.5 text-sm font-semibold ${
                    language === l.id
                      ? "bg-sky-600 text-white"
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {showOrderHistory && (
        <OrderHistoryDialog
          onClose={() => setShowOrderHistory(false)}
          onOpenGame={(catalogGameId) => {
            setShowOrderHistory(false);
            onOpenGame(catalogGameId);
          }}
        />
      )}
      {showPayouts && <TournamentPayoutsDialog onClose={() => setShowPayouts(false)} />}
      {showDeleteAccount && (
        <DeleteAccountDialog onClose={() => setShowDeleteAccount(false)} />
      )}
    </div>
  );
}
