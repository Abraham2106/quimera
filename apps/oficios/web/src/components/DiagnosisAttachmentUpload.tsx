import { useState, type FormEvent } from "react";

import { uploadWorkOrderAttachment } from "../api/client.js";
import type { DevApiConfig } from "../config.js";

export function DiagnosisAttachmentUpload(props: {
  config: DevApiConfig;
  workOrderId: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackOk, setFeedbackOk] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("file");
    if (!(input instanceof HTMLInputElement)) {
      setFeedbackOk(false);
      setFeedback("No se encontró el control de archivo.");
      return;
    }
    const file = input.files?.[0];
    if (!file) {
      setFeedbackOk(false);
      setFeedback("Elegí un archivo JPEG, PNG, WEBP o PDF.");
      return;
    }
    setUploading(true);
    setFeedback(null);
    try {
      await uploadWorkOrderAttachment(props.config, props.workOrderId, file);
      setFeedbackOk(true);
      setFeedback("Adjunto subido correctamente.");
      input.value = "";
    } catch (err) {
      setFeedbackOk(false);
      setFeedback(
        err instanceof Error ? err.message : "No se pudo subir el adjunto.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className="mt-3 grid gap-2 text-sm" onSubmit={(e) => void onSubmit(e)}>
      <label className="flex flex-col">
        <span className="text-slate-600">Evidencia (foto o PDF)</span>
        <input
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
          className="rounded border border-slate-300 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        className="w-fit rounded border border-slate-300 px-3 py-2 disabled:opacity-50"
        disabled={uploading}
      >
        Subir adjunto
      </button>
      {feedback ? (
        <p
          className={feedbackOk ? "text-emerald-800" : "text-amber-800"}
          role="status"
        >
          {feedback}
        </p>
      ) : null}
    </form>
  );
}