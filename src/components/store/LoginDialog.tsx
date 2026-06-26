import { useEffect, useState } from "react";
import { useAuthStore } from "../../authStore";
import { useT } from "../../translations";

interface Props {
  onClose: () => void;
}

export function LoginDialog({ onClose }: Props) {
  const t = useT();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const token = useAuthStore((s) => s.token);
  const clearError = useAuthStore((s) => s.clearError);

  useEffect(() => {
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (token) {
    onClose();
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "login") {
      await login(email, password);
    } else {
      await register(email, password, displayName);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="flex w-[24rem] flex-col gap-4 rounded-lg bg-zinc-900 p-6 shadow-xl"
      >
        <h2 className="text-lg font-bold text-zinc-100">
          {mode === "login" ? t("login_title") : t("login_create_account_title")}
        </h2>

        {error && (
          <p className="rounded bg-red-900/60 px-3 py-2 text-sm text-red-100">
            {error}
          </p>
        )}

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          {t("login_email")}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          {t("login_password")}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
          />
        </label>

        {mode === "register" && (
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            {t("login_display_name")}
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
          </label>
        )}

        <button
          type="button"
          onClick={() => {
            clearError();
            setMode(mode === "login" ? "register" : "login");
          }}
          className="text-left text-xs text-sky-400 hover:underline"
        >
          {mode === "login" ? t("login_to_register") : t("login_to_login")}
        </button>

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            {t("dialog_cancel")}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {mode === "login" ? t("login_title") : t("login_register")}
          </button>
        </div>
      </form>
    </div>
  );
}
