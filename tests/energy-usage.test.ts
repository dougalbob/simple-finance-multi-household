import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  annualCost,
  annualiseWh,
  billMonth,
  billNotes,
  billingDays,
  checkEnergyDetails,
  comparisonUsage,
  compareTariffs,
  effectiveMilliPencePerKwh,
  ENERGY_FUELS,
  exitFeeLive,
  formatKwh,
  formatReading,
  formatStandingCharge,
  formatUnitRate,
  fuelCost,
  gasFactorWorthChecking,
  impliedGasKwhPerCubicMetre,
  InvalidEnergyInputError,
  parseEnergyTariff,
  parseKwh,
  parseRate,
  parseReading,
  recordedUsage,
  serialiseEnergyTariff,
  summariseMonths,
  TYPICAL_ANNUAL_KWH,
  usageBasisLabel,
  type EnergyBillLike,
  type EnergyTariff,
} from '../src/lib/records/energy-usage';

/**
 * Energy usage and tariffs (issue 118, v1.44.0; SPEC §29).
 *
 * The figures in this suite are the household's own bill, printed 18 Oct 2026:
 * gas 13 770.4660 → 13 837.7730 m³, 67.3070 m³, 755.23 kWh at 4.748p/kWh and
 * 25.902p a day, a 31-day period from 18 Sep to 18 Oct, fixed until 1 Nov 2026
 * with a £50 early exit fee, and 21,699 kWh of estimated annual usage. If the
 * app's arithmetic ever drifts off that bill, these tests fail.
 */

const GAS: EnergyTariff = {
  supplier: 'Octopus Energy',
  tariffName: 'Simply Fixed Oct26v12',
  unitRateMilliPencePerKwh: 4748,
  standingChargeMilliPencePerDay: 25902,
  fixedUntil: '2026-11-01',
  exitFeePence: 5000,
  notes: '',
};

const ELECTRIC: EnergyTariff = {
  supplier: 'Octopus Energy',
  tariffName: 'Simply Fixed Oct26v12',
  unitRateMilliPencePerKwh: 24860,
  standingChargeMilliPencePerDay: 60970,
  fixedUntil: '2026-11-01',
  exitFeePence: 5000,
  notes: '',
};

/** The household's bill, in the app's storage units. */
const GAS_WH = 755_230;
const ELECTRIC_WH = 327_800;

describe('the bill’s own arithmetic', () => {
  it('costs the gas period exactly as the bill does, VAT included', () => {
    const cost = fuelCost({ wh: GAS_WH, days: 31, tariff: GAS });
    assert.equal(cost.unitsPence, 3_586); // 755.23 × 4.748p = 3 585.83p
    assert.equal(cost.standingPence, 803); // 31 × 25.902p = 802.96p
    assert.equal(cost.exVatPence, 4_389);
    assert.equal(cost.vatPence, 219); // 5% of 4 389p = 219.45p
    assert.equal(cost.totalPence, 4_608);
  });

  it('costs the electricity period the same way', () => {
    const cost = fuelCost({ wh: ELECTRIC_WH, days: 31, tariff: ELECTRIC });
    assert.equal(cost.unitsPence, 8_149);
    assert.equal(cost.standingPence, 1_890);
    assert.equal(cost.exVatPence, 10_039);
    assert.equal(cost.vatPence, 502);
    assert.equal(cost.totalPence, 10_541);
  });

  it('reproduces the bill’s £94.54 a year of standing charge, to the penny', () => {
    const cost = annualCost(21_699_000, GAS);
    assert.equal(cost.standingPence, 9_454);
    assert.equal(cost.unitsPence, 103_027); // 21 699 × 4.748p
    assert.equal(cost.totalPence, 118_105); // £1 181.05 with VAT
  });

  it('rounds each product half-up exactly once', () => {
    // 1 kWh at 0.5p is exactly half a penny: half-up gives 1p, not 0p.
    const cost = fuelCost({ wh: 1000, days: 0, tariff: { ...GAS, unitRateMilliPencePerKwh: 500 } });
    assert.equal(cost.unitsPence, 1);
    // 1 kWh at 0.4p is below half: 0p.
    const under = fuelCost({
      wh: 1000,
      days: 0,
      tariff: { ...GAS, unitRateMilliPencePerKwh: 400 },
    });
    assert.equal(under.unitsPence, 0);
    // VAT rounds half-up on the penny subtotal too.
    const vat = fuelCost({ wh: 1000, days: 0, tariff: { ...GAS, unitRateMilliPencePerKwh: 1000 } });
    assert.equal(vat.exVatPence, 1);
    assert.equal(vat.vatPence, 0); // 0.05p rounds down to nothing
    const vatUp = fuelCost({
      wh: 1000,
      days: 0,
      tariff: { ...GAS, unitRateMilliPencePerKwh: 2000 },
    });
    assert.equal(vatUp.vatPence, 0); // 2p → 0.1p
    const vatHalf = fuelCost({
      wh: 1000,
      days: 0,
      tariff: { ...GAS, unitRateMilliPencePerKwh: 10000 },
    });
    assert.equal(vatHalf.exVatPence, 10);
    assert.equal(vatHalf.vatPence, 1); // 0.5p half-up
  });
});

