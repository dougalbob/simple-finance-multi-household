import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { auditEntries, projectQuotes, projects } from '../src/lib/db/schema';
import { openDatabase, type DbHandle } from '../src/lib/db/client';
import { applyMigrations } from '../src/lib/db/migrate';
import { VersionConflictError } from '../src/lib/records/errors';
import { budgetComparison, orderBreakdown } from '../src/lib/projects/costing';
import { seedFenceDemoProject, FENCE_DEMO_PROJECT_NAME } from '../src/lib/projects/demo';
import {
  createProject,
  createProjectItem,
  createProjectSupplier,
  deleteProject,
  deleteProjectItem,
  deleteProjectQuote,
  deleteProjectSupplier,
  editProject,
  editProjectSupplier,
  InvalidProjectInputError,
  listProjectItems,
  listProjectQuotes,
  listProjectSuppliers,
  saveProjectQuote,
  selectProjectItemSupplier,
  toCostingItems,
  toCostingQuotes,
  toCostingSuppliers,
} from '../src/lib/projects/projects';
import { getProjectWorkspaceView, getProjectsPageView } from '../src/lib/projects/projects-view';
import { makeTempDir } from './helpers';

/**
 * Projects — the domain and the workspace assembly (SPEC §27,
 * PROJECTS_IMPLEMENTATION.MD). Standing rules on planning records: version
 * counters on every mutable row, audit entries in the same transaction, and a
 * selection that always points at a quote which exists. The fence demo is the
 * figure-exact scenario the costing module's rules are asserted against.
 */

const ACTOR = 'alex@example.com';
const NOW = new Date('2026-10-01T09:00:00Z');

async function fixture(): Promise<DbHandle> {
  const dir = await makeTempDir('sf-projects-');
  const handle = openDatabase(path.join(dir, 'projects.sqlite'));
  applyMigrations(handle.db);
  return handle;
}

function auditFor(handle: DbHandle, entity: string, entityId: number) {
  return handle.db
    .select()
    .from(auditEntries)
    .all()
    .filter((row) => row.entity === entity && row.entityId === String(entityId));
}

