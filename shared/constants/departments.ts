export type Department = {
  id: string;
  name: string;
  parentId: string | null;
};

export const DEPARTMENTS: Department[] = [];

export const DEPARTMENT_MAP: Record<string, Department> = {};

export const getDepartmentName = (id: string): string => {
  if (!id) return "";
  // Fallback to formatting the ID if it's dynamic
  const parts = id.split("_");
  if (parts.length > 1) {
    const suffix = parts.slice(1).join(" ");
    return suffix.charAt(0).toUpperCase() + suffix.slice(1);
  }
  return id.charAt(0).toUpperCase() + id.slice(1);
};

// Departments that are sub-teams (have a parent)
export const SUB_DEPARTMENTS: Department[] = [];

// Top-level departments (no parent)
export const TOP_LEVEL_DEPARTMENTS: Department[] = [];