describe('units, parsed and printed as the bill prints them', () => {
  it('reads kWh to three decimals and holds watt-hours', () => {
    assert.equal(parseKwh('755.23', 'Gas usage'), 755_230);
    assert.equal(parseKwh('1,234.5', 'Gas usage'), 1_234_500);
    assert.equal(parseKwh('268', 'Gas usage'), 268_000);
    assert.equal(parseKwh('   ', 'Gas usage'), null);
    assert.throws(() => parseKwh('755.2345', 'Gas usage'), InvalidEnergyInputError);
    assert.throws(() => parseKwh('seven', 'Gas usage'), InvalidEnergyInputError);
  });

  it('reads a meter reading to four decimals, exactly as printed', () => {
    assert.equal(parseReading('13770.4660', 'Gas reading'), 137_704_660);
    assert.equal(parseReading('13770.466', 'Gas reading'), 137_704_660);
    assert.equal(parseReading('13837.7730', 'Gas reading'), 138_377_730);
    assert.throws(() => parseReading('13770.46609', 'Gas reading'), InvalidEnergyInputError);
  });

  it('reads a tariff rate to three decimals, as thousandths of a penny', () => {
    assert.equal(parseRate('4.748', 'Unit rate'), 4_748);
    assert.equal(parseRate('25.902', 'Standing charge'), 25_902);
    assert.equal(parseRate('24.86', 'Unit rate'), 24_860);
    assert.equal(parseRate('', 'Unit rate'), null);
    assert.throws(() => parseRate('4.7481', 'Unit rate'), InvalidEnergyInputError);
  });

  it('prints figures back without trailing zeros it was not given', () => {
    assert.equal(formatKwh(755_230), '755.23');
    assert.equal(formatKwh(268_000), '268');
    assert.equal(formatKwh(327_800), '327.8');
    assert.equal(formatReading(137_704_660), '13770.466');
    assert.equal(formatUnitRate(4_748), '4.748p');
    assert.equal(formatStandingCharge(25_902), '25.902p');
    assert.equal(formatUnitRate(24_860), '24.86p');
  });
});

