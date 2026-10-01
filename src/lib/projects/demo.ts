import type { Db } from '../db/client';
import { eq } from 'drizzle-orm';
import { projects } from '../db/schema';
import {
  createProject,
  createProjectItem,
  createProjectSupplier,
  saveProjectQuote,
  selectProjectItemSupplier,
  type Project,
} from './projects';

/**
 * The Projects demo: a fictional but realistic **“Back Garden Fence
 * Replacement”** project (PROJECTS_IMPLEMENTATION.MD §5), all names, phone
 * numbers, links and prices invented (`.example` links, Ofcom fictional
 * numbers). It exists so the costing matrix is legible the first time the
 * page opens, and so integration tests have one shared, figure-exact
 * scenario to assert against.
 *
 * The fixture deliberately exercises every Phase 1 rule:
 * - a **sparse** cell (Local Timber Yard does not sell post mix);
 * - a **pack-only** quote (Wickes sells featheredge in packs of 10);
 * - an **out-of-stock** quote (Jewson's gravel boards);
 * - **free-delivery thresholds met and missed** (Jewson £300 and Timber Yard
 *   £500 met → free; Wickes £250 missed on £128.00 → £10.00 delivery with a
 *   "£122.00 away from free delivery" shortfall);
 * - a **mixed manual selection** across three suppliers;
 * - a **target budget** the current split sits under (£1,200 vs £1,083.50).
 *
 * Figures (inc. VAT, integer pence — asserted in tests/projects.test.ts):
 * Jewson £431.50 + Timber Yard £514.00 + Wickes £128.00 materials
 * = £1,073.50; delivery £10.00; grand total £1,083.50.
 */
export const FENCE_DEMO_PROJECT_NAME = 'Back Garden Fence Replacement';

