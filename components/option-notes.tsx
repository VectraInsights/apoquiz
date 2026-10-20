"use client";

import { Check, X } from "lucide-react";
import type { Question } from "@/lib/types";

/**
 * Analise de cada alternativa, vinda do PDF (secao "Gabaritos e Comentarios")
 * ou gerada pela IA quando o PDF nao traz.
 */
export function OptionNotes({
  question,
  className = "",
}: {
  question: Question;
  className?: string;
}) {
  const notes = question.optionNotes;
  if (!notes || Object.keys(notes).length === 0) return null;

  const items = question.options.filter((option) => notes[option.label]);
  if (items.length === 0) return null;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        Por que cada alternativa
      </p>
      {items.map((option) => {
        const isCorrect = option.label === question.correct;
        return (
          <p
            key={option.label}
            className={`flex items-start gap-2 text-xs leading-relaxed ${
              isCorrect ? "text-ink" : "text-ink-muted"
            }`}
          >
            {isCorrect ? (
              <Check className="mt-0.5 size-3.5 shrink-0 text-ok" />
            ) : (
              <X className="mt-0.5 size-3.5 shrink-0 text-bad" />
            )}
            <span>
              <span className="font-semibold">{option.label})</span>{" "}
              {notes[option.label]}
            </span>
          </p>
        );
      })}
    </div>
  );
}
