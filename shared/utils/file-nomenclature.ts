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

const validateNomenclatureStem = (
  name: string,
  segments: NomenclatureSegment[],
  kind: "File" | "Folder",
): FileRuleValidation => {
  if (!segments || !segments.length) {
    return { valid: true };
  }

  const values = name.split("_");
  const expected = segments.map((segment) => segment.key).join("_");
  if (values.length !== segments.length || values.some((value) => !value.trim())) {
    return {
      valid: false,
      message: kind === "File"
        ? `File name must follow ${expected} before the extension.`
        : `Folder name must follow ${expected}.`,
    };
  }

  for (const [index, segment] of segments.entries()) {
    const value = values[index];
    const allowedValues = (segment.allowedValues || []).map((item) => item.trim()).filter(Boolean);
    if (typeof value !== "string") {
      return { valid: false, message: `${kind} name must follow ${expected}.` };
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
  return validateNomenclatureStem(fileStem(filename), segments, "File");
};

export const validateFolderNomenclature = (
  folderName: string,
  segments: NomenclatureSegment[],
): FileRuleValidation => validateNomenclatureStem(basename(folderName), segments, "Folder");

export const validateFolderPathNomenclature = (
  relativePath: string,
  segments: NomenclatureSegment[],
): FileRuleValidation => {
  if (!segments || !segments.length) return { valid: true };
  const folderNames = relativePath
    .replace(/\\/gu, "/")
    .split("/")
    .map((value) => value.trim())
    .filter(Boolean);

  for (const folderName of folderNames) {
    const result = validateFolderNomenclature(folderName, segments);
    if (!result.valid) {
      return { valid: false, message: `Folder "${folderName}": ${result.message}` };
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
  const normalizedAllowed = allowedExtensions.map((value) =>
    String(value).trim().replace(/^\./u, "").toLocaleLowerCase()
  ).filter(Boolean);
  if (!normalizedAllowed.length || normalizedAllowed.includes(extension)) {
    return { valid: true };
  }
  return {
    valid: false,
    message: `File extension must be one of: ${normalizedAllowed.join(", ")}.`,
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

export const findUploadGovernanceViolation = (input: {
  filenames: string[];
  enabled: boolean;
  segments: NomenclatureSegment[];
  allowedExtensions?: string[] | null;
}): ({ filename: string; message: string } | null) => {
  for (const filename of input.filenames) {
    const result = evaluateUploadGovernance({
      filename,
      enabled: input.enabled,
      segments: input.segments,
      allowedExtensions: input.allowedExtensions,
    });
    if (!result.valid) {
      return {
        filename,
        message: result.message || "File nomenclature is invalid.",
      };
    }
  }
  return null;
};

export const findEffectiveUploadGovernanceViolation = (
  filenames: string[],
  policy: {
    enforced?: boolean;
    nomenclature?: {
      segments?: NomenclatureSegment[];
      allowedExtensions?: string[] | null;
    } | null;
  } | null | undefined,
) => findUploadGovernanceViolation({
  filenames,
  enabled: Boolean(policy?.enforced),
  segments: policy?.nomenclature?.segments || [],
  allowedExtensions: policy?.nomenclature?.allowedExtensions,
});
