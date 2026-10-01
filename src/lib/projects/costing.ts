import { roundHalfUpDivide } from '../money';

/**
 * Pure costing for Projects (PROJECTS_IMPLEMENTATION.MD §6, SPEC §27).
 *
 * Framework-free, database-free, integer-pence only: line costs (including
 * pack-size rounding), per-supplier delivery evaluation (flat fee once per
 * used supplier, free-delivery threshold, click &amp; collect override, "£X away
 * from free delivery" shortfall) and the grouped order breakdown with grand
 * totals. The UI, the server actions and (in Phase 2) the cheapest-combination
 * optimiser all call this module — nothing re-implements these rules.
 *
 * All functions are pure: same input, same output, no clock, no I/O.
 */

export type FulfilmentChoice = 'delivery' | 'collect';

/** The pricing part of a quote cell (project_quotes). */
export interface QuotePricing {
  unitPricePence: number | null;
  packSize: number | null;
  packPricePence: number | null;
}

export type LineCostKind = 'units' | 'packs';

export interface LineCost {
  kind: LineCostKind;
  /** Whole packs bought when kind is 'packs', else null. */
  packs: number | null;
  lineCostPence: number;
}

/** Whole packs needed to cover `quantity` at `packSize` per pack (ceil). */
export function requiredPacks(quantity: number, packSize: number): number {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new Error(`requiredPacks expects a whole quantity ≥ 1, received ${quantity}`);
  }
  if (!Number.isSafeInteger(packSize) || packSize < 1) {
    throw new Error(`requiredPacks expects a whole packSize ≥ 1, received ${packSize}`);
  }
  return Math.floor((quantity + packSize - 1) / packSize);
}

/**
 * The effective line cost for `quantity` units at this quote.
 *
 * Pack pricing wins when present (the supplier only sells packs): buy
 * `ceil(quantity / pack_size)` packs at `pack_price` each. Otherwise
 * `quantity × unit_price`. Returns null when the quote carries no usable
 * price (an empty cell).
 */
export function lineCost(quantity: number, quote: QuotePricing): LineCost | null {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new Error(`lineCost expects a whole quantity ≥ 1, received ${quantity}`);
  }
  if (quote.packSize !== null && quote.packPricePence !== null) {
    const packs = requiredPacks(quantity, quote.packSize);
    return { kind: 'packs', packs, lineCostPence: packs * quote.packPricePence };
  }
  if (quote.unitPricePence !== null) {
    return { kind: 'units', packs: null, lineCostPence: quantity * quote.unitPricePence };
  }
  return null;
}

/** True when the quote cell carries a usable price (unit or pack form). */
export function hasUsablePricing(quote: QuotePricing): boolean {
  return lineCost(1, quote) !== null;
}

/** The delivery rules half of a project supplier (project_suppliers). */
export interface DeliveryRule {
  deliveryFeePence: number;
  freeDeliveryThresholdPence: number | null;
  clickAndCollectAvailable: boolean;
  fulfilmentChoice: FulfilmentChoice;
}

export type DeliveryStatus =
  /** Set to Click &amp; Collect — delivery is £0. */
  | 'collect'
  /** Free delivery: the materials subtotal met the threshold. */
  | 'free-threshold'
  /** Free delivery: the supplier quotes no delivery fee. */
  | 'free'
  /** The flat delivery fee applies. */
  | 'charged';

export interface DeliveryCost {
  deliveryPence: number;
  status: DeliveryStatus;
  /**
   * Further materials spend at this supplier needed to reach free delivery,
   * in pence — set only when the fee is being charged and a threshold exists
   * just above the subtotal. The "£X away from free delivery" hint.
   */
  shortfallToFreeDeliveryPence: number | null;
}

/**
 * Delivery cost for one used supplier, given that supplier's materials
 * subtotal. Ordering 2+ items from the supplier still incurs the flat fee once
 * — callers evaluate this once per supplier, not per line. A supplier with no
 * selected items is not evaluated at all (no group, no fee).
 */