describe('billing periods', () => {
  it('counts both ends, which is what the standing charge is worked out on', () => {
    assert.equal(billingDays('2026-09-18', '2026-10-18'), 31);
    assert.equal(billingDays('2026-10-01', '2026-10-01'), 1);
    // A leap February, counted the same way.
    assert.equal(billingDays('2028-02-01', '2028-03-01'), 30);
  });

  it('refuses a period that ends before it starts', () => {
    assert.throws(() => billingDays('2026-10-18', '2026-09-18'), InvalidEnergyInputError);
  });

  it('draws a bill in the month its period ends, not the month it was paid', () => {
    const bill = { periodEnd: '2026-10-18', occurredDate: '2026-10-20' };
    assert.equal(billMonth(bill), '2026-10');
    // A 18 Aug – 18 Sep bill is September's, even though the money left in September.
    assert.equal(billMonth({ periodEnd: '2026-09-18', occurredDate: '2026-10-01' }), '2026-09');
    // No period recorded: fall back to the purchase date, and say so elsewhere.
    assert.equal(billMonth({ periodEnd: null, occurredDate: '2026-10-02' }), '2026-10');
  });
});

describe('the saved tariff', () => {
  it('round-trips through settings JSON', () => {
    assert.deepEqual(parseEnergyTariff(serialiseEnergyTariff(GAS)), GAS);
  });

  it('refuses a tariff it cannot believe rather than half-reading it', () => {
    assert.equal(parseEnergyTariff(''), null);
    assert.equal(parseEnergyTariff(null), null);
    assert.throws(() => parseEnergyTariff('{not json'), InvalidEnergyInputError);
    assert.throws(() => parseEnergyTariff('[]'), InvalidEnergyInputError);
    assert.throws(
      () => parseEnergyTariff(JSON.stringify({ ...GAS, supplier: '' })),
      InvalidEnergyInputError,
    );
    assert.throws(
      () => parseEnergyTariff(JSON.stringify({ ...GAS, unitRateMilliPencePerKwh: '4.748' })),
      InvalidEnergyInputError,
    );
    assert.throws(
      () => parseEnergyTariff(JSON.stringify({ ...GAS, fixedUntil: '1 Nov 2026' })),
      InvalidEnergyInputError,
    );
  });

  it('treats the exit fee as live only while the price is guaranteed', () => {
    assert.equal(exitFeeLive(GAS, '2026-10-28'), 5_000);
    assert.equal(exitFeeLive(GAS, '2026-11-01'), 0);
    assert.equal(exitFeeLive(GAS, '2027-03-01'), 0);
    // No fixed-until date: nothing has expired, so the fee stands.
    assert.equal(exitFeeLive({ ...GAS, fixedUntil: null }, '2030-01-01'), 5_000);
  });
});

function bill(partial: Partial<EnergyBillLike> & { purchaseId: number }): EnergyBillLike {
  return {
    occurredDate: '2026-10-20',
    periodStart: null,
    periodEnd: null,
    gasWh: null,
    electricWh: null,
    gasReadingStart: null,
    gasReadingEnd: null,
    electricReadingStart: null,
    electricReadingEnd: null,
    gasEstimateWh: null,
    electricEstimateWh: null,
    ...partial,
  };
}

