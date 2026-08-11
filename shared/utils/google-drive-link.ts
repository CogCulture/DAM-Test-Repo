export type GoogleDriveFileKind = "file" | "document" | "spreadsheet" | "presentation";

export type GoogleDriveFileLink = {
  id: string;
  kind: GoogleDriveFileKind;
};

const DRIVE_ID = "([a-zA-Z0-9_-]{10,})";

export function parseGoogleDriveFileLink(value: string): GoogleDriveFileLink {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid Google Drive file link.");
  }

  const host = url.hostname.toLowerCase();
  if (host !== "drive.google.com" && host !== "docs.google.com") {
    throw new Error("Only Google Drive and Google Docs links are supported.");
  }
  if (/\/folders\//i.test(url.pathname)) {
    throw new Error("Paste a Google Drive file link, not a folder link.");
  }

  const patterns: Array<{ regex: RegExp; kind: GoogleDriveFileKind }> = [
    { regex: new RegExp(`/file/d/${DRIVE_ID}`), kind: "file" },
    { regex: new RegExp(`/document/d/${DRIVE_ID}`), kind: "document" },
    { regex: new RegExp(`/spreadsheets/d/${DRIVE_ID}`), kind: "spreadsheet" },
    { regex: new RegExp(`/presentation/d/${DRIVE_ID}`), kind: "presentation" },
  ];
  for (const pattern of patterns) {
    const match = url.pathname.match(pattern.regex);
    if (match) return { id: match[1]!, kind: pattern.kind };
  }

  const queryId = url.searchParams.get("id");
  if (queryId && /^[a-zA-Z0-9_-]{10,}$/.test(queryId)) {
    return { id: queryId, kind: "file" };
  }
  throw new Error("This Google Drive URL does not contain a supported file link.");
}

export function buildGoogleDrivePublicUrl(file: GoogleDriveFileLink): string {
  const id = encodeURIComponent(file.id);
  if (file.kind === "document") return `https://docs.google.com/document/d/${id}/export?format=docx`;
  if (file.kind === "spreadsheet") return `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
  if (file.kind === "presentation") return `https://docs.google.com/presentation/d/${id}/export?format=pptx`;
  return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
}

