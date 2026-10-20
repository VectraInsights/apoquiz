/**
 * Ajuda de pluralizacao em portugues.
 *
 * Regras: 1 -> singular, qualquer outro numero -> plural.
 */

/** "questao" / "questoes" com o numero na frente: "1 questão", "2 questões" */
export function countLabel(
  count: number,
  singular: string,
  plural: string,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Verbo que concorda com o numero: "ficou" (1) / "ficaram" (2+) */
export function verbFor(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
