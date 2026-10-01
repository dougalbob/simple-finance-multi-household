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
