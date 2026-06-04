export type Department = {
  id: string;
  name: string;
  parentId: string | null;
};

export const DEPARTMENTS: Department[] = [
  { id: "hr", name: "HR", parentId: null },
  { id: "finance", name: "Finance", parentId: null },
  { id: "marketing", name: "Marketing", parentId: null },
  { id: "creative", name: "Creative Team", parentId: null },
  { id: "video", name: "Video Team", parentId: "creative" },
  { id: "graphic", name: "Graphic Team", parentId: "creative" },
  { id: "it", name: "IT Team", parentId: null },
  { id: "business_dev", name: "Business Development Team", parentId: null },
  { id: "client_servicing", name: "Client Servicing", parentId: null },
  { id: "founders", name: "Founders Team", parentId: null },
];

export const DEPARTMENT_MAP = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.id, d])
) as Record<string, Department>;

export const getDepartmentName = (id: string): string => {
  if (!id) return "";
  if (DEPARTMENT_MAP[id]) return DEPARTMENT_MAP[id].name;
  if (id.length > 27 && id[26] === "_") {
    const baseId = id.slice(27);
    if (DEPARTMENT_MAP[baseId]) return DEPARTMENT_MAP[baseId].name;
  }
  const parts = id.split("_");
  if (parts.length > 1) {
    const suffix = parts.slice(1).join("_");
    if (DEPARTMENT_MAP[suffix]) return DEPARTMENT_MAP[suffix].name;
    const lastPart = parts[parts.length - 1];
    if (DEPARTMENT_MAP[lastPart]) return DEPARTMENT_MAP[lastPart].name;
  }
  return id;
};

// Departments that are sub-teams (have a parent)
export const SUB_DEPARTMENTS = DEPARTMENTS.filter((d) => d.parentId !== null);

// Top-level departments (no parent)
export const TOP_LEVEL_DEPARTMENTS = DEPARTMENTS.filter(
  (d) => d.parentId === null
);
