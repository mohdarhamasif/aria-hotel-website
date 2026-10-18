// Required fields of the application, in the previous site's order and wording. No runtime imports.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Fields = Record<string, unknown> | undefined;
const filled = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== '';

/** What is still missing across both steps: 'name', the business name label, 'email' or 'a valid email address' */
export function missingFields(step1: Fields, step2: Fields, nameLabel: string): string[] {
  const d = { ...step1, ...step2 };
  const missing: string[] = [];
  if (!filled(d.name)) missing.push('name');
  if (!filled(d.hotel_name)) missing.push(nameLabel);
  if (!filled(d.email)) missing.push('email');
  else if (!EMAIL_RE.test(String(d.email).trim())) missing.push('a valid email address');
  return missing;
}

/** 'Please add name, email.' */
export const missingMessage = (missing: string[]) => `Please add ${missing.join(', ')}.`;
