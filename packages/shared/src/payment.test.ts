import { describe, expect, it } from 'vitest';
import {
  getPlanCheckoutDisclosureWithRate,
  getPlanCreditsGranted,
  getPlanPeriodEnd,
  PLANS,
} from './payment';

describe('payment credit allocation contract', () => {
  it('grants one monthly allocation when a yearly plan starts', () => {
    expect(getPlanCreditsGranted(PLANS.starter_yearly)).toBe(50);
    expect(getPlanCreditsGranted(PLANS.pro_yearly)).toBe(100);
    expect(getPlanCreditsGranted(PLANS.team_yearly)).toBe(300);
  });

  it('keeps the yearly subscription term at 12 months', () => {
    const start = new Date('2026-07-28T00:00:00.000Z');

    expect(getPlanPeriodEnd(PLANS.pro_yearly, start).toISOString()).toBe(
      '2027-07-28T00:00:00.000Z'
    );
  });

  it('describes yearly credits as monthly allocations', () => {
    const disclosure = getPlanCheckoutDisclosureWithRate(
      PLANS.pro_yearly,
      18_000,
      'Tax test label'
    );

    expect(disclosure.creditsGranted).toBe(100);
    expect(disclosure.creditValidity).toBe(
      'Credits are allocated monthly and expire at the next monthly allocation.'
    );
    expect(disclosure.billingLabel).toBe('12-month prepaid plan');
    expect(disclosure.taxLabel).toBe('Tax test label');
  });

  it('preserves monthly and add-on grants', () => {
    expect(getPlanCreditsGranted(PLANS.starter)).toBe(50);
    expect(getPlanCreditsGranted(PLANS.addon)).toBe(50);

    const addonDisclosure = getPlanCheckoutDisclosureWithRate(
      PLANS.addon,
      18_000
    );
    expect(addonDisclosure.creditValidity).toBe(
      'Add-on credits do not expire under the current terms.'
    );
  });
});
