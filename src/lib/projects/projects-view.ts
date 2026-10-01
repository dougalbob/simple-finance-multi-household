import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { projects } from '../db/schema';
import { formatPence } from '../money';
import {
  budgetComparison,
  lineCost,
  orderBreakdown,
  type BudgetComparison,
  type BudgetState,
  type QuotePricing,
} from './costing';
import {
  listProjectItems,
  listProjectQuotes,
  listProjectSuppliers,
  listProjects,
  toCostingItems,
  toCostingQuotes,
  toCostingSuppliers,
  type CostFrequency,
  type FulfilmentChoice,
  type ProjectMode,
  type ProjectStatus,
} from './projects';

/**
 * Projects as the pages show them (PROJECTS_IMPLEMENTATION.MD §5). Plain
 * serialisable data with display labels precomputed on the server (the
 * tasks-view pattern): client components receive strings to print and ids to
 * post back, never database rows or live calculation responsibilities.
 */

export interface ProjectListRow {
  id: number;
  name: string;
  projectMode: ProjectMode;
  modeLabel: string;
  status: ProjectStatus;
  statusLabel: string;
  targetBudgetLabel: string | null;
  grandTotalLabel: string;
  budgetState: BudgetState;
  budgetNote: string | null;
  itemCount: number;
  supplierCount: number;
  quoteCount: number;
  /** `4 items · 3 suppliers · 9 quotes` — the matrix size at a glance. */
  sizeLabel: string;
}

export interface ProjectsPageView {
  rows: ProjectListRow[];
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  researching: 'Researching',
  ready_to_order: 'Ready to order',
  completed: 'Completed',
};

export const PROJECT_MODE_LABELS: Record<ProjectMode, string> = {
  mix_and_match: 'Mix & match',
  compare_options: 'Compare options',
};

export const COST_FREQUENCY_LABELS: Record<CostFrequency, string> = {
  one_off: 'One-off',
  annual: 'Annual',
  monthly: 'Monthly',
};

/** Words for the budget verdict — words first, colour second (SPEC §16.7). */
export function budgetNoteFor(comparison: BudgetComparison): string | null {
  if (comparison.state === 'none' || comparison.deltaPence === null) return null;
  const delta = formatPence(Math.abs(comparison.deltaPence));
  switch (comparison.state) {
    case 'under':
      return `${delta} under budget`;
    case 'on':
      return 'On budget';
    case 'over':
      return `${delta} over budget`;
    default:
      return null;
  }
}

export function getProjectsPageView(db: Db): ProjectsPageView {
  const rows = listProjects(db).map((project): ProjectListRow => {
    const items = listProjectItems(db, project.id);
    const suppliers = listProjectSuppliers(db, project.id);
    const quotes = listProjectQuotes(db, project.id);
    const totals = orderBreakdown(
      toCostingItems(items),
      toCostingSuppliers(suppliers),
      toCostingQuotes(quotes),
    );
    const comparison = budgetComparison(project.targetBudgetPence, totals.grandTotalPence);
    return {
      id: project.id,
      name: project.name,
      projectMode: project.projectMode,
      modeLabel: PROJECT_MODE_LABELS[project.projectMode],
      status: project.status,
      statusLabel: PROJECT_STATUS_LABELS[project.status],
      targetBudgetLabel:
        project.targetBudgetPence === null ? null : formatPence(project.targetBudgetPence),
      grandTotalLabel: formatPence(totals.grandTotalPence),
      budgetState: comparison.state,
      budgetNote: budgetNoteFor(comparison),
      itemCount: items.length,
      supplierCount: suppliers.length,
      quoteCount: quotes.length,
      sizeLabel:
        `${items.length} ${items.length === 1 ? 'item' : 'items'} · ` +
        `${suppliers.length} ${suppliers.length === 1 ? 'supplier' : 'suppliers'} · ` +
        `${quotes.length} ${quotes.length === 1 ? 'quote' : 'quotes'}`,
    };
  });
  return { rows };
}

// ---------------------------------------------------------------------------
// The workspace page
// ---------------------------------------------------------------------------