export function deliveryCost(materialsSubtotalPence: number, rule: DeliveryRule): DeliveryCost {
  if (!Number.isSafeInteger(materialsSubtotalPence) || materialsSubtotalPence < 0) {
    throw new Error(
      `deliveryCost expects a non-negative pence subtotal, received ${materialsSubtotalPence}`,
    );
  }
  if (rule.fulfilmentChoice === 'collect') {
    return { deliveryPence: 0, status: 'collect', shortfallToFreeDeliveryPence: null };
  }
  const threshold = rule.freeDeliveryThresholdPence;
  if (threshold !== null && materialsSubtotalPence >= threshold) {
    return { deliveryPence: 0, status: 'free-threshold', shortfallToFreeDeliveryPence: null };
  }
  if (rule.deliveryFeePence === 0) {
    return { deliveryPence: 0, status: 'free', shortfallToFreeDeliveryPence: null };
  }
  return {
    deliveryPence: rule.deliveryFeePence,
    status: 'charged',
    shortfallToFreeDeliveryPence: threshold === null ? null : threshold - materialsSubtotalPence,
  };
}

// ---------------------------------------------------------------------------
// Grouped order breakdown — the Supplier Shopping List
// ---------------------------------------------------------------------------

/** One row of the costing matrix (project_items), as the calc needs it. */
export interface CostingItem {
  itemId: number;
  name: string;
  quantity: number;
  unit: string;
  selectedSupplierId: number | null;
}

/** One column of the costing matrix (project_suppliers), as the calc needs it. */
export interface CostingSupplier extends DeliveryRule {
  supplierId: number;
  name: string;
  phone: string | null;
  websiteUrl: string | null;
}

/** One quote cell (project_quotes), as the calc needs it. */
export interface CostingQuote extends QuotePricing {
  itemId: number;
  supplierId: number;
  productUrl: string | null;
  inStock: boolean;
}

export interface BreakdownLine {
  itemId: number;
  itemName: string;
  unit: string;
  quantity: number;
  supplierId: number;
  cost: LineCost;
  lineCostPence: number;
  productUrl: string | null;
  inStock: boolean;
}

export interface SupplierGroup {
  supplier: CostingSupplier;
  lines: BreakdownLine[];
  materialsSubtotalPence: number;
  delivery: DeliveryCost;
  supplierTotalPence: number;
}

export interface UnselectedLine {
  itemId: number;
  itemName: string;
  quantity: number;
  unit: string;
}

export interface ProjectTotals {
  /** One group per used supplier (a supplier with ≥1 selected line). */
  groups: SupplierGroup[];
  /** Rows still without a selection — ordered as the items arrive. */
  unselected: UnselectedLine[];
  materialsTotalPence: number;
  deliveryTotalPence: number;
  grandTotalPence: number;
  itemCount: number;
  selectedCount: number;
}

function quoteFor(
  quotes: readonly CostingQuote[],
  itemId: number,
  supplierId: number,
): CostingQuote | null {
  for (const quote of quotes) {
    if (quote.itemId === itemId && quote.supplierId === supplierId) return quote;
  }
  return null;
}

/**
 * Group the current manual selection by supplier and total it:
 * materials subtotals, one delivery evaluation per used supplier, supplier
 * totals, and the project grand total. A selection whose quote has been
 * deleted (or never existed) counts as unselected — the domain clears those,
 * but the calc never trusts stale state.
 */
