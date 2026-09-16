export const resolveRagProgressMessage = (value: unknown) => {
  const lines = String(value || "").split("\n").map(line => line.trim()).filter(Boolean);
  if (!lines.length) return "";
  const lastLine = lines.at(-1)!;
  try {
    const record = JSON.parse(lastLine);
    if (record?.type === "stage" && typeof record.message === "string") {
      return record.message;
    }
  } catch {
    // Parser output is usually plain text; display it unchanged.
  }
  return lastLine;
};
