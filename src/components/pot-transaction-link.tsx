import Link from 'next/link';
import type { Pot } from '@/lib/records/pots';

/** Account names on the household-total cards open their own activity; cash stays plain text. */
export function PotTransactionLink({ pot }: { pot: Pick<Pot, 'id' | 'kind' | 'label'> }) {
  if (pot.kind === 'cash') return <>{pot.label}</>;

  return (
    <Link
      href={`/transactions?potId=${pot.id}`}
      className="sf-link"
      aria-label={`View transactions for ${pot.label}`}
    >
      {pot.label}
    </Link>
  );
}