describe('the details on one bill', () => {
  it('keeps the household’s own bill exactly as printed', () => {
    const checked = checkEnergyDetails({
      periodStart: '2026-09-18',
      periodEnd: '2026-10-18',
      gasWh: GAS_WH,
      electricWh: ELECTRIC_WH,
      gasReadingStart: 137_704_660,
      gasReadingEnd: 138_377_730,
      electricReadingStart: null,
      electricReadingEnd: null,
      gasEstimateWh: 21_699_000,
      electricEstimateWh: null,
      note: null,
    });
    assert.equal(checked.gasWh, GAS_WH);
    assert.equal(checked.gasReadingEnd, 138_377_730);
    assert.equal(checked.electricFromReadings, false);
  });

  it('needs the usage, and nothing else', () => {
    assert.throws(
      () =>
        checkEnergyDetails({
          periodStart: null,
          periodEnd: null,
          gasWh: null,
          electricWh: null,
          gasReadingStart: null,
          gasReadingEnd: null,
          electricReadingStart: null,
          electricReadingEnd: null,
          gasEstimateWh: null,
          electricEstimateWh: null,
          note: 'bill seen',
        }),
      InvalidEnergyInputError,
    );
  });

  it('takes a period as both dates or neither', () => {
    const base = {
      gasWh: GAS_WH,
      electricWh: null,
      gasReadingStart: null,
      gasReadingEnd: null,
      electricReadingStart: null,
      electricReadingEnd: null,
      gasEstimateWh: null,
      electricEstimateWh: null,
      note: null,
    };
    assert.throws(
      () => checkEnergyDetails({ ...base, periodStart: '2026-09-18', periodEnd: null }),
      InvalidEnergyInputError,
    );
    assert.throws(
      () => checkEnergyDetails({ ...base, periodStart: '2026-10-18', periodEnd: '2026-09-18' }),
      InvalidEnergyInputError,
    );
    assert.equal(
      checkEnergyDetails({ ...base, periodStart: null, periodEnd: null }).periodStart,
      null,
    );
  });

  it('works the electricity out of the readings when the kWh box is blank', () => {
    const checked = checkEnergyDetails({
      periodStart: '2026-09-18',
      periodEnd: '2026-10-18',
      gasWh: null,
      electricWh: null,
      gasReadingStart: null,
      gasReadingEnd: null,
      electricReadingStart: 4_821_340, // 482.1340 kWh
      electricReadingEnd: 4_854_120, // 485.4120 kWh
      gasEstimateWh: null,
      electricEstimateWh: null,
      note: null,
    });
    assert.equal(checked.electricWh, 3_278); // 3.278 kWh → 3 278 Wh
    assert.equal(checked.electricFromReadings, true);
  });

  it('never derives gas: m³ is not kWh without the calorific value', () => {
    assert.throws(
      () =>
        checkEnergyDetails({
          periodStart: null,
          periodEnd: null,
          gasWh: null,
          electricWh: null,
          gasReadingStart: 137_704_660,
          gasReadingEnd: 138_377_730,
          electricReadingStart: null,
          electricReadingEnd: null,
          gasEstimateWh: null,
          electricEstimateWh: null,
          note: null,
        }),
      InvalidEnergyInputError,
    );
  });

  it('allows readings that go backwards, because a meter exchange does', () => {
    const checked = checkEnergyDetails({
      periodStart: '2026-09-18',
      periodEnd: '2026-10-18',
      gasWh: GAS_WH,
      electricWh: null,
      gasReadingStart: 100,
      gasReadingEnd: 50,
      electricReadingStart: null,
      electricReadingEnd: null,
      gasEstimateWh: null,
      electricEstimateWh: null,
      note: null,
    });
    assert.equal(checked.gasReadingEnd, 50);
  });
});