describe('projects domain', () => {
  it('creates, edits (with version checks) and deletes a project, audited', async () => {
    const handle = await fixture();
    const project = createProject(handle.db, {
      name: '  Back Garden Fence Replacement  ',
      targetBudgetPence: 120000,
      status: 'researching',
      notes: '  24m run  ',
      actor: ACTOR,
      now: NOW,
    });
    assert.equal(project.name, 'Back Garden Fence Replacement'); // trimmed
    assert.equal(project.projectMode, 'mix_and_match');
    assert.equal(project.targetBudgetPence, 120000);
    assert.equal(auditFor(handle, 'project', project.id).length, 1);

    const edited = editProject(handle.db, {
      id: project.id,
      expectedVersion: project.version,
      patch: {
        name: 'Back Garden Fence Replacement',
        projectMode: 'mix_and_match',
        targetBudgetPence: 110000,
        status: 'ready_to_order',
        notes: null,
      },
      actor: ACTOR,
      now: NOW,
    });
    assert.equal(edited.version, 2);
    assert.equal(edited.targetBudgetPence, 110000);
    assert.equal(edited.status, 'ready_to_order');

    // A stale form (old version) fails visibly.
    assert.throws(
      () =>
        editProject(handle.db, {
          id: project.id,
          expectedVersion: 1,
          patch: {
            name: 'Nope',
            projectMode: 'mix_and_match',
            targetBudgetPence: null,
            status: 'researching',
            notes: null,
          },
          actor: ACTOR,
          now: NOW,
        }),
      VersionConflictError,
    );

    createProjectItem(handle.db, {
      projectId: project.id,
      name: '8ft Concrete Slotted Post',
      quantity: 10,
      actor: ACTOR,
      now: NOW,
    });
    const supplier = createProjectSupplier(handle.db, {
      projectId: project.id,
      name: 'Jewson',
      actor: ACTOR,
      now: NOW,
    });
    saveProjectQuote(handle.db, {
      projectId: project.id,
      itemId: listProjectItems(handle.db, project.id)[0]!.id,
      supplierId: supplier.id,
      unitPricePence: 2675,
      packSize: null,
      packPricePence: null,
      actor: ACTOR,
      now: NOW,
    });

    deleteProject(handle.db, { id: project.id, expectedVersion: 2, actor: ACTOR, now: NOW });
    assert.equal(handle.db.select().from(projects).all().length, 0);
    assert.equal(handle.db.select().from(projectQuotes).all().length, 0);
    const deletion = auditFor(handle, 'project', project.id).find(
      (row) => row.action === 'project.delete',
    );
    assert.match(deletion?.summary ?? '', /Deleted project .*1 item.*1 supplier.*1 quote/);
    handle.raw.close();
  });

  it('rejects nonsense input at the domain boundary', async () => {
    const handle = await fixture();
    const project = createProject(handle.db, { name: 'X', actor: ACTOR, now: NOW });
    assert.throws(
      () => createProject(handle.db, { name: '   ', actor: ACTOR, now: NOW }),
      InvalidProjectInputError,
    );
    assert.throws(
      () =>
        createProject(handle.db, {
          name: 'Y',
          targetBudgetPence: -1,
          actor: ACTOR,
          now: NOW,
        }),
      InvalidProjectInputError,
    );
    assert.throws(
      () =>
        createProjectItem(handle.db, {
          projectId: project.id,
          name: 'Board',
          quantity: 0,
          actor: ACTOR,
          now: NOW,
        }),
      InvalidProjectInputError,
    );
    assert.throws(
      () =>
        createProjectSupplier(handle.db, {
          projectId: project.id,
          name: 'Wickes',
          freeDeliveryThresholdPence: 0,
          actor: ACTOR,
          now: NOW,
        }),
      InvalidProjectInputError,
    );
    // collect without click & collect available is refused.
    assert.throws(
      () =>
        createProjectSupplier(handle.db, {
          projectId: project.id,
          name: 'Wickes',
          clickAndCollectAvailable: false,
          fulfilmentChoice: 'collect',
          actor: ACTOR,
          now: NOW,
        }),
      InvalidProjectInputError,
    );
    handle.raw.close();
  });

  it('only suppliers with a quote can be selected, and deleting the quote clears the pick', async () => {
    const handle = await fixture();
    const project = createProject(handle.db, { name: 'P', actor: ACTOR, now: NOW });
    const item = createProjectItem(handle.db, {
      projectId: project.id,
      name: 'Post',
      quantity: 1,
      actor: ACTOR,
      now: NOW,
    });
    const supplier = createProjectSupplier(handle.db, {
      projectId: project.id,
      name: 'Yard',
      actor: ACTOR,
      now: NOW,
    });

    // No quote yet — the empty cell is not stock.
    assert.throws(
      () =>
        selectProjectItemSupplier(handle.db, {
          itemId: item.id,
          supplierId: supplier.id,
          actor: ACTOR,
          now: NOW,
        }),
      InvalidProjectInputError,
    );

    saveProjectQuote(handle.db, {
      projectId: project.id,
      itemId: item.id,
      supplierId: supplier.id,
      unitPricePence: 2850,
      packSize: null,
      packPricePence: null,
      actor: ACTOR,
      now: NOW,
    });
    const selected = selectProjectItemSupplier(handle.db, {
      itemId: item.id,
      supplierId: supplier.id,
      actor: ACTOR,
      now: NOW,
    });
    assert.equal(selected.selectedSupplierId, supplier.id);
    assert.equal(selected.version, 2); // create v1 → select v2

    // Removing the quote clears the selection in the same transaction.
    deleteProjectQuote(handle.db, {
      projectId: project.id,
      itemId: item.id,
      supplierId: supplier.id,
      actor: ACTOR,
      now: NOW,
    });
    const after = listProjectItems(handle.db, project.id)[0]!;
    assert.equal(after.selectedSupplierId, null);
    assert.equal(after.version, 3);
    handle.raw.close();
  });

  it('deleting a supplier clears the rows that pointed at it and takes its quotes', async () => {
    const handle = await fixture();
    const project = createProject(handle.db, { name: 'P', actor: ACTOR, now: NOW });
    const item = createProjectItem(handle.db, {
      projectId: project.id,
      name: 'Post',
      quantity: 1,
      actor: ACTOR,
      now: NOW,
    });
    const supplier = createProjectSupplier(handle.db, {
      projectId: project.id,
      name: 'Yard',
      actor: ACTOR,
      now: NOW,
    });
    saveProjectQuote(handle.db, {
      projectId: project.id,
      itemId: item.id,
      supplierId: supplier.id,
      unitPricePence: 100,
      packSize: null,
      packPricePence: null,
      actor: ACTOR,
      now: NOW,
    });
    selectProjectItemSupplier(handle.db, {
      itemId: item.id,
      supplierId: supplier.id,
      actor: ACTOR,
      now: NOW,
    });

    deleteProjectSupplier(handle.db, {
      id: supplier.id,
      expectedVersion: 1,
      actor: ACTOR,
      now: NOW,
    });
    assert.equal(listProjectQuotes(handle.db, project.id).length, 0);
    assert.equal(listProjectItems(handle.db, project.id)[0]!.selectedSupplierId, null);
    handle.raw.close();
  });

  it('rejects a quote whose item and supplier are not in the same project', async () => {
    const handle = await fixture();
    const a = createProject(handle.db, { name: 'A', actor: ACTOR, now: NOW });
    const b = createProject(handle.db, { name: 'B', actor: ACTOR, now: NOW });
    const item = createProjectItem(handle.db, {
      projectId: a.id,
      name: 'Post',
      quantity: 1,
      actor: ACTOR,
      now: NOW,
    });
    const supplier = createProjectSupplier(handle.db, {
      projectId: b.id,
      name: 'Yard',
      actor: ACTOR,
      now: NOW,
    });
    assert.throws(
      () =>
        saveProjectQuote(handle.db, {
          projectId: a.id,
          itemId: item.id,
          supplierId: supplier.id,
          unitPricePence: 100,
          packSize: null,
          packPricePence: null,
          actor: ACTOR,
          now: NOW,
        }),
      InvalidProjectInputError,
    );
    handle.raw.close();
  });

  it('editing a supplier enforces version and the collect rule', async () => {
    const handle = await fixture();
    const project = createProject(handle.db, { name: 'P', actor: ACTOR, now: NOW });
    const supplier = createProjectSupplier(handle.db, {
      projectId: project.id,
      name: 'Yard',
      deliveryFeePence: 1500,
      actor: ACTOR,
      now: NOW,
    });
    const updated = editProjectSupplier(handle.db, {
      id: supplier.id,
      expectedVersion: 1,
      patch: {
        name: 'Yard',
        phone: null,
        websiteUrl: 'https://yard.example/',
        notes: null,
        deliveryFeePence: 0,
        freeDeliveryThresholdPence: 25000,
        clickAndCollectAvailable: true,
        fulfilmentChoice: 'collect',
      },
      actor: ACTOR,
      now: NOW,
    });
    assert.equal(updated.fulfilmentChoice, 'collect');
    assert.equal(updated.version, 2);
    assert.throws(
      () =>
        editProjectSupplier(handle.db, {
          id: supplier.id,
          expectedVersion: 1,
          patch: {
            name: 'Yard',
            phone: null,
            websiteUrl: null,
            notes: null,
            deliveryFeePence: 0,
            freeDeliveryThresholdPence: null,
            clickAndCollectAvailable: true,
            fulfilmentChoice: 'collect',
          },
          actor: ACTOR,
          now: NOW,
        }),
      VersionConflictError,
    );
    // …and collect without the availability flag is refused even with the
    // right version.
    assert.throws(
      () =>
        editProjectSupplier(handle.db, {
          id: supplier.id,
          expectedVersion: 2,
          patch: {
            name: 'Yard',
            phone: null,
            websiteUrl: null,
            notes: null,
            deliveryFeePence: 0,
            freeDeliveryThresholdPence: null,
            clickAndCollectAvailable: false,
            fulfilmentChoice: 'collect',
          },
          actor: ACTOR,
          now: NOW,
        }),
      InvalidProjectInputError,
    );
    handle.raw.close();
  });

  it('deleting an item takes its quotes with it, audited', async () => {
    const handle = await fixture();
    const project = createProject(handle.db, { name: 'P', actor: ACTOR, now: NOW });
    const item = createProjectItem(handle.db, {
      projectId: project.id,
      name: 'Post',
      quantity: 2,
      actor: ACTOR,
      now: NOW,
    });
    const supplier = createProjectSupplier(handle.db, {
      projectId: project.id,
      name: 'Yard',
      actor: ACTOR,
      now: NOW,
    });
    saveProjectQuote(handle.db, {
      projectId: project.id,
      itemId: item.id,
      supplierId: supplier.id,
      unitPricePence: 100,
      packSize: null,
      packPricePence: null,
      actor: ACTOR,
      now: NOW,
    });
    deleteProjectItem(handle.db, {
      id: item.id,
      expectedVersion: 1,
      actor: ACTOR,
      now: NOW,
    });
    assert.equal(listProjectItems(handle.db, project.id).length, 0);
    assert.equal(listProjectQuotes(handle.db, project.id).length, 0);
    const deletion = auditFor(handle, 'project-item', item.id).find(
      (row) => row.action === 'project-item.delete',
    );
    assert.match(deletion?.summary ?? '', /Deleted item “Post” and its 1 quote/);
    handle.raw.close();
  });
});

