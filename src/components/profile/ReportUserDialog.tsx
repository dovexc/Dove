import { useRef, useState } from "react";
import { API_BASE, getAuthHeader } from "../../authStore";
import { useT } from "../../translations";

const MAX_IMAGES = 4;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface Props {
  userId: number;
  onClose: () => void;
}

export function ReportUserDialog({ userId, onClose }: Props) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleAddImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const room = MAX_IMAGES - images.length;
    const dataUrls = await Promise.all(files.slice(0, room).map(fileToDataUrl));
    setImages((prev) => [...prev, ...dataUrls]);
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/users/${userId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ reason: reason.trim(), images }),
      });
      if (!response.ok) throw new Error(await response.text());
      setDone(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-[26rem] flex-col gap-4 rounded-lg bg-zinc-900 p-6 shadow-xl">
        <h2 className="text-lg font-bold text-zinc-100">{t("report_user_title")}</h2>

        {done ? (
          <>
            <p className="text-sm text-zinc-300">{t("report_user_success")}</p>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
              >
                {t("close")}
              </button>
            </div>
          </>
        ) : (
          <>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("report_user_reason_label")}
              rows={4}
              className="rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />

            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-zinc-500">
                {t("report_user_evidence_label")}
              </span>
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((src, i) => (
                    <div key={i} className="group relative h-16 w-16 overflow-hidden rounded border border-zinc-700">
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center bg-black/70 text-xs text-white opacity-0 group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {images.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="self-start rounded bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700"
                >
                  {t("report_user_add_image")}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleAddImages}
              />
            </div>

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
                onClick={handleSubmit}
                disabled={submitting || !reason.trim()}
                className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {t("report_user_submit")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
