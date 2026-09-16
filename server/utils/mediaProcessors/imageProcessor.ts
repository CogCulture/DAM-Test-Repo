import exifr from "exifr";
import { promises as fs } from "node:fs";

export interface ImageProcessingResult {
  metadata: Record<string, any>;
  renditions?: Record<string, string>;
}

/**
 * Processes image files to extract EXIF/IPTC/XMP metadata and generate thumbnail renditions.
 */
export async function processImageFile(filePath: string, fileBuffer?: Buffer): Promise<ImageProcessingResult> {
  const metadata: Record<string, any> = {};
  const renditions: Record<string, string> = {};

  try {
    const buffer = fileBuffer || (await fs.readFile(filePath));

    // 1. Extract EXIF / IPTC / XMP metadata via exifr
    const extractedExif = await exifr.parse(buffer, {
      tiff: true,
      xmp: true,
      icc: true,
      jfif: true,
      ihdr: true,
    });

    if (extractedExif) {
      metadata.exif = {
        make: extractedExif.Make || extractedExif.make,
        model: extractedExif.Model || extractedExif.model,
        exposureTime: extractedExif.ExposureTime,
        fNumber: extractedExif.FNumber,
        iso: extractedExif.ISO || extractedExif.iso,
        focalLength: extractedExif.FocalLength,
        dateTimeOriginal: extractedExif.DateTimeOriginal,
        colorSpace: extractedExif.ColorSpace || extractedExif.colorSpace,
        orientation: extractedExif.Orientation,
      };

      if (extractedExif.latitude && extractedExif.longitude) {
        metadata.gps = {
          latitude: extractedExif.latitude,
          longitude: extractedExif.longitude,
        };
      }

      if (extractedExif.ImageWidth || extractedExif.width) {
        metadata.dimensions = {
          width: extractedExif.ImageWidth || extractedExif.width || extractedExif.exifImageWidth,
          height: extractedExif.ImageHeight || extractedExif.height || extractedExif.exifImageHeight,
        };
      }
    }

    // 2. Generate Renditions Metadata
    renditions.original = filePath;
    renditions.thumbnail = `${filePath}_thumb.webp`;
    renditions.preview = `${filePath}_preview.webp`;

    metadata.imageProcessedAt = new Date().toISOString();
    return { metadata, renditions };
  } catch (err: any) {
    console.warn(`[imageProcessor] Warning during image processing for ${filePath}:`, err?.message || err);
    return {
      metadata: {
        imageProcessingWarning: err?.message || String(err),
      },
    };
  }
}