export function seedFenceDemoProject(db: Db, actor: string, now: Date = new Date()): Project {
  const existing = db
    .select()
    .from(projects)
    .where(eq(projects.name, FENCE_DEMO_PROJECT_NAME))
    .get();
  if (existing !== undefined) return existing;

  const project = createProject(db, {
    name: FENCE_DEMO_PROJECT_NAME,
    projectMode: 'mix_and_match',
    targetBudgetPence: 120000,
    status: 'researching',
    notes:
      'Replace the 24m run of featheredge along the back boundary. Prices collected by phone and ' +
      'from each merchant’s website — all inc. VAT.',
    actor,
    now,
  });

  const timberYard = createProjectSupplier(db, {
    projectId: project.id,
    name: 'Local Timber Yard',
    phone: '01632 960111',
    websiteUrl: 'https://localtimberyard.example/',
    notes: 'Trade counter open 7:30–17:00 Mon–Sat. Ask for Dave re: bulk featheredge.',
    deliveryFeePence: 1500,
    freeDeliveryThresholdPence: 50000,
    clickAndCollectAvailable: true,
    fulfilmentChoice: 'delivery',
    actor,
    now,
  });
  const wickes = createProjectSupplier(db, {
    projectId: project.id,
    name: 'Wickes',
    phone: '01632 960222',
    websiteUrl: 'https://wickes.example/',
    deliveryFeePence: 1000,
    freeDeliveryThresholdPence: 25000,
    clickAndCollectAvailable: false,
    fulfilmentChoice: 'delivery',
    actor,
    now,
  });
  const jewson = createProjectSupplier(db, {
    projectId: project.id,
    name: 'Jewson',
    phone: '01632 960333',
    websiteUrl: 'https://jewson.example/',
    notes: 'Account delivery is one charge per order, whatever the number of lines.',
    deliveryFeePence: 4500,
    freeDeliveryThresholdPence: 30000,
    clickAndCollectAvailable: true,
    fulfilmentChoice: 'delivery',
    actor,
    now,
  });

  const posts = createProjectItem(db, {
    projectId: project.id,
    name: '8ft Concrete Slotted Post',
    quantity: 10,
    unit: 'each',
    category: 'Posts',
    actor,
    now,
  });
  const arris = createProjectItem(db, {
    projectId: project.id,
    name: '8ft Arris Rail',
    quantity: 20,
    unit: 'each',
    category: 'Timber',
    actor,
    now,
  });
  const featheredge = createProjectItem(db, {
    projectId: project.id,
    name: '6ft Featheredge Board',
    quantity: 120,
    unit: 'each',
    category: 'Timber',
    actor,
    now,
  });
  const gravelBoards = createProjectItem(db, {
    projectId: project.id,
    name: '8ft Gravel Board',
    quantity: 10,
    unit: 'each',
    category: 'Concrete',
    actor,
    now,
  });
  const postMix = createProjectItem(db, {
    projectId: project.id,
    name: 'Post Mix 20kg Bag',
    quantity: 20,
    unit: 'bag',
    category: 'Fixings',
    actor,
    now,
  });

  // Local Timber Yard — no post mix (the sparse cell).
  saveProjectQuote(db, {
    projectId: project.id,
    itemId: posts.id,
    supplierId: timberYard.id,
    unitPricePence: 2850,
    packSize: null,
    packPricePence: null,
    productUrl: 'https://localtimberyard.example/products/8ft-concrete-slotted-post',
    actor,
    now,
  });
  saveProjectQuote(db, {
    projectId: project.id,
    itemId: arris.id,
    supplierId: timberYard.id,
    unitPricePence: 875,
    packSize: null,
    packPricePence: null,
    productUrl: 'https://localtimberyard.example/products/8ft-arris-rail',
    actor,
    now,
  });
  saveProjectQuote(db, {
    projectId: project.id,
    itemId: featheredge.id,
    supplierId: timberYard.id,
    unitPricePence: 310,
    packSize: null,
    packPricePence: null,
    productUrl: 'https://localtimberyard.example/products/6ft-featheredge-board',
    actor,
    now,
  });
  saveProjectQuote(db, {
    projectId: project.id,
    itemId: gravelBoards.id,
    supplierId: timberYard.id,
    unitPricePence: 1420,
    packSize: null,
    packPricePence: null,
    productUrl: 'https://localtimberyard.example/products/8ft-gravel-board',
    actor,
    now,
  });

  // Wickes — featheredge sold only in packs of 10.
  saveProjectQuote(db, {
    projectId: project.id,
    itemId: posts.id,
    supplierId: wickes.id,
    unitPricePence: 3200,
    packSize: null,
    packPricePence: null,
    productUrl: 'https://wickes.example/products/8ft-concrete-slotted-post',
    actor,
    now,
  });
  saveProjectQuote(db, {
    projectId: project.id,
    itemId: arris.id,
    supplierId: wickes.id,
    unitPricePence: 950,
    packSize: null,
    packPricePence: null,
    productUrl: 'https://wickes.example/products/8ft-arris-rail',
    actor,
    now,
  });
  saveProjectQuote(db, {
    projectId: project.id,
    itemId: featheredge.id,
    supplierId: wickes.id,
    unitPricePence: null,
    packSize: 10,
    packPricePence: 2950,
    productUrl: 'https://wickes.example/products/6ft-featheredge-board-10-pack',
    actor,
    now,
  });
  saveProjectQuote(db, {
    projectId: project.id,
    itemId: gravelBoards.id,
    supplierId: wickes.id,
    unitPricePence: 1600,
    packSize: null,
    packPricePence: null,
    productUrl: 'https://wickes.example/products/8ft-gravel-board',
    actor,
    now,
  });
  saveProjectQuote(db, {
    projectId: project.id,
    itemId: postMix.id,
    supplierId: wickes.id,
    unitPricePence: 640,
    packSize: null,
    packPricePence: null,
    productUrl: 'https://wickes.example/products/post-mix-20kg',
    actor,
    now,
  });

  // Jewson — gravel boards currently out of stock.
  saveProjectQuote(db, {
    projectId: project.id,
    itemId: posts.id,
    supplierId: jewson.id,
    unitPricePence: 2675,
    packSize: null,
    packPricePence: null,
    productUrl: 'https://jewson.example/products/8ft-concrete-slotted-post',
    actor,
    now,
  });
  saveProjectQuote(db, {
    projectId: project.id,
    itemId: arris.id,
    supplierId: jewson.id,
    unitPricePence: 820,
    packSize: null,
    packPricePence: null,
    productUrl: 'https://jewson.example/products/8ft-arris-rail',
    actor,
    now,
  });
  saveProjectQuote(db, {
    projectId: project.id,
    itemId: featheredge.id,
    supplierId: jewson.id,
    unitPricePence: 295,
    packSize: null,
    packPricePence: null,
    productUrl: 'https://jewson.example/products/6ft-featheredge-board',
    actor,
    now,
  });
  saveProjectQuote(db, {
    projectId: project.id,
    itemId: gravelBoards.id,
    supplierId: jewson.id,
    unitPricePence: 1350,
    packSize: null,
    packPricePence: null,
    productUrl: 'https://jewson.example/products/8ft-gravel-board',
    inStock: false,
    actor,
    now,
  });
  saveProjectQuote(db, {
    projectId: project.id,
    itemId: postMix.id,
    supplierId: jewson.id,
    unitPricePence: 595,
    packSize: null,
    packPricePence: null,
    productUrl: 'https://jewson.example/products/post-mix-20kg',
    actor,
    now,
  });

  // The manual selection the demo opens with: mixed across all three, with
  // Jewson and the Timber Yard crossing their free-delivery thresholds and
  // Wickes carrying one charged delivery on £128.00 of post mix.
  selectProjectItemSupplier(db, { itemId: posts.id, supplierId: jewson.id, actor, now });
  selectProjectItemSupplier(db, { itemId: arris.id, supplierId: jewson.id, actor, now });
  selectProjectItemSupplier(db, {
    itemId: featheredge.id,
    supplierId: timberYard.id,
    actor,
    now,
  });
  selectProjectItemSupplier(db, {
    itemId: gravelBoards.id,
    supplierId: timberYard.id,
    actor,
    now,
  });
  selectProjectItemSupplier(db, { itemId: postMix.id, supplierId: wickes.id, actor, now });

  return project;
}
