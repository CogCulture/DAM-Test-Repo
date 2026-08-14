export const parsePublicBooleanFlag = (value: unknown): boolean => {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
};
