const isEnabled = (value: string | undefined, fallback: boolean) =>
  value === undefined ? fallback : value === 'true';

export const DEMO_ENABLED = isEnabled(
  process.env.NEXT_PUBLIC_DEMO_ENABLED,
  true
);

export const SIGNUP_ENABLED = isEnabled(
  process.env.NEXT_PUBLIC_SIGNUP_ENABLED,
  true
);

export const PRICING_ENABLED = isEnabled(
  process.env.NEXT_PUBLIC_PRICING_ENABLED,
  true
);

export const BILLING_ENABLED = isEnabled(
  process.env.NEXT_PUBLIC_BILLING_ENABLED,
  false
);