describe('the Back Garden Fence Replacement demo (figure-exact)', () => {
  it('seeds idempotently and totals exactly as the fixture intends', async () => {
    const handle = await fixture();
    const project = seedFenceDemoProject(handle.db, ACTOR, NOW);
    const again = seedFenceDemoProject(handle.db, ACTOR, NOW);
    assert.equal(again.id, project.id);
    assert.equal(
      handle.db
        .select()
        .from(projects)
        .all()
        .filter((row) => row.name === FENCE_DEMO_PROJECT_NAME).length,
      1,
    );

    const items = listProjectItems(handle.db, project.id);
    const suppliers = listProjectSuppliers(handle.db, project.id);
    const quotes = listProjectQuotes(handle.db, project.id);
    assert.equal(items.length, 5);
    assert.equal(suppliers.length, 3);
    assert.equal(quotes.length, 14); // one sparse cell: no post mix at the Timber Yard

    const totals = orderBreakdown(
      toCostingItems(items),
      toCostingSuppliers(suppliers),
      toCostingQuotes(quotes),
    );

    // The mixed manual selection, supplier by supplier (inc. VAT pence):
    // Jewson: 10 posts @ 2675 + 20 arris @ 820 = 43150 → over the £300
    // threshold → free delivery. Timber Yard: 120 featheredge @ 310 + 10
    // gravel boards @ 1420 = 51400 → over £500 → free. Wickes: 20 post mix @
    // 640 = 12800 → under £250 → the £10.00 fee.
    assert.deepEqual(
      totals.groups.map((group) => ({
        name: group.supplier.name,
        materials: group.materialsSubtotalPence,
        delivery: group.delivery.deliveryPence,
        status: group.delivery.status,
        shortfall: group.delivery.shortfallToFreeDeliveryPence,
        total: group.supplierTotalPence,
      })),
      [
        {
          name: 'Local Timber Yard',
          materials: 51400,
          delivery: 0,
          status: 'free-threshold',
          shortfall: null,
          total: 51400,
        },
        {
          name: 'Wickes',
          materials: 12800,
          delivery: 1000,
          status: 'charged',
          shortfall: 12200,
          total: 13800,
        },
        {
          name: 'Jewson',
          materials: 43150,
          delivery: 0,
          status: 'free-threshold',
          shortfall: null,
          total: 43150,
        },
      ],
    );
    assert.equal(totals.materialsTotalPence, 107350); // £1,073.50
    assert.equal(totals.deliveryTotalPence, 1000); // £10.00
    assert.equal(totals.grandTotalPence, 108350); // £1,083.50

    const budget = budgetComparison(project.targetBudgetPence, totals.grandTotalPence);
    assert.deepEqual(budget, { state: 'under', deltaPence: -11650 }); // £116.50 under £1,200

    // Wickes' featheredge is pack-only: 12 packs of 10 for 120 boards.
    const wickesFeatheredge = quotes.find(
      (quote) =>
        quote.supplierId === suppliers.find((s) => s.name === 'Wickes')!.id &&
        quote.itemId === items.find((i) => i.name.includes('Featheredge'))!.id,
    );
    assert.equal(wickesFeatheredge?.packSize, 10);
    assert.equal(wickesFeatheredge?.packPricePence, 2950);

    // Jewson's gravel boards are the out-of-stock quote.
    const jewsonGravel = quotes.find(
      (quote) =>
        quote.supplierId === suppliers.find((s) => s.name === 'Jewson')!.id &&
        quote.itemId === items.find((i) => i.name.includes('Gravel'))!.id,
    );
    assert.equal(jewsonGravel?.inStock, false);
    handle.raw.close();
  });

  it('the workspace view carries the labels, hints and sparse cells the page prints', async () => {
    const handle = await fixture();
    const project = seedFenceDemoProject(handle.db, ACTOR, NOW);
    const view = getProjectWorkspaceView(handle.db, project.id);
    assert.ok(view);
    assert.equal(view.project.name, FENCE_DEMO_PROJECT_NAME);
    assert.equal(view.project.statusLabel, 'Researching');
    assert.equal(view.project.targetBudgetLabel, '£1,200.00');

    assert.equal(view.suppliers.length, 3);
    assert.equal(view.rows.length, 5);
    assert.equal(view.unselectedCount, 0);
    assert.deepEqual(
      view.groups.map((group) => group.supplierName),
      ['Local Timber Yard', 'Wickes', 'Jewson'],
    );

    const wickesGroup = view.groups.find((group) => group.supplierName === 'Wickes');
    assert.equal(wickesGroup?.materialsSubtotalLabel, '£128.00');
    assert.equal(wickesGroup?.deliveryLabel, 'Delivery £10.00');
    assert.equal(wickesGroup?.deliveryHint, '£122.00 away from free delivery');
    assert.equal(wickesGroup?.supplierTotalLabel, '£138.00');

    const yardGroup = view.groups.find((group) => group.supplierName === 'Local Timber Yard');
    assert.equal(yardGroup?.deliveryLabel, 'Free delivery (over £500.00)');
    assert.equal(yardGroup?.deliveryHint, null);

    assert.equal(view.totals.materialsTotalLabel, '£1,073.50');
    assert.equal(view.totals.deliveryTotalLabel, '£10.00');
    assert.equal(view.totals.grandTotalLabel, '£1,083.50');
    assert.equal(view.totals.budgetState, 'under');
    assert.equal(view.totals.budgetNote, '£116.50 under budget');

    // The sparse cell: Local Timber Yard has no post-mix quote.
    const postMixRow = view.rows.find((row) => row.name.includes('Post Mix'));
    const yardColumn = view.suppliers.find((s) => s.name === 'Local Timber Yard')!;
    assert.equal(postMixRow?.cells[yardColumn.id]?.hasQuote, false);
    // The pack quote prints its pack form.
    const featheredgeRow = view.rows.find((row) => row.name.includes('Featheredge'))!;
    const wickesColumn = view.suppliers.find((s) => s.name === 'Wickes')!;
    assert.equal(featheredgeRow.cells[wickesColumn.id]?.priceLabel, 'pack of 10 @ £29.50');
    assert.equal(featheredgeRow.cells[wickesColumn.id]?.lineCostLabel, '£354.00'); // 12 packs
    // The out-of-stock cell says so.
    const gravelRow = view.rows.find((row) => row.name.includes('Gravel'))!;
    const jewsonColumn = view.suppliers.find((s) => s.name === 'Jewson')!;
    assert.equal(gravelRow.cells[jewsonColumn.id]?.inStock, false);

    const page = getProjectsPageView(handle.db);
    assert.equal(page.rows.length, 1);
    assert.equal(page.rows[0]?.grandTotalLabel, '£1,083.50');
    assert.equal(page.rows[0]?.sizeLabel, '5 items · 3 suppliers · 14 quotes');
    handle.raw.close();
  });
});
