type FileVisibility = "public" | "private" | "inherit";
type FileTypes = "image" | "video" | "audio" | "document" | "folder" | "other";

interface IFile {
  id: string;
  name: string;
  path: string;
  storagePath?: string;
  duplicateOfId?: string;
  type: string;
  contentType: string;
  size?: number;
  dimensions?: string;
  preview?: string;
  visibility: FileVisibility;
  count?: number;
  sharedCount?: number;
  bucketName: string;
  isFavorite?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  md5?: string;
  assetMetadata?: Record<string, any>;
  storageProvider?: "local" | "gdrive";
  // Phase 3: taxonomy-driven metadata fields
  tags?: string[];
  customMetadata?: Record<string, any>;
  breadcrumb?: FolderBreadcrumb[];
}

interface FilesFetchResponse {
  data: IFile[];
  nextPage?: number | null;
}

interface ITaxonomy {
  id: string;
  organizationId: string;
  departmentId?: string;
  name: string;
  key: string;
  type: 'text' | 'select' | 'multiselect';
  options?: string[];
  isRequired: boolean;
  createdAt: string;
  updatedAt: string;
}
