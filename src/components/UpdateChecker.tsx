import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useT } from "../translations";

export function UpdateChecker() {
  const t = useT();
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    check()
      .then((result) => {
        if (result?.available) setUpdate(result);
      })
      .catch((err) => console.error("Update check failed", err));
  }, []);

  if (!update) return null;

  async function handleInstall() {
    if (!update) return;
    setInstalling(true);
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (err) {
      console.error("Update install failed", err);
      setInstalling(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60">
      <div className="flex w-[26rem] flex-col gap-4 rounded-lg bg-zinc-900 p-6 shadow-xl">
        <h2 className="text-lg font-bold text-zinc-100">{t("app_update_title")}</h2>
        <p className="text-sm text-zinc-300">
          {t("app_update_body")} ({update.version})
        </p>

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setUpdate(null)}
            disabled={installing}
            className="rounded px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800 disabled:opacity-50"
          >
            {t("app_update_later")}
          </button>
          <button
            type="button"
            onClick={handleInstall}
            disabled={installing}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {installing ? t("app_update_downloading") : t("app_update_install")}
          </button>
        </div>
      </div>
    </div>
  );
}
