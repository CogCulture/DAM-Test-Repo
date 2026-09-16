export type FileCategory = "image" | "video" | "audio" | "document" | "design" | "package" | "unknown";

export interface DetectedFileType {
  ext: string;
  mime: string;
  category: FileCategory;
  description: string;
}

/**
 * Sniffs binary buffer magic bytes to accurately detect format and category.
 */
export function detectFileType(buffer: Buffer, fileName: string = ""): DetectedFileType {
  if (!buffer || buffer.length === 0) {
    return fallbackFromExtension(fileName);
  }

  // 1. Check Magic Byte Signatures
  // PSD (Photoshop): 8BPS (0x38 0x42 0x50 0x53)
  if (buffer.length >= 4 && buffer[0] === 0x38 && buffer[1] === 0x42 && buffer[2] === 0x50 && buffer[3] === 0x53) {
    return { ext: ".psd", mime: "image/vnd.adobe.photoshop", category: "design", description: "Adobe Photoshop Document" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ext: ".png", mime: "image/png", category: "image", description: "PNG Image" };
  }

  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: ".jpg", mime: "image/jpeg", category: "image", description: "JPEG Image" };
  }

  // GIF: 47 49 46 38 ("GIF8")
  if (buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return { ext: ".gif", mime: "image/gif", category: "image", description: "GIF Image" };
  }

  // WEBP: RIFF....WEBP (0x52 0x49 0x46 0x46 ... 0x57 0x45 0x42 0x50)
  if (buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return { ext: ".webp", mime: "image/webp", category: "image", description: "WebP Image" };
  }

  // PDF: %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (buffer.length >= 5 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2d) {
    // Check if it's an Adobe Illustrator file saved with PDF compatibility
    if (fileName.toLowerCase().endsWith(".ai")) {
      return { ext: ".ai", mime: "application/postscript", category: "design", description: "Adobe Illustrator Artwork (PDF-Compatible)" };
    }
    return { ext: ".pdf", mime: "application/pdf", category: "document", description: "PDF Document" };
  }

  // PostScript / EPS / AI: %!PS (0x25 0x21 0x50 0x53)
  if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x21 && buffer[2] === 0x50 && buffer[3] === 0x53) {
    if (fileName.toLowerCase().endsWith(".ai")) {
      return { ext: ".ai", mime: "application/postscript", category: "design", description: "Adobe Illustrator Artwork" };
    }
    return { ext: ".eps", mime: "application/postscript", category: "design", description: "Encapsulated PostScript" };
  }

  // InDesign Package / Document: 0x06 0x06 0xED 0xF5 or "DOCUMENT" or INDD signature
  if (buffer.length >= 8 && buffer[0] === 0x06 && buffer[1] === 0x06 && buffer[2] === 0xed && buffer[3] === 0xf5) {
    return { ext: ".indd", mime: "application/x-indesign", category: "design", description: "Adobe InDesign Document" };
  }

  // MP4 / MOV: 0x00 0x00 0x00 ... ftyp (0x66 0x74 0x79 0x70)
  if (buffer.length >= 12 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    const brand = buffer.toString("ascii", 8, 12);
    if (brand.startsWith("qt")) {
      return { ext: ".mov", mime: "video/quicktime", category: "video", description: "QuickTime MOV Video" };
    }
    if (brand.startsWith("M4A")) {
      return { ext: ".m4a", mime: "audio/mp4", category: "audio", description: "M4A Audio" };
    }
    return { ext: ".mp4", mime: "video/mp4", category: "video", description: "MP4 Video" };
  }

  // AVI: RIFF....AVI  (0x52 0x49 0x46 0x46 ... 0x41 0x56 0x49 0x20)
  if (buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x41 && buffer[9] === 0x56 && buffer[10] === 0x49 && buffer[11] === 0x20) {
    return { ext: ".avi", mime: "video/x-msvideo", category: "video", description: "AVI Video" };
  }

  // MKV / WEBM: 0x1A 0x45 0xDF 0xA3
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { ext: ".mkv", mime: "video/x-matroska", category: "video", description: "Matroska / WebM Video" };
  }

  // MP3: ID3 (0x49 0x44 0x33) or 0xFF 0xFB / 0xFF 0xF3
  if ((buffer.length >= 3 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
      (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
    return { ext: ".mp3", mime: "audio/mpeg", category: "audio", description: "MP3 Audio" };
  }

  // WAV: RIFF....WAVE (0x52 0x49 0x46 0x46 ... 0x57 0x41 0x56 0x45)
  if (buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45) {
    return { ext: ".wav", mime: "audio/wav", category: "audio", description: "WAV Audio" };
  }

  // ZIP / OpenXML (DOCX, XLSX, PPTX, INDD Package): PK\x03\x04 (0x50 0x4B 0x03 0x04)
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    const extLower = fileName.toLowerCase();
    if (extLower.endsWith(".docx")) {
      return { ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", category: "document", description: "Word Document" };
    }
    if (extLower.endsWith(".xlsx")) {
      return { ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", category: "document", description: "Excel Spreadsheet" };
    }
    if (extLower.endsWith(".pptx")) {
      return { ext: ".pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", category: "document", description: "PowerPoint Presentation" };
    }
    if (extLower.endsWith(".indt") || extLower.includes("pkg") || extLower.includes("package")) {
      return { ext: ".zip", mime: "application/zip", category: "design", description: "Packaged InDesign Design Archive" };
    }
    return { ext: ".zip", mime: "application/zip", category: "package", description: "ZIP Archive / Package" };
  }

  // Fallback using extension if magic byte sniffing did not match
  return fallbackFromExtension(fileName);
}

function fallbackFromExtension(fileName: string): DetectedFileType {
  const ext = fileName.includes(".") ? "." + fileName.split(".").pop()!.toLowerCase() : "";
  
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return { ext, mime: "image/jpeg", category: "image", description: "JPEG Image" };
    case ".png":
      return { ext, mime: "image/png", category: "image", description: "PNG Image" };
    case ".webp":
      return { ext, mime: "image/webp", category: "image", description: "WebP Image" };
    case ".gif":
      return { ext, mime: "image/gif", category: "image", description: "GIF Image" };
    case ".svg":
      return { ext, mime: "image/svg+xml", category: "image", description: "Vector SVG Image" };
    case ".mp4":
      return { ext, mime: "video/mp4", category: "video", description: "MP4 Video" };
    case ".mov":
      return { ext, mime: "video/quicktime", category: "video", description: "QuickTime Video" };
    case ".avi":
      return { ext, mime: "video/x-msvideo", category: "video", description: "AVI Video" };
    case ".mkv":
      return { ext, mime: "video/x-matroska", category: "video", description: "MKV Video" };
    case ".mp3":
      return { ext, mime: "audio/mpeg", category: "audio", description: "MP3 Audio" };
    case ".wav":
      return { ext, mime: "audio/wav", category: "audio", description: "WAV Audio" };
    case ".m4a":
      return { ext, mime: "audio/mp4", category: "audio", description: "M4A Audio" };
    case ".pdf":
      return { ext, mime: "application/pdf", category: "document", description: "PDF Document" };
    case ".docx":
      return { ext, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", category: "document", description: "Word Document" };
    case ".xlsx":
      return { ext, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", category: "document", description: "Excel Spreadsheet" };
    case ".pptx":
      return { ext, mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", category: "document", description: "PowerPoint Presentation" };
    case ".txt":
    case ".md":
    case ".markdown":
      return { ext, mime: "text/markdown", category: "document", description: "Markdown Document" };
    case ".psd":
      return { ext, mime: "image/vnd.adobe.photoshop", category: "design", description: "Adobe Photoshop Document" };
    case ".ai":
      return { ext, mime: "application/postscript", category: "design", description: "Adobe Illustrator Artwork" };
    case ".indd":
      return { ext, mime: "application/x-indesign", category: "design", description: "Adobe InDesign Document" };
    case ".zip":
      return { ext, mime: "application/zip", category: "package", description: "ZIP Archive / Package" };
    default:
      return { ext: ext || ".bin", mime: "application/octet-stream", category: "unknown", description: "Binary Asset" };
  }
}
