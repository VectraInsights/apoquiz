"use client";

import { useCallback, useRef, useState } from "react";
import { FileUp, Sparkles, Loader2 } from "lucide-react";
import { isPdf } from "@/lib/client/pipeline";

export function UploadZone({
  onFiles,
  busy,
  onSample,
}: {
  onFiles: (files: File[]) => void;
  busy: boolean;
  onSample: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      if (busy) return;
      const files = Array.from(event.dataTransfer.files ?? []).filter(isPdf);
      if (files.length > 0) onFiles(files);
    },
    [busy, onFiles],
  );

  const handlePick = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []).filter(isPdf);
      if (files.length > 0) onFiles(files);
      event.target.value = "";
    },
    [onFiles],
  );

  return (
    <div className="panel p-1.5 shadow-2xl shadow-black/40">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !busy && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        aria-label="Enviar PDFs da apostila"
        className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-[0.9rem] border-2 border-dashed px-6 py-12 text-center transition ${
          dragging
            ? "border-brand bg-brand/10"
            : "border-line hover:border-brand/50 hover:bg-white/[0.02]"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <span
          className={`grid size-14 place-items-center rounded-2xl transition ${
            dragging
              ? "bg-brand text-white"
              : "bg-white/5 text-brand-soft"
          }`}
        >
          {busy ? (
            <Loader2 className="size-6 animate-spin" />
          ) : (
            <FileUp className="size-6" />
          )}
        </span>

        <div className="space-y-1.5">
          <p className="text-base font-semibold">
            {dragging
              ? "Solte os PDFs aqui"
              : "Arraste os PDFs da apostila"}
          </p>
          <p className="text-sm text-ink-muted">
            ou clique para escolher os arquivos — pode mandar vários de uma vez, e
            o processamento acontece no seu navegador
          </p>
        </div>

        <p className="text-xs text-ink-faint">
          Os arquivos são lidos no seu navegador. Nada é enviado para servidores
          sem necessidade.
        </p>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSample();
          }}
          disabled={busy}
          className="btn btn-ghost mt-1"
        >
          <Sparkles className="size-4" />
          Ver um quiz de exemplo
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={handlePick}
        />
      </div>
    </div>
  );
}

export function isSupportedPdf(file: File): boolean {
  return isPdf(file);
}
