import { Card } from '@/components/ui';
import type { ReputationFormula } from '@/services/reputation';
import { REPUTATION_MESSAGES } from './reputation-messages';

/** Explica la fórmula con el texto y el ejemplo que entrega la API, tal cual (RNF-007-01). */
export function FormulaCard({ formula }: { formula: ReputationFormula }) {
  return (
    <Card as="section" aria-labelledby="formula-title" className="flex flex-col gap-3">
      <details open className="flex flex-col gap-3">
        <summary
          id="formula-title"
          className="flex min-h-11 cursor-pointer items-center font-display text-xl font-bold"
        >
          {REPUTATION_MESSAGES.formulaTitle}
        </summary>
        <p className="text-[15px] leading-relaxed text-muted">{formula.text}</p>
        <p className="text-[15px] leading-relaxed font-bold">{formula.example}</p>
      </details>
    </Card>
  );
}
