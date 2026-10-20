import type { Db } from '../db/client';
import type { GuideAnchorId } from '../guide';
import { getSetupPath, type SetupStepId } from './setup-path';

/**
 * “What this page needs first” (docs/ONBOARDING_PLAN.md §5, Slice 2).
 *
 * The four payoff surfaces — the payday projection, Horizon, Charts and
 * Insights — are exactly the things that are blank on day one, so a brand-new
 * household used to meet them as zero-figure scaffolding: twelve empty week
 * bars on a £0–£1 axis, “October £0.00 vs September £0.00”, “no complete week
 * recorded yet”. This module replaces that with one honest sentence per
 * missing record and a link to the setup step that supplies it, plus — where
 * an idea bites — the guide section that explains it.
 *
 * The derivation is the setup path’s own (`setup-path.ts`): a need is simply
 * a prerequisite step that is not `done`, so a need can never disagree with
 * the records, and closing the step anywhere in the app removes the need
 * everywhere. Optional steps are never prerequisites — a car-free, card-free
 * household’s payoff pages are complete without them.
 */

export type PayoffPageId = 'projection' | 'horizon' | 'charts' | 'insights';

export interface PageNeed {
  /** The setup step that supplies the missing record. */
  readonly id: SetupStepId;
  /** One sentence naming what this page is missing and why it matters here. */
  readonly sentence: string;
  /** The step on /start — its anchor (`setup-<id>`) is stable. */
  readonly actionHref: string;
  readonly actionLabel: string;
  /** The guide section that explains the idea, when one does. */
  readonly guideAnchor: GuideAnchorId | null;
}

/** The heading the section variant renders, and the browser suite asserts. */
export const NEEDS_FIRST_TITLE = 'What this page needs first';

/**
 * What each payoff surface reads, as setup steps, in dependency order. The
 * pages decide *when* to show the needs (the projection is null, Horizon has
 * no selected checkpoint, the forecast is unavailable, nothing is recorded);
 * this module decides *what* to say.
 */
const PAGE_PREREQUISITES: Record<PayoffPageId, readonly SetupStepId[]> = {
  projection: ['pots', 'checkpoints', 'payday'],
  horizon: ['pots', 'checkpoints'],
  charts: ['pots', 'checkpoints', 'purchases'],
  insights: ['purchases', 'figures'],
};

interface NeedCopy {
  readonly sentence: string;
  readonly actionLabel: string;
  readonly guideAnchor: GuideAnchorId | null;
}

const NEED_COPY: Record<PayoffPageId, Partial<Record<SetupStepId, NeedCopy>>> = {
  projection: {
    pots: {
      sentence:
        'The projection starts from your own pots — a bank account or a cash pot is what carries the balance it projects.',
      actionLabel: 'Add the pots you actually have',
      guideAnchor: 'checkpoint',
    },
    checkpoints: {
      sentence:
        'It needs a balance checkpoint: one figure per pot, read from your bank or counted by hand — the app never guesses a balance.',
      actionLabel: 'Record what each pot holds',
      guideAnchor: 'checkpoint',
    },
    payday: {
      sentence:
        'Set a household payday to define this planning window. A receipt schedule is optional; any scheduled receipt still counts on its own due date.',
      actionLabel: 'Set the household payday',
      guideAnchor: 'projection',
    },
  },
  horizon: {
    pots: {
      sentence:
        'Horizon projects liquid funds — bank and cash pots only — so it starts from the pots you actually have.',
      actionLabel: 'Add the pots you actually have',
      guideAnchor: 'checkpoint',
    },
    checkpoints: {
      sentence:
        'It needs a balance checkpoint to start from: the figure you read from your bank or counted by hand, never a guess.',
      actionLabel: 'Record what each pot holds',
      guideAnchor: 'checkpoint',
    },
  },
  charts: {
    pots: {
      sentence:
        'The forecast chart draws liquid funds in bank and cash pots, so it starts from the pots you actually have.',
      actionLabel: 'Add the pots you actually have',
      guideAnchor: 'checkpoint',
    },
    checkpoints: {
      sentence:
        'The forecast needs a balance checkpoint to start the line: one figure per pot, read from your bank or counted by hand.',
      actionLabel: 'Record what each pot holds',
      guideAnchor: 'checkpoint',
    },
    purchases: {
      sentence:
        'The other four charts draw what the till recorded — the weekly shop, personal spending, where the money goes and the fixed bills.',
      actionLabel: 'Record your first purchase',
      guideAnchor: null,
    },
  },
  insights: {
    purchases: {
      sentence:
        'The month comparison and the honesty loop read recorded purchases — until the till has been used, there is nothing to compare.',
      actionLabel: 'Record your first purchase',
      guideAnchor: null,
    },
    figures: {
      sentence:
        'The honesty loop compares your configured weekly-shop and fuel figures with what actually happened — set them and the comparison has both sides.',
      actionLabel: 'Set the projection figures',
      guideAnchor: 'projection',
    },
  },
};

/**
 * The missing prerequisites for one payoff surface, in dependency order.
 * Empty when the page has everything it reads — the component then renders
 * nothing, so a complete household never sees the pattern.
 */
export function getPageNeeds(db: Db, page: PayoffPageId, nowArg?: Date): PageNeed[] {
  const path = getSetupPath(db, nowArg);
  const state = new Map(path.steps.map((entry) => [entry.id, entry.state]));
  const missing = PAGE_PREREQUISITES[page].filter((id) => state.get(id) !== 'done');
  // A checkpoint needs a pot to be recorded against: while the pots step
  // itself is open, its need already says what to do first, and a second
  // “record a checkpoint” line would point at an empty form.
  const pruned = missing.includes('pots') ? missing.filter((id) => id !== 'checkpoints') : missing;
  return pruned.map((id) => {
    const copy = NEED_COPY[page][id];
    if (copy === undefined) throw new Error(`no need copy for ${page}/${id}`);
    return {
      id,
      sentence: copy.sentence,
      actionHref: `/start#setup-${id}`,
      actionLabel: copy.actionLabel,
      guideAnchor: copy.guideAnchor,
    };
  });
}
