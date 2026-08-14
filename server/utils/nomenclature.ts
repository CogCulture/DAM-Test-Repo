export type NomenclatureSegment = {
  key: string;
  label: string;
  allowedValues?: string[] | null;
};

export type NomenclatureValidation = {
  valid: boolean;
  message?: string;
};

const fileStem = (filename: string) => {
  const basename = filename.replace(/\\/g, "/").split("/").pop() || filename;
  const lastDot = basename.lastIndexOf(".");
  return lastDot > 0 ? basename.slice(0, lastDot) : basename;
};

export const validateFileNomenclature = (
  filename: string,
  segments: NomenclatureSegment[]
): NomenclatureValidation => {
  if (!segments.length) {
    return { valid: false, message: "No nomenclature template is configured for this department." };
  }

  const values = fileStem(filename).split("_");
  const expected = segments.map((segment) => segment.key).join("_");

  if (values.length !== segments.length || values.some((value) => !value.trim())) {
    return {
      valid: false,
      message: `File name must follow ${expected} before the extension.`,
    };
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

export const normalizeNomenclatureSegments = (segments: NomenclatureSegment[]) =>
  segments.map((segment) => ({
    key: segment.key.trim(),
    label: segment.label.trim(),
    allowedValues: (segment.allowedValues || []).map((value) => value.trim()).filter(Boolean),
  }));
