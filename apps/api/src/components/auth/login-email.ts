// Keep the login email policy aligned with the sibling application's validator.
export function isValidLoginEmail(
  value: string,
  allowReservedDomains = false,
): boolean {
  const email = value.trim().toLowerCase();
  if (email.length > 254) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (
    !local ||
    !domain ||
    local.length > 64 ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..')
  )
    return false;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return false;
  const labels = domain.split('.');
  if (
    labels.length < 2 ||
    !/^[a-z]{2,63}$/.test(labels[labels.length - 1] ?? '')
  )
    return false;
  if (
    labels.some(
      (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
    )
  )
    return false;
  const reserved = [
    'example.com',
    'example.net',
    'example.org',
    'example',
    'test',
    'invalid',
    'localhost',
  ];
  return (
    allowReservedDomains ||
    !reserved.some(
      (suffix) => domain === suffix || domain.endsWith(`.${suffix}`),
    )
  );
}
