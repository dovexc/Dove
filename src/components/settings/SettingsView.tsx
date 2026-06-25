import { useEffect, useState } from "react";
import { appDataDir, join } from "@tauri-apps/api/path";
import { useAuthStore } from "../../authStore";
import { useLibraryStore } from "../../store";
import { formatSize } from "../../utils";
import { ACCENT_PRESETS, applyAccent, getStoredAccent } from "../../theme";
import type { AccentId } from "../../theme";

interface Props {
  onClose: () => void;
}

export function SettingsView({ onClose }: Props) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const changePassword = useAuthStore((s) => s.changePassword);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const authError = useAuthStore((s) => s.error);
  const authLoading = useAuthStore((s) => s.loading);
  const clearError = useAuthStore((s) => s.clearError);
  const games = useLibraryStore((s) => s.games);

  const [installDir, setInstallDir] = useState<string | null>(null);
  const [accent, setAccent] = useState<AccentId>(getStoredAccent());

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    appDataDir()
      .then((dir) => join(dir, "installed"))
      .then(setInstallDir)
      .catch(() => setInstallDir(null));
  }, []);

  const totalStorageBytes = games.reduce((sum, g) => sum + g.size_on_disk_bytes, 0);

  function handleAccentChange(next: AccentId) {
    setAccent(next);
    applyAccent(next);
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
          <h1 className="text-2xl font-bold text-zinc-100">Einstellungen</h1>
          <button
            onClick={onClose}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
          >
            Schließen
          </button>
        </div>

        {/* Konto */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Konto
          </h2>
          <div className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500">E-Mail</p>
                <p className="text-sm text-zinc-200">{user?.email}</p>
              </div>
              <button
                onClick={() => {
                  logout();
                  onClose();
                }}
                className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-red-900/60"
              >
                Abmelden
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="flex flex-col gap-3 border-t border-zinc-800 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Passwort ändern
              </p>
              {authError && <p className="text-sm text-red-400">{authError}</p>}
              {passwordSuccess && (
                <p className="text-sm text-emerald-400">Passwort erfolgreich geändert.</p>
              )}
              <label className="flex flex-col gap-1 text-sm text-zinc-300">
                Aktuelles Passwort
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-zinc-300">
                Neues Passwort
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
                Passwort ändern
              </button>
            </form>
          </div>
        </section>

        {/* Privatsphäre */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Privatsphäre
          </h2>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <label className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-zinc-200">Mein Profil verstecken</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Wenn aktiv, taucht dein Profil nicht mehr in der Nutzersuche auf und ist auch
                  per Link nicht mehr abrufbar — außer für Nutzer, mit denen du bereits befreundet
                  bist.
                </p>
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

        {/* Anwendung */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Anwendung
          </h2>
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div>
              <p className="text-xs text-zinc-500">Installationsordner</p>
              <p className="break-all text-sm text-zinc-200">
                {installDir ?? "Wird ermittelt..."}
              </p>
            </div>
            <div className="border-t border-zinc-800 pt-3">
              <p className="text-xs text-zinc-500">Speicherplatz durch Spiele belegt</p>
              <p className="text-sm text-zinc-200">
                {formatSize(totalStorageBytes)} ({games.length} Spiele in der Bibliothek)
              </p>
            </div>
          </div>
        </section>

        {/* Design */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Design
          </h2>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="mb-3 text-xs text-zinc-500">Akzentfarbe</p>
            <div className="flex gap-3">
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleAccentChange(preset.id)}
                  title={preset.label}
                  className={`h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-zinc-900 ${
                    accent === preset.id ? "ring-zinc-100" : "ring-transparent"
                  }`}
                  style={{ background: preset.swatch }}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