export function orderBreakdown(
  items: readonly CostingItem[],
  suppliers: readonly CostingSupplier[],
  quotes: readonly CostingQuote[],
): ProjectTotals {
  const supplierById = new Map<number, CostingSupplier>();
  for (const supplier of suppliers) supplierById.set(supplier.supplierId, supplier);

  const groupedLines = new Map<number, BreakdownLine[]>();
  const unselected: UnselectedLine[] = [];

  for (const item of items) {
    const supplierId = item.selectedSupplierId;
    if (supplierId === null) {
      unselected.push({
        itemId: item.itemId,
        itemName: item.name,
        quantity: item.quantity,
        unit: item.unit,
      });
      continue;
    }
    const supplier = supplierById.get(supplierId);
    const quote = supplier === undefined ? null : quoteFor(quotes, item.itemId, supplierId);
    const cost = quote === null ? null : lineCost(item.quantity, quote);
    if (supplier === undefined || quote === null || cost === null) {
      unselected.push({
        itemId: item.itemId,
        itemName: item.name,
        quantity: item.quantity,
        unit: item.unit,
      });
      continue;
    }
    const line: BreakdownLine = {
      itemId: item.itemId,
      itemName: item.name,
      unit: item.unit,
      quantity: item.quantity,
      supplierId,
      cost,
      lineCostPence: cost.lineCostPence,
      productUrl: quote.productUrl,
      inStock: quote.inStock,
    };
    const bucket = groupedLines.get(supplierId);
    if (bucket === undefined) groupedLines.set(supplierId, [line]);
    else bucket.push(line);
  }

  const groups: SupplierGroup[] = [];
  let materialsTotalPence = 0;
  let deliveryTotalPence = 0;
  for (const supplier of suppliers) {
    const lines = groupedLines.get(supplier.supplierId);
    if (lines === undefined || lines.length === 0) continue; // unused: no fee
    let materialsSubtotalPence = 0;
    for (const line of lines) materialsSubtotalPence += line.lineCostPence;
    const delivery = deliveryCost(materialsSubtotalPence, supplier);
    materialsTotalPence += materialsSubtotalPence;
    deliveryTotalPence += delivery.deliveryPence;
    groups.push({
      supplier,
      lines,
      materialsSubtotalPence,
      delivery,
      supplierTotalPence: materialsSubtotalPence + delivery.deliveryPence,
    });
  }

  return {
    groups,
    unselected,
    materialsTotalPence,
    deliveryTotalPence,
    grandTotalPence: materialsTotalPence + deliveryTotalPence,
    itemCount: items.length,
    selectedCount: items.length - unselected.length,
  };
}

// ---------------------------------------------------------------------------
// Budget comparison
// ---------------------------------------------------------------------------

export type BudgetState = 'none' | 'under' | 'on' | 'over';

export interface BudgetComparison {
  state: BudgetState;
  /** grand − budget; positive = over budget. Null when no budget is set. */
  deltaPence: number | null;
}

/** Compare the grand total against the project's target budget (if set). */
export function budgetComparison(
  targetBudgetPence: number | null,
  grandTotalPence: number,
): BudgetComparison {
  if (targetBudgetPence === null) return { state: 'none', deltaPence: null };
  const deltaPence = grandTotalPence - targetBudgetPence;
  return {
    state: deltaPence > 0 ? 'over' : deltaPence < 0 ? 'under' : 'on',
    deltaPence,
  };
}

// ---------------------------------------------------------------------------
// VAT entry helper
// ---------------------------------------------------------------------------

/**
 * The "+20% VAT" typing helper (PROJECTS_IMPLEMENTATION.MD §4.1): builders'
 * merchants quote ex. VAT. Exact integer arithmetic — £10.00 becomes £12.00,
 * and one-pence oddities round half-up to the whole penny. The stored price is
 * always inc. VAT; this only helps type it in.
 */
export function addVatPence(pence: number): number {
  if (!Number.isSafeInteger(pence) || pence < 0) {
    throw new Error(`addVatPence expects a non-negative whole pence amount, received ${pence}`);
  }
  return roundHalfUpDivide(pence * 6, 5);
}

// ---------------------------------------------------------------------------
// The Cheapest Combination optimiser (Phase 2)
// ---------------------------------------------------------------------------

/**
 * The optimiser answers one question: *which supplier should each material
 * come from so the whole order — materials plus delivery — costs least?*
 * Delivery is what makes it more than "cheapest price per row": one flat fee
 * covers every line from a supplier, a free-delivery threshold can wipe the
 * fee out, so paying a little more per line to consolidate an order can win.
 *
 * Rules the optimiser follows (PROJECTS_IMPLEMENTATION.MD §7, OQ-P3):
 * - only **in-stock** quotes with a usable price are candidates (you cannot
 *   order what is not there) — `includeOutOfStock` switches that off;
 * - an item no supplier can supply is **uncoverable**: reported, left out of
 *   every plan, never blocks the rest;
 * - each supplier's delivery rule is applied as the household set it,
 *   including a Click & Collect choice (the fulfilment choice is an input,
 *   not something the optimiser flips);
 * - every plan is totalled by `orderBreakdown` — the same function the
 *   manual selection uses — so plan figures and applied figures agree.
 *
 * Method: stage 1 enumerates every non-empty supplier subset (2^S − 1) and,
 * within each, buys each item from its cheapest member. Per-row cheapest
 * inside a subset can miss "pay slightly more at B to cross B's threshold",
 * so stage 2 is an exact branch-and-bound over all item→supplier assignments
 * seeded with stage 1's best. Stage 2 proves optimality unless the project is
 * so large it exhausts its node budget; the result says which (`exact`).
 * Fully deterministic: no clock, no randomness; ties prefer fewer suppliers,
 * then the earlier supplier column.
 */

