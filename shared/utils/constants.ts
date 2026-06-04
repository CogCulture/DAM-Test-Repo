export const allowedExtensions: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp3: "audio/mp3",
  wav: "audio/wav",
  txt: "text/plain",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  md: "text/markdown",
  js: "application/javascript",
  json: "application/json",
  xml: "application/xml",
  zip: "application/zip",
  mp4: "video/mp4",
  mpeg: "video/mpeg",
  ogg: "video/ogg",
  webm: "video/webm",
  sqlite: "application/x-sqlite3",
  yaml: "application/yaml",
};

export const validTextFiles = {
  txt: "text/plain",
  html: "text/html",
  htm: "text/html",
  md: "text/markdown",
  json: "application/json",
  css: "text/css",
  js: "text/javascript",
};

export const fileTypes: Record<string, string> = {
  folder: "folder",
  // image
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/svg+xml": "image",
  "image/webp": "image",
  "image/jpg": "image",
  "image/bmp": "image",
  // video
  "video/mp4": "video",
  "video/mpeg": "video",
  "video/ogg": "video",
  "video/webm": "video",
  // audio
  "audio/mp3": "audio",
  // text
  "text/plain": "text",
  "text/html": "html",
  "text/markdown": "markdown",
  "text/csv": "csv",
  "text/css": "css",
  "text/javascript": "js",
  // data
  "application/json": "json",
  "application/xml": "xml",
  // document
  "application/pdf": "pdf",
  "application/msword": "word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word",
  "application/vnd.ms-excel": "excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "excel",
  "application/vnd.ms-powerpoint": "powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "powerpoint",
  "application/zip": "archive",
  "application/x-sqlite3": "sqlite",
  "application/yaml": "yaml",
};
export const fileIcons = {
  folder: "lucide:folder",
  image: "vscode-icons:file-type-image",
  video: "vscode-icons:file-type-video",
  audio: "vscode-icons:file-type-audio",
  pdf: "vscode-icons:file-type-pdf2",
  word: "vscode-icons:file-type-word",
  excel: "vscode-icons:file-type-excel",
  powerpoint: "vscode-icons:file-type-powerpoint",
  html: "vscode-icons:file-type-html",
  css: "vscode-icons:file-type-css",
  js: "vscode-icons:file-type-js-official",
  ts: "vscode-icons:file-type-typescript-official",
  archive: "vscode-icons:file-type-zip",
  text: "vscode-icons:file-type-text",
  markdown: "vscode-icons:file-type-markdown",
  json: "vscode-icons:file-type-json",
  xml: "vscode-icons:file-type-xml",
  csv: "vscode-icons:file-type-db",
  sqlite: "vscode-icons:file-type-sqlite",
  yaml: "vscode-icons:file-type-yaml",
  default: "vscode-icons:default-file",
};

export const memberRoles = [
  {
    value: "viewer",
    label: "Viewer",
    icon: "lucide:eye",
  },
  {
    value: "editor",
    label: "Editor",
    icon: "lucide:pencil",
  },
  {
    value: "none",
    label: "None",
    icon: "lucide:ban",
  },
];

export const visibilityOptions = [
  {
    value: "public",
    label: "Public",
    icon: "lucide:earth",
  },
  {
    value: "private",
    label: "Private",
    icon: "lucide:lock",
  },
  {
    value: "inherit",
    label: "Inherit",
    icon: "lucide:folder",
  },
];
