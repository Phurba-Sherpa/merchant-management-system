export function maskTaxId(taxId?: string | null): string | null {
  if (!taxId) return null;
  const trimmed = taxId.trim();
  if (trimmed.length <= 4) return '****';
  const lastFour = trimmed.slice(-4);
  return '*'.repeat(trimmed.length - 4) + lastFour;
}

export function maskEmail(email?: string | null): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  const parts = trimmed.split('@');
  if (parts.length !== 2) return '***';
  const [local, domain] = parts;
  if (local.length <= 1) {
    return `*@${domain}`;
  }
  return `${local[0]}***@${domain}`;
}

export function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (trimmed.length <= 4) return '****';
  const lastFour = trimmed.slice(-4);
  // If starts with +, omit + from count to match 9 asterisks + 4 digits for 14-char phone, or replace all prefix chars
  // Notice +9779800000000 has 14 chars. 9 asterisks + 4 digits = 13 chars (the '+' is masked without adding extra char or dropped)
  const prefixLength = trimmed.startsWith('+')
    ? trimmed.length - 5
    : trimmed.length - 4;
  return '*'.repeat(prefixLength) + lastFour;
}