/** Past this many suppliers, stage 1 tries only the full set and each single. */
export const MAX_ENUMERATED_SUPPLIERS = 12;
/** Stage 2 node budget; beyond it the answer is the best found, flagged inexact. */
export const DEFAULT_OPTIMISER_NODE_BUDGET = 400_000;

export interface OptimiserOptions {
  /** Treat out-of-stock quotes as orderable. Default false (OQ-P3). */
  includeOutOfStock?: boolean;
  nodeBudget?: number;
}

export interface PlanAssignment {
  itemId: number;
  supplierId: number;
}

export interface OptimiserPlan {
  /** One entry per item the plan buys, in item order. */
  assignments: PlanAssignment[];
  /** The plan totalled exactly like a manual selection. */
  totals: ProjectTotals;
  /** Distinct suppliers the plan orders from. */
  supplierCount: number;
}

export interface SingleSupplierOption {
  supplierId: number;
  name: string;
  grandTotalPence: number;
}

export interface OptimiserResult {
  /** The cheapest split across suppliers; null when nothing is coverable. */
  split: OptimiserPlan | null;
  /** Cheapest single supplier that stocks every coverable item; null if none does. */
  singleSupplier: OptimiserPlan | null;
  /** Every single supplier that stocks everything, cheapest first. */
  singleSupplierOptions: SingleSupplierOption[];
  /** Each item at its lowest price ignoring delivery — the naive baseline. */
  cheapestPerItem: OptimiserPlan | null;
  /** Items with no orderable quote anywhere — skipped by every plan. */
  uncoverable: UnselectedLine[];
  /** Out-of-stock quotes passed over because the optimiser cannot order them. */
  skippedOutOfStockCount: number;
  /** True when the split is proven cheapest (stage 2 finished inside its budget). */
  exact: boolean;
  /** Supplier subsets examined by stage 1. */
  subsetsEvaluated: number;
}

interface SolverItem {
  item: CostingItem;
  /** Index of this item in the input array. */
  index: number;
  /** Orderable options, cheapest first (ties: earlier supplier column). */
  options: Array<{ supplierIndex: number; costPence: number }>;
}

/**
 * Compute the cheapest combination, the best single supplier and the naive
 * cheapest-per-row baseline for the current matrix. Pure; ignores whatever is
 * currently selected (`selectedSupplierId`).
 */