describe('usage, annualised with its basis said out loud', () => {
  it('adds up what was recorded and the days that can be trusted', () => {
    const usage = recordedUsage([
      bill({ purchaseId: 1, periodStart: '2026-09-18', periodEnd: '2026-10-18', gasWh: GAS_WH }),
      bill({
        purchaseId: 2,
        periodStart: '2026-10-18',
        periodEnd: '2026-11-18',
        gasWh: 900_000,
        gasEstimateWh: 21_699_000,
      }),
      bill({ purchaseId: 3, gasWh: 500_000 }),
    ]);
    assert.equal(usage.gasWh, GAS_WH + 900_000 + 500_000);
    // 18 Sep → 18 Oct is 31 days inclusive; 18 Oct → 18 Nov is 32, because
    // October has 31 days. Both ends count, every time.
    assert.equal(usage.daysCovered, 31 + 32);
    assert.equal(usage.billsWithoutPeriod, 1);
    assert.equal(usage.gasEstimateWh, 21_699_000);
  });

  it('scales a short history to a year, half-up', () => {
    assert.equal(annualiseWh(755_230, 31), 8_892_224); // 755.23 × 365 ÷ 31, half-up
    assert.equal(annualiseWh(100, 0), null);
  });

  it('prefers the household’s own bills once there are 30 days of them', () => {
    const usage = recordedUsage([
      bill({
        purchaseId: 1,
        periodStart: '2026-09-18',
        periodEnd: '2026-10-18',
        gasWh: GAS_WH,
        gasEstimateWh: 21_699_000,
      }),
    ]);
    const chosen = comparisonUsage(usage, 'gas');
    assert.equal(chosen?.basis, 'bills');
    assert.equal(chosen?.days, 31);
    assert.equal(chosen?.wh, annualiseWh(GAS_WH, 31));
  });

  it('falls back to the bill’s printed estimate when the history is too short', () => {
    const usage = recordedUsage([
      bill({
        purchaseId: 1,
        periodStart: '2026-10-01',
        periodEnd: '2026-10-10',
        gasWh: 100_000,
        gasEstimateWh: 21_699_000,
      }),
    ]);
    assert.equal(comparisonUsage(usage, 'gas')?.basis, 'estimate');
    assert.equal(comparisonUsage(usage, 'gas')?.wh, 21_699_000);
  });

  it('refuses to compare when there is neither a history nor an estimate', () => {
    const usage = recordedUsage([bill({ purchaseId: 1, gasWh: 100_000 })]);
    assert.equal(comparisonUsage(usage, 'gas'), null);
    assert.equal(comparisonUsage(usage, 'electric'), null);
  });
});

describe('comparing a candidate tariff', () => {
  const usage = recordedUsage([
    bill({
      purchaseId: 1,
      periodStart: '2026-09-18',
      periodEnd: '2026-10-18',
      gasWh: GAS_WH,
      gasEstimateWh: 21_699_000,
    }),
  ]);

  it('uses the same usage on both sides, and quotes the difference a year', () => {
    const chosen = comparisonUsage(usage, 'gas');
    assert.ok(chosen !== null);
    const result = compareTariffs({
      fuel: 'gas',
      usageWh: chosen.wh,
      basis: chosen.basis,
      days: chosen.days,
      current: GAS,
      candidate: {
        supplier: 'Another Energy',
        tariffName: 'Fixed 12',
        unitRateMilliPencePerKwh: 4400,
        standingChargeMilliPencePerDay: 30000,
      },
      today: '2026-10-28',
    });
    assert.equal(result.currentAnnual.totalPence, annualCost(chosen.wh, GAS).totalPence);
    assert.equal(
      result.differencePence,
      result.candidateAnnual.totalPence - result.currentAnnual.totalPence,
    );
    // 4.4p vs 4.748p and 30p vs 25.902p a day on 8 892 kWh: cheaper, but not by much.
    assert.ok(result.differencePence < 0);
    assert.equal(result.currentExitFeePence, 5_000);
    assert.ok(result.paybackMonths !== null && result.paybackMonths > 0);
  });

  it('says where its usage came from', () => {
    assert.equal(usageBasisLabel({ basis: 'bills', days: 31 }), 'from your own 31 days of bills');
    assert.equal(
      usageBasisLabel({ basis: 'estimate', days: null }),
      "from the supplier's estimated annual usage",
    );
  });

  it('has no payback to work out when leaving costs nothing', () => {
    const chosen = comparisonUsage(usage, 'gas');
    assert.ok(chosen !== null);
    const result = compareTariffs({
      fuel: 'gas',
      usageWh: chosen.wh,
      basis: chosen.basis,
      days: chosen.days,
      current: GAS,
      candidate: {
        supplier: 'Another Energy',
        tariffName: 'Fixed 12',
        unitRateMilliPencePerKwh: 3000,
        standingChargeMilliPencePerDay: 20000,
      },
      today: '2027-01-01', // the guarantee has ended, so the fee is gone
    });
    assert.equal(result.currentExitFeePence, 0);
    assert.equal(result.paybackMonths, null);
    assert.ok(result.differencePence < 0);
  });
});

