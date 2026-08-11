export type NomenclatureSegment = {
  key: string;
  label: string;
  allowedValues?: string[] | null;
};

export type FileRuleValidation = {
  valid: boolean;
  message?: string;
};

const basename = (filename: string) =>
  filename.replace(/\\/gu, "/").split("/").pop() || filename;

const fileStem = (filename: string) => {
  const name = basename(filename);
  const lastDot = name.lastIndexOf(".");
  return lastDot > 0 ? name.slice(0, lastDot) : name;
};

const fileExtension = (filename: string) => {
  const name = basename(filename);
  const lastDot = name.lastIndexOf(".");
  return lastDot > 0 ? name.slice(lastDot + 1).toLocaleLowerCase() : "";
};

export const normalizeAllowedExtensions = (
  values: unknown[] | null | undefined,
): string[] | null => {
  if (!values?.length) return null;

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const rawValue of values) {
    if (typeof rawValue !== "string") {
      throw new Error("Every allowed extension must be text.");
    }
    const value = rawValue.trim().replace(/^\./u, "").toLocaleLowerCase();
    if (!/^[a-z0-9][a-z0-9+_-]{0,15}$/u.test(value)) {
      throw new Error(`Invalid file extension: ${rawValue}`);
    }
    if (!seen.has(value)) {
      seen.add(value);
      normalized.push(value);
    }
  }

  return normalized.length ? normalized : null;
};

export const validateFileNomenclature = (
  filename: string,
  segments: NomenclatureSegment[],
): FileRuleValidation => {
  if (!segments.length) {
    return { valid: false, message: "No nomenclature template is configured for this department." };
  }

  const values = fileStem(filename).split("_");
  const expected = segments.map((segment) => segment.key).join("_");
  if (values.length !== segments.length || values.some((value) => !value.trim())) {
    return { valid: false, message: `File name must follow ${expected} before the extension.` };
  }

  for (const [index, segment] of segments.entries()) {
    const value = values[index];
    const allowedValues = (segment.allowedValues || []).map((item) => item.trim()).filter(Boolean);
    if (typeof value !== "string") {
      return { valid: false, message: `File name must follow ${expected} before the extension.` };
    }
    if (allowedValues.length && !allowedValues.includes(value)) {
      return {
        valid: false,
        message: `${segment.label || segment.key} must be one of: ${allowedValues.join(", ")}.`,
      };
    }
  }

  return { valid: true };
};

export const validateFileExtension = (
  filename: string,
  allowedExtensions: string[] | null | undefined,
): FileRuleValidation => {
  if (!allowedExtensions?.length) return { valid: true };
  const extension = fileExtension(filename);
  if (allowedExtensions.map((value) => value.toLocaleLowerCase()).includes(extension)) {
    return { valid: true };
  }
  return {
    valid: false,
    message: `File extension must be one of: ${allowedExtensions.join(", ")}.`,
  };
};

export const normalizeNomenclatureSegments = (segments: NomenclatureSegment[]) =>
  segments.map((segment) => ({
    key: segment.key.trim(),
    label: segment.label.trim(),
    allowedValues: (segment.allowedValues || []).map((value) => value.trim()).filter(Boolean),
  }));

export const evaluateUploadGovernance = (input: {
  filename: string;
  enabled: boolean;
  segments: NomenclatureSegment[];
  allowedExtensions?: string[] | null;
  role?: string;
}): FileRuleValidation => {
  if (!input.enabled) return { valid: true };
  const nomenclature = validateFileNomenclature(input.filename, input.segments);
  if (!nomenclature.valid) return nomenclature;
  return validateFileExtension(input.filename, input.allowedExtensions);
};