export function cheapestCombination(
  items: readonly CostingItem[],
  suppliers: readonly CostingSupplier[],
  quotes: readonly CostingQuote[],
  options: OptimiserOptions = {},
): OptimiserResult {
  const includeOutOfStock = options.includeOutOfStock === true;
  const nodeBudget = options.nodeBudget ?? DEFAULT_OPTIMISER_NODE_BUDGET;
  const supplierCount = suppliers.length;

  const supplierIndexById = new Map<number, number>();
  suppliers.forEach((supplier, index) => supplierIndexById.set(supplier.supplierId, index));
  const quoteByPair = new Map<string, CostingQuote>();
  for (const quote of quotes) quoteByPair.set(`${quote.itemId}:${quote.supplierId}`, quote);

  // ---- candidate options per item ----------------------------------------
  let skippedOutOfStockCount = 0;
  const solverItems: SolverItem[] = [];
  const uncoverable: UnselectedLine[] = [];
  items.forEach((item, index) => {
    const candidates: SolverItem['options'] = [];
    let skippedHere = 0;
    suppliers.forEach((supplier, supplierIndex) => {
      const quote = quoteByPair.get(`${item.itemId}:${supplier.supplierId}`);
      if (quote === undefined) return;
      const cost = lineCost(item.quantity, quote);
      if (cost === null) return;
      if (!quote.inStock && !includeOutOfStock) {
        skippedHere += 1;
        return;
      }
      candidates.push({ supplierIndex, costPence: cost.lineCostPence });
    });
    skippedOutOfStockCount += skippedHere;
    if (candidates.length === 0) {
      uncoverable.push({
        itemId: item.itemId,
        itemName: item.name,
        quantity: item.quantity,
        unit: item.unit,
      });
      return;
    }
    candidates.sort((a, b) => a.costPence - b.costPence || a.supplierIndex - b.supplierIndex);
    solverItems.push({ item, index, options: candidates });
  });

  const empty: OptimiserResult = {
    split: null,
    singleSupplier: null,
    singleSupplierOptions: [],
    cheapestPerItem: null,
    uncoverable,
    skippedOutOfStockCount,
    exact: true,
    subsetsEvaluated: 0,
  };
  if (solverItems.length === 0 || supplierCount === 0) return empty;

  // Dense cost table: cost[itemSlot][supplierIndex] (null = cannot supply).
  const table: Array<Array<number | null>> = solverItems.map((entry) => {
    const row: Array<number | null> = new Array<number | null>(supplierCount).fill(null);
    for (const option of entry.options) row[option.supplierIndex] = option.costPence;
    return row;
  });

  /** Total (materials + delivery) of a full assignment (supplier index per item slot). */
  function totalOf(assignment: readonly number[]): { total: number; used: number } {
    const subtotal: number[] = new Array<number>(supplierCount).fill(0);
    const count: number[] = new Array<number>(supplierCount).fill(0);
    assignment.forEach((supplierIndex, slot) => {
      subtotal[supplierIndex] =
        (subtotal[supplierIndex] ?? 0) + (table[slot]?.[supplierIndex] ?? 0);
      count[supplierIndex] = (count[supplierIndex] ?? 0) + 1;
    });
    let total = 0;
    let used = 0;
    for (let s = 0; s < supplierCount; s += 1) {
      if ((count[s] ?? 0) === 0) continue;
      const supplier = suppliers[s];
      if (supplier === undefined) continue;
      total += (subtotal[s] ?? 0) + deliveryCost(subtotal[s] ?? 0, supplier).deliveryPence;
      used += 1;
    }
    return { total, used };
  }

  // ---- stage 1: every supplier subset, cheapest member per item -----------
  const masks: number[] = [];
  if (supplierCount <= MAX_ENUMERATED_SUPPLIERS) {
    for (let mask = 1; mask < 2 ** supplierCount; mask += 1) masks.push(mask);
  } else {
    masks.push(2 ** supplierCount - 1);
    for (let s = 0; s < supplierCount; s += 1) masks.push(2 ** s);
  }
  // Bit tricks overflow past 31 suppliers — arithmetic on powers of two stays exact.
  const inMask = (mask: number, s: number): boolean => Math.floor(mask / 2 ** s) % 2 === 1;

  let best: { assignment: number[]; total: number; used: number } | null = null;
  let subsetsEvaluated = 0;
  for (const mask of masks) {
    subsetsEvaluated += 1;
    const assignment: number[] = [];
    let feasible = true;
    for (const entry of solverItems) {
      const pick = entry.options.find((option) => inMask(mask, option.supplierIndex));
      if (pick === undefined) {
        feasible = false;
        break;
      }
      assignment.push(pick.supplierIndex);
    }
    if (!feasible) continue;
    const { total, used } = totalOf(assignment);
    if (best === null || total < best.total || (total === best.total && used < best.used)) {
      best = { assignment, total, used };
    }
  }
  if (best === null) return empty; // unreachable: the full mask covers every coverable item

  // ---- stage 2: exact branch-and-bound, seeded with stage 1 ---------------
  const order = solverItems
    .map((entry, slot) => ({
      slot,
      spread:
        (entry.options[1]?.costPence ?? entry.options[0]?.costPence ?? 0) -
        (entry.options[0]?.costPence ?? 0),
    }))
    .sort((a, b) => b.spread - a.spread || a.slot - b.slot)
    .map((entry) => entry.slot);
  const suffixMin: number[] = new Array<number>(order.length + 1).fill(0);
  for (let depth = order.length - 1; depth >= 0; depth -= 1) {
    const slot = order[depth] ?? 0;
    suffixMin[depth] =
      (suffixMin[depth + 1] ?? 0) + (solverItems[slot]?.options[0]?.costPence ?? 0);
  }

  let bestTotal = best.total;
  let bestAssignment = best.assignment.slice();
  let nodes = 0;
  let aborted = false;
  const current: number[] = new Array<number>(solverItems.length).fill(-1);
  const subtotals: number[] = new Array<number>(supplierCount).fill(0);
  const counts: number[] = new Array<number>(supplierCount).fill(0);

  function visit(depth: number, materialsSoFar: number): void {
    if (aborted) return;
    nodes += 1;
    if (nodes > nodeBudget) {
      aborted = true;
      return;
    }
    if (materialsSoFar + (suffixMin[depth] ?? 0) >= bestTotal) return; // cannot beat the incumbent
    if (depth === order.length) {
      let total = 0;
      for (let s = 0; s < supplierCount; s += 1) {
        if ((counts[s] ?? 0) === 0) continue;
        const supplier = suppliers[s];
        if (supplier === undefined) continue;
        total += (subtotals[s] ?? 0) + deliveryCost(subtotals[s] ?? 0, supplier).deliveryPence;
      }
      if (total < bestTotal) {
        bestTotal = total;
        bestAssignment = current.slice();
      }
      return;
    }
    const slot = order[depth] ?? 0;
    const entry = solverItems[slot];
    if (entry === undefined) return;
    for (const option of entry.options) {
      const s = option.supplierIndex;
      current[slot] = s;
      subtotals[s] = (subtotals[s] ?? 0) + option.costPence;
      counts[s] = (counts[s] ?? 0) + 1;
      visit(depth + 1, materialsSoFar + option.costPence);
      subtotals[s] = (subtotals[s] ?? 0) - option.costPence;
      counts[s] = (counts[s] ?? 0) - 1;
      if (aborted) return;
    }
    current[slot] = -1;
  }
  visit(0, 0);

  // ---- single supplier + naive baseline -----------------------------------
  const singles: Array<SingleSupplierOption & { assignment: number[] }> = [];
  for (let s = 0; s < supplierCount; s += 1) {
    const supplier = suppliers[s];
    if (supplier === undefined) continue;
    if (!table.every((row) => row[s] !== null)) continue;
    const assignment = solverItems.map(() => s);
    singles.push({
      supplierId: supplier.supplierId,
      name: supplier.name,
      grandTotalPence: totalOf(assignment).total,
      assignment,
    });
  }
  singles.sort((a, b) => a.grandTotalPence - b.grandTotalPence);

  const naiveAssignment = solverItems.map((entry) => entry.options[0]?.supplierIndex ?? 0);

  function planFrom(assignment: readonly number[]): OptimiserPlan {
    const chosen = new Map<number, number>();
    assignment.forEach((supplierIndex, slot) => {
      const entry = solverItems[slot];
      const supplier = suppliers[supplierIndex];
      if (entry !== undefined && supplier !== undefined) {
        chosen.set(entry.item.itemId, supplier.supplierId);
      }
    });
    const overridden = items.map((item) => ({
      ...item,
      selectedSupplierId: chosen.get(item.itemId) ?? null,
    }));
    const totals = orderBreakdown(overridden, suppliers, quotes);
    const assignments: PlanAssignment[] = [];
    for (const item of items) {
      const supplierId = chosen.get(item.itemId);
      if (supplierId !== undefined) assignments.push({ itemId: item.itemId, supplierId });
    }
    return { assignments, totals, supplierCount: totals.groups.length };
  }

  const bestSingle = singles[0];
  return {
    split: planFrom(bestAssignment),
    singleSupplier: bestSingle === undefined ? null : planFrom(bestSingle.assignment),
    singleSupplierOptions: singles.map(({ supplierId, name, grandTotalPence }) => ({
      supplierId,
      name,
      grandTotalPence,
    })),
    cheapestPerItem: planFrom(naiveAssignment),
    uncoverable,
    skippedOutOfStockCount,
    exact: !aborted,
    subsetsEvaluated,
  };
}

/**
 * True when the current selection already is the plan: every item the plan
 * buys is selected at the plan's supplier. (Items the plan leaves alone —
 * the uncoverable ones — are ignored.)
 */
export function selectionMatchesPlan(
  items: readonly Pick<CostingItem, 'itemId' | 'selectedSupplierId'>[],
  plan: OptimiserPlan,
): boolean {
  const selected = new Map<number, number | null>();
  for (const item of items) selected.set(item.itemId, item.selectedSupplierId);
  return plan.assignments.every(
    (assignment) => selected.get(assignment.itemId) === assignment.supplierId,
  );
}