export interface SupplierColumnView {
  id: number;
  name: string;
  phone: string | null;
  websiteUrl: string | null;
  notes: string | null;
  deliveryFeePence: number;
  deliveryFeeLabel: string;
  freeDeliveryThresholdPence: number | null;
  freeDeliveryThresholdLabel: string | null;
  clickAndCollectAvailable: boolean;
  fulfilmentChoice: FulfilmentChoice;
  version: number;
}

export interface QuoteCellView {
  /** false = the empty "not stocked" cell. */
  hasQuote: boolean;
  quoteId: number | null;
  /** `£12.50 each` or `pack of 10 @ £29.50`. */
  priceLabel: string;
  /** `= £125.00` for the row's required quantity. */
  lineCostLabel: string;
  lineCostPence: number;
  productUrl: string | null;
  inStock: boolean;
  notes: string | null;
  version: number | null;
  /** Raw pricing for the inline edit form (pence / whole pack size). */
  unitPricePence: number | null;
  packSize: number | null;
  packPricePence: number | null;
}

export interface MatrixRowView {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  quantityLabel: string;
  category: string | null;
  notes: string | null;
  costFrequency: CostFrequency;
  selectedSupplierId: number | null;
  version: number;
  cells: Record<number, QuoteCellView>;
}

export interface BreakdownLineView {
  itemId: number;
  itemName: string;
  quantityLabel: string;
  lineCostLabel: string;
  productUrl: string | null;
  inStock: boolean;
}

export interface SupplierGroupView {
  supplierId: number;
  supplierName: string;
  phone: string | null;
  websiteUrl: string | null;
  lines: BreakdownLineView[];
  materialsSubtotalLabel: string;
  /** `Delivery £10.00`, `Free delivery (over £250)`, `Click & Collect — £0`, `Free delivery`. */
  deliveryLabel: string;
  /** `£35.20 away from free delivery` or null. */
  deliveryHint: string | null;
  supplierTotalLabel: string;
}

export interface ProjectWorkspaceView {
  project: {
    id: number;
    name: string;
    projectMode: ProjectMode;
    modeLabel: string;
    status: ProjectStatus;
    statusLabel: string;
    notes: string | null;
    targetBudgetPence: number | null;
    targetBudgetLabel: string | null;
    version: number;
  };
  suppliers: SupplierColumnView[];
  rows: MatrixRowView[];
  groups: SupplierGroupView[];
  unselectedCount: number;
  totals: {
    materialsTotalLabel: string;
    deliveryTotalLabel: string;
    grandTotalLabel: string;
    budgetState: BudgetState;
    budgetNote: string | null;
    /** `Materials £942.00 + delivery £25.00` — the footer's arithmetic. */
    summaryLabel: string;
  };
  /** True when nothing is entered yet — the empty-state hint. */
  isEmpty: boolean;
}

function quotePricingLabel(quote: QuotePricing): string {
  if (quote.packSize !== null && quote.packPricePence !== null) {
    return `pack of ${quote.packSize} @ ${formatPence(quote.packPricePence)}`;
  }
  if (quote.unitPricePence !== null) return `${formatPence(quote.unitPricePence)} each`;
  return '—';
}

function deliveryLabelFor(
  group: ReturnType<typeof orderBreakdown>['groups'][number],
  freeDeliveryThresholdPence: number | null,
): string {
  switch (group.delivery.status) {
    case 'collect':
      return 'Click & Collect — £0.00';
    case 'free-threshold':
      return `Free delivery (over ${formatPence(freeDeliveryThresholdPence ?? 0)})`;
    case 'free':
      return 'Free delivery';
    case 'charged':
      return `Delivery ${formatPence(group.delivery.deliveryPence)}`;
    default:
      return '';
  }
}

