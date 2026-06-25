import { useRef, useState } from "react";
import { useAuthStore } from "../../authStore";
import { API_BASE } from "../../authStore";

interface Props {
  onClose: () => void;
}

function resolveUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ProfilePage({ onClose }: Props) {
  const user = useAuthStore((s) => s.user);
  const screenshots = useAuthStore((s) => s.screenshots);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const uploadAvatar = useAuthStore((s) => s.uploadAvatar);
  const uploadBackground = useAuthStore((s) => s.uploadBackground);
  const addScreenshot = useAuthStore((s) => s.addScreenshot);
  const deleteScreenshot = useAuthStore((s) => s.deleteScreenshot);
  const clearError = useAuthStore((s) => s.clearError);
  const logout = useAuthStore((s) => s.logout);

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(user?.display_name ?? "");
  const [editingBio, setEditingBio] = useState(false);
  const [bio, setBio] = useState(user?.bio ?? "");

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  async function saveName() {
    if (name.trim() && name.trim() !== user!.display_name) {
      await updateProfile({ display_name: name.trim() });
    }
    setEditingName(false);
  }

  async function saveBio() {
    await updateProfile({ bio: bio.trim() });
    setEditingBio(false);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadAvatar(await fileToDataUrl(file));
    e.target.value = "";
  }

  async function handleBackgroundChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadBackground(await fileToDataUrl(file));
    e.target.value = "";
  }

  async function handleScreenshotChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await addScreenshot(await fileToDataUrl(file));
    e.target.value = "";
  }

  const backgroundUrl = resolveUrl(user.background_url);
  const avatarUrl = resolveUrl(user.avatar_url);

  return (
    <div className="h-full overflow-y-auto bg-zinc-950">
      <div
        className="relative h-56 w-full bg-zinc-800 bg-cover bg-center"
        style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})` } : undefined}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
        <div className="absolute right-4 top-4 flex gap-2">
          <button
            onClick={() => {
              logout();
              onClose();
            }}
            className="rounded bg-black/50 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-900/70"
          >
            Abmelden
          </button>
          <button
            onClick={onClose}
            className="rounded bg-black/50 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black/70"
          >
            Schließen
          </button>
        </div>
        <button
          onClick={() => backgroundInputRef.current?.click()}
          className="absolute bottom-4 right-4 rounded bg-black/50 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black/70"
        >
          Hintergrund ändern
        </button>
        <input
          ref={backgroundInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleBackgroundChange}
        />
      </div>

      <div className="mx-auto max-w-3xl px-6 pb-12">
        <div className="-mt-12">
          <div className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-full ring-4 ring-zinc-950">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-zinc-700 text-2xl font-bold text-zinc-300">
                {user.display_name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              Ändern
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
        </div>

        <div className="mt-3">
          {editingName ? (
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="rounded bg-zinc-800 px-3 py-1.5 text-lg font-bold text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
              />
              <button
                onClick={saveName}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500"
              >
                Speichern
              </button>
              <button
                onClick={() => {
                  setName(user.display_name);
                  setEditingName(false);
                }}
                className="rounded px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
              >
                Abbrechen
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="py-1 text-2xl font-bold leading-relaxed text-zinc-100">
                {user.display_name}
              </h2>
              <button
                onClick={() => setEditingName(true)}
                className="text-xs text-sky-400 hover:underline"
              >
                Bearbeiten
              </button>
            </div>
          )}
          <p className="text-sm text-zinc-500">{user.email}</p>
        </div>

        {error && (
          <div className="mt-4 flex items-center justify-between rounded bg-red-900/60 px-3 py-2 text-sm text-red-100">
            <span>{error}</span>
            <button onClick={clearError} className="font-bold">
              ✕
            </button>
          </div>
        )}

        <div className="mt-8">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Über mich
          </h3>
          {editingBio ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                autoFocus
                placeholder="Erzähl etwas über dich..."
                className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveBio}
                  className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500"
                >
                  Speichern
                </button>
                <button
                  onClick={() => {
                    setBio(user.bio ?? "");
                    setEditingBio(false);
                  }}
                  className="rounded px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditingBio(true)}
              className="block w-full rounded bg-zinc-900 px-4 py-3 text-left text-sm text-zinc-300 hover:bg-zinc-800"
            >
              {user.bio || "Klicke hier, um eine Beschreibung hinzuzufügen."}
            </button>
          )}
        </div>

        <div className="mt-8">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Screenshots
            </h3>
            <button
              onClick={() => screenshotInputRef.current?.click()}
              disabled={loading}
              className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              + Screenshot hinzufügen
            </button>
            <input
              ref={screenshotInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleScreenshotChange}
            />
          </div>

          {screenshots.length === 0 ? (
            <p className="text-sm text-zinc-500">Noch keine Screenshots hinzugefügt.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {screenshots.map((s) => (
                <div key={s.id} className="group relative aspect-video overflow-hidden rounded bg-zinc-900">
                  <img
                    src={resolveUrl(s.image_url) ?? ""}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <button
                    onClick={() => deleteScreenshot(s.id)}
                    className="absolute right-1.5 top-1.5 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-white opacity-0 transition-opacity hover:bg-red-900/80 group-hover:opacity-100"
                  >
                    Entfernen
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
