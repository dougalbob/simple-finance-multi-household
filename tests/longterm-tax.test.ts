import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  estimatePersonTax,
  nationalInsurancePence,
  personalAllowanceFor,
} from '../src/lib/longterm/tax';
import { UK_2026_27 } from '../src/lib/longterm/rates';
import type { PersonTaxComponents } from '../src/lib/longterm/tax';

const CARD = UK_2026_27;

function components(overrides: Partial<PersonTaxComponents> = {}): PersonTaxComponents {
  return {
    employmentPence: 0,
    pensionIncomePence: 0,
    savingsInterestPence: 0,
    dividendPence: 0,
    capitalGainsPence: 0,
    ...overrides,
  };
}

describe('long-term tax: the 2026/27 rate card arithmetic (estimated)', () => {
  it('the personal allowance is £12,570 and tapers away above £100k to nil at £125,140', () => {
    assert.equal(personalAllowanceFor(0, CARD), 1_257_000);
    assert.equal(personalAllowanceFor(10_000_000, CARD), 1_257_000);
    // £110,000: £10k over, so the allowance loses £5k.
    assert.equal(personalAllowanceFor(11_000_000, CARD), 757_000);
    assert.equal(personalAllowanceFor(12_514_000, CARD), 0);
    assert.equal(personalAllowanceFor(20_000_000, CARD), 0);
  });

  it('a £20,000 pension pays 20% on the £7,430 above the allowance — £1,486', () => {
    const tax = estimatePersonTax(components({ pensionIncomePence: 2_000_000 }), CARD);
    assert.equal(tax.incomeTaxPence, 148_600);
    assert.equal(tax.nationalInsurancePence, 0);
  });

  it('income exactly at the allowance pays nothing', () => {
    const tax = estimatePersonTax(components({ pensionIncomePence: 1_257_000 }), CARD);
    assert.equal(tax.incomeTaxPence, 0);
  });

  it('the 40% band starts at £50,270 of income and 45% above £125,140', () => {
    // £60,000: taxable £47,430 = £37,700 @20% + £9,730 @40%.
    const higher = estimatePersonTax(components({ employmentPence: 6_000_000 }), CARD);
    assert.equal(higher.incomeTaxPence, 754_000 + 389_200);
    // £130,000: allowance fully tapered (0), all taxable; top slice at 45%.
    const additional = estimatePersonTax(components({ employmentPence: 13_000_000 }), CARD);
    assert.equal(additional.incomeTaxPence, 754_000 + 3_497_600 + 218_700);
  });

  it('employee NI is 8% between £12,570 and £50,270 and 2% above', () => {
    assert.equal(nationalInsurancePence(1_257_000, CARD), 0);
    assert.equal(nationalInsurancePence(3_000_000, CARD), 139_440);
    assert.equal(
      nationalInsurancePence(6_000_000, CARD),
      301_600 + 19_460, // 8% of the main band + 2% of £9,730
    );
  });

  it('savings interest: 0% starting rate and the personal savings allowance absorb small incomes', () => {
    // Non-savings income exactly at the allowance: £3,000 of interest falls in
    // the 0% starting-rate band entirely.
    const covered = estimatePersonTax(
      components({ pensionIncomePence: 1_257_000, savingsInterestPence: 300_000 }),
      CARD,
    );
    assert.equal(covered.incomeTaxPence, 0);
  });

  it('savings interest above the £500 higher-rate PSA is taxed at the marginal band', () => {
    // £50,270 earnings fills the basic band exactly (taxable £37,700), so
    // £5,000 of interest: no starting rate, PSA £500 (higher-rate taxpayer),
    // £4,500 taxed at 40%.
    const tax = estimatePersonTax(
      components({ employmentPence: 5_027_000, savingsInterestPence: 500_000 }),
      CARD,
    );
    assert.equal(tax.incomeTaxPence, 754_000 + 180_000);
  });

  it('dividends: £500 allowance then 10.75% in the basic band (2026/27 rates)', () => {
    // £20,000 pension uses the allowance; £2,000 dividends: £500 free,
    // £1,500 at 10.75% = £161.25 → 16,125p half-up… 161p (half-up on the penny).
    const tax = estimatePersonTax(
      components({ pensionIncomePence: 2_000_000, dividendPence: 200_000 }),
      CARD,
    );
    assert.equal(tax.incomeTaxPence, 148_600 + 16_125);
  });

  it('capital gains: £3,000 exempt, then 18% within the basic band', () => {
    // No other income: £20,000 of gains → £17,000 taxable, all in the basic
    // band, at 18% = £3,060.
    const tax = estimatePersonTax(components({ capitalGainsPence: 2_000_000 }), CARD);
    assert.equal(tax.capitalGainsTaxPence, 306_000);
    assert.equal(tax.incomeTaxPence, 0);
  });

  it('capital gains stack above income and switch to 24% past the basic band', () => {
    // Taxable income £37,700 fills the basic band; £10,000 gains (exempt £3,000,
    // taxable £7,000) all above it at 24% = £1,680.
    const tax = estimatePersonTax(
      components({ pensionIncomePence: 5_027_000, capitalGainsPence: 1_000_000 }),
      CARD,
    );
    assert.equal(tax.capitalGainsTaxPence, 168_000);
  });
});
