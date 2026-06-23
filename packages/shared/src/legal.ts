const readLegalValue = (name: string, fallback: string) =>
  process.env[name]?.trim() || fallback;

export const LEGAL_EFFECTIVE_DATE = 'June 13, 2026';

export const legalIdentity = {
  productName: 'Envoyou AI Editorial System',
  operatorName: readLegalValue('LEGAL_OPERATOR_NAME', 'Envoyou'),
  registeredAddress: process.env.LEGAL_REGISTERED_ADDRESS?.trim() || '',
  supportEmail: readLegalValue('LEGAL_SUPPORT_EMAIL', 'support@envoyou.com'),
  legalEmail: readLegalValue('LEGAL_CONTACT_EMAIL', 'info@envoyou.com'),
  privacyEmail: readLegalValue('LEGAL_PRIVACY_EMAIL', 'support@envoyou.com'),
  governingLaw: readLegalValue('LEGAL_GOVERNING_LAW', 'the laws of Indonesia'),
};