describe('the chart', () => {
  it('draws twelve months ending with this one, and a gap where no bill exists', () => {
    const months = summariseMonths(
      [
        {
          ...bill({
            purchaseId: 1,
            occurredDate: '2026-10-20',
            periodStart: '2026-09-18',
            periodEnd: '2026-10-18',
            gasWh: GAS_WH,
          }),
          energyPence: 4_608,
        },
        {
          ...bill({
            purchaseId: 2,
            occurredDate: '2026-08-20',
            periodStart: '2026-07-18',
            periodEnd: '2026-08-18',
            gasWh: 600_000,
            electricWh: 300_000,
          }),
          energyPence: 20_000,
        },
      ],
      '2026-10-28',
    );
    assert.equal(months.length, 12);
    assert.equal(months.at(-1)?.month, '2026-10');
    assert.equal(months.at(-1)?.gasWh, GAS_WH);
    assert.equal(months.at(-1)?.electricWh, null); // not recorded, not zero
    assert.equal(months.at(-1)?.pence, 4_608);
    // August's bill landed in August because that is when its period ended.
    const august = months.find((month) => month.month === '2026-08');
    assert.equal(august?.gasWh, 600_000);
    assert.equal(august?.electricWh, 300_000);
    // September has no bill at all: a gap, so the chart can draw no bar.
    const september = months.find((month) => month.month === '2026-09');
    assert.equal(september?.bills, 0);
    assert.equal(september?.gasWh, null);
    assert.equal(september?.pence, null);
  });
});

describe('honest checks that never block a save', () => {
  it('checks the implied gas factor instead of inventing one', () => {
    const factor = impliedGasKwhPerCubicMetre(GAS_WH, 137_704_660, 138_377_730);
    assert.ok(factor !== null);
    assert.ok(Math.abs(factor - 11.22) < 0.01, `factor was ${factor}`);
    assert.equal(gasFactorWorthChecking(factor), false);
    // kWh typed into the m³ boxes produces a factor nowhere near a gas bill.
    const wrong = impliedGasKwhPerCubicMetre(GAS_WH, 0, 755_230 / 10);
    assert.equal(gasFactorWorthChecking(wrong), true);
  });

  it('names an overlapping period and a reading that does not follow on', () => {
    const previous = bill({
      purchaseId: 1,
      periodStart: '2026-08-18',
      periodEnd: '2026-09-18',
      gasWh: 600_000,
      gasReadingStart: 137_040_000,
      gasReadingEnd: 137_704_660,
    });
    const current = bill({
      purchaseId: 2,
      periodStart: '2026-09-01', // overlaps August's bill
      periodEnd: '2026-10-18',
      gasWh: GAS_WH,
      gasReadingStart: 137_000_000, // does not follow 137 704.660
      gasReadingEnd: 138_377_730,
    });
    const notes = billNotes(current, previous);
    assert.ok(notes.some((note) => note.kind === 'overlap'));
    assert.ok(notes.some((note) => note.kind === 'readings'));
    // The opening reading also breaks the implied gas factor here, which is
    // the point: the checks are independent and each one is named.
    assert.ok(notes.some((note) => note.kind === 'factor'));
  });

  it('says when a bill has no period, rather than pretending it is a month', () => {
    const notes = billNotes(bill({ purchaseId: 1, gasWh: GAS_WH }), null);
    assert.ok(notes.some((note) => note.kind === 'no-period'));
  });

  it('keeps the typical-household yardstick out of the arithmetic', () => {
    // The yardstick is a constant, not a default usage: a household with no
    // bills still gets no comparison, however useful Ofgem's figures are.
    assert.deepEqual(TYPICAL_ANNUAL_KWH, { gas: 11_500, electric: 2_700 });
    assert.equal(comparisonUsage(recordedUsage([]), 'gas'), null);
    assert.deepEqual(ENERGY_FUELS, ['gas', 'electric']);
  });
});