export function getProjectWorkspaceView(db: Db, projectId: number): ProjectWorkspaceView | null {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (project === undefined) return null;
  const items = listProjectItems(db, projectId);
  const suppliers = listProjectSuppliers(db, projectId);
  const quotes = listProjectQuotes(db, projectId);

  const totals = orderBreakdown(
    toCostingItems(items),
    toCostingSuppliers(suppliers),
    toCostingQuotes(quotes),
  );
  const comparison = budgetComparison(project.targetBudgetPence, totals.grandTotalPence);

  const cellByPair = new Map<string, (typeof quotes)[number]>();
  for (const quote of quotes) cellByPair.set(`${quote.itemId}:${quote.supplierId}`, quote);

  const rows: MatrixRowView[] = items.map((item) => {
    const cells: Record<number, QuoteCellView> = {};
    for (const supplier of suppliers) {
      const quote = cellByPair.get(`${item.id}:${supplier.id}`);
      if (quote === undefined) {
        cells[supplier.id] = {
          hasQuote: false,
          quoteId: null,
          priceLabel: '',
          lineCostLabel: '',
          lineCostPence: 0,
          productUrl: null,
          inStock: true,
          notes: null,
          version: null,
          unitPricePence: null,
          packSize: null,
          packPricePence: null,
        };
        continue;
      }
      const cost = lineCost(item.quantity, quote);
      cells[supplier.id] = {
        hasQuote: true,
        quoteId: quote.id,
        priceLabel: quotePricingLabel(quote),
        lineCostLabel: cost === null ? '—' : formatPence(cost.lineCostPence),
        lineCostPence: cost === null ? 0 : cost.lineCostPence,
        productUrl: quote.productUrl,
        inStock: quote.inStock,
        notes: quote.notes,
        version: quote.version,
        unitPricePence: quote.unitPricePence,
        packSize: quote.packSize,
        packPricePence: quote.packPricePence,
      };
    }
    return {
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      quantityLabel: `${item.quantity} ${item.unit}`,
      category: item.category,
      notes: item.notes,
      costFrequency: item.costFrequency,
      selectedSupplierId: item.selectedSupplierId,
      version: item.version,
      cells,
    };
  });

  const groups: SupplierGroupView[] = totals.groups.map((group) => ({
    supplierId: group.supplier.supplierId,
    supplierName: group.supplier.name,
    phone: group.supplier.phone,
    websiteUrl: group.supplier.websiteUrl,
    lines: group.lines.map((line) => ({
      itemId: line.itemId,
      itemName: line.itemName,
      quantityLabel: `${line.quantity} ${line.unit}`,
      lineCostLabel: formatPence(line.lineCostPence),
      productUrl: line.productUrl,
      inStock: line.inStock,
    })),
    materialsSubtotalLabel: formatPence(group.materialsSubtotalPence),
    deliveryLabel: deliveryLabelFor(group, group.supplier.freeDeliveryThresholdPence),
    deliveryHint:
      group.delivery.shortfallToFreeDeliveryPence === null
        ? null
        : `${formatPence(group.delivery.shortfallToFreeDeliveryPence)} away from free delivery`,
    supplierTotalLabel: formatPence(group.supplierTotalPence),
  }));

  return {
    project: {
      id: project.id,
      name: project.name,
      projectMode: project.projectMode,
      modeLabel: PROJECT_MODE_LABELS[project.projectMode],
      status: project.status,
      statusLabel: PROJECT_STATUS_LABELS[project.status],
      notes: project.notes,
      targetBudgetPence: project.targetBudgetPence,
      targetBudgetLabel:
        project.targetBudgetPence === null ? null : formatPence(project.targetBudgetPence),
      version: project.version,
    },
    suppliers: suppliers.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      websiteUrl: supplier.websiteUrl,
      notes: supplier.notes,
      deliveryFeePence: supplier.deliveryFeePence,
      deliveryFeeLabel: formatPence(supplier.deliveryFeePence),
      freeDeliveryThresholdPence: supplier.freeDeliveryThresholdPence,
      freeDeliveryThresholdLabel:
        supplier.freeDeliveryThresholdPence === null
          ? null
          : formatPence(supplier.freeDeliveryThresholdPence),
      clickAndCollectAvailable: supplier.clickAndCollectAvailable,
      fulfilmentChoice: supplier.fulfilmentChoice,
      version: supplier.version,
    })),
    rows,
    groups,
    unselectedCount: totals.unselected.length,
    totals: {
      materialsTotalLabel: formatPence(totals.materialsTotalPence),
      deliveryTotalLabel: formatPence(totals.deliveryTotalPence),
      grandTotalLabel: formatPence(totals.grandTotalPence),
      budgetState: comparison.state,
      budgetNote: budgetNoteFor(comparison),
      summaryLabel: `Materials ${formatPence(totals.materialsTotalPence)} + delivery ${formatPence(totals.deliveryTotalPence)}`,
    },
    isEmpty: items.length === 0 && suppliers.length === 0,
  };
}
