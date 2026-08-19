export type UploadDestination = {
  id: "root" | string;
  name: string;
  type: "organization" | "department";
  available: boolean;
  folderId?: string;
  unavailableReason?: string;
};

type UploadActor = {
  role?: string | null;
  organizationId?: string | null;
  accessibleDepartmentIds?: string[] | null;
  orgType?: string | null;
};

type UploadDepartment = {
  id: string;
  organizationId: string;
  name: string;
  folderId?: string | null;
  gdriveFolderId?: string | null;
};

const organizationDepartments = (
  actor: UploadActor,
  departments: UploadDepartment[],
) => departments.filter(
  (department) => department.organizationId === actor.organizationId,
);

export const buildDepartmentUploadOptions = ({
  actor,
  departments,
}: {
  actor: UploadActor;
  departments: UploadDepartment[];
}): UploadDestination[] => {
  const accessibleIds = new Set(actor.accessibleDepartmentIds || []);
  const usesDrive = !actor.orgType || actor.orgType === "gdrive";
  const visibleDepartments = organizationDepartments(actor, departments).filter(
    (department) => actor.role === "admin" || accessibleIds.has(department.id),
  );

  return [
    ...(actor.role === "admin"
      ? [{
          id: "root" as const,
          name: "Organization root",
          type: "organization" as const,
          available: true,
        }]
      : []),
    ...visibleDepartments.map((department) => {
      const folderId = usesDrive ? department.gdriveFolderId : department.folderId;
      return {
        id: department.id,
        name: department.name,
        type: "department" as const,
        available: Boolean(folderId),
        ...(!usesDrive && folderId ? { folderId } : {}),
        ...(!folderId
          ? { unavailableReason: usesDrive
              ? "This department is not connected to Google Drive."
              : "This department is not connected to a DAM folder." }
          : {}),
      };
    }),
  ];
};

export const resolveLocalDepartmentUploadTarget = ({
  actor,
  departments,
  departmentId,
}: {
  actor: UploadActor;
  departments: UploadDepartment[];
  departmentId: string;
}) => {
  const department = organizationDepartments(actor, departments).find(
    (candidate) => candidate.id === departmentId,
  );
  if (!department) throw new Error("Upload department was not found in this organization.");

  const accessibleIds = new Set(actor.accessibleDepartmentIds || []);
  if (actor.role !== "admin" && !accessibleIds.has(department.id)) {
    throw new Error("You do not have access to this upload department.");
  }
  if (!department.folderId) {
    throw new Error("This department is not connected to a DAM folder.");
  }

  return {
    departmentId: department.id,
    departmentName: department.name,
    folderId: department.folderId,
  };
};

export const resolveDepartmentUploadTarget = ({
  actor,
  departments,
  departmentId,
}: {
  actor: UploadActor;
  departments: UploadDepartment[];
  departmentId: string;
}) => {
  const department = organizationDepartments(actor, departments).find(
    (candidate) => candidate.id === departmentId,
  );
  if (!department) throw new Error("Upload department was not found in this organization.");

  const accessibleIds = new Set(actor.accessibleDepartmentIds || []);
  if (actor.role !== "admin" && !accessibleIds.has(department.id)) {
    throw new Error("You do not have access to this upload department.");
  }
  if (!department.gdriveFolderId) {
    throw new Error("This department is not connected to Google Drive.");
  }

  return {
    departmentId: department.id,
    departmentName: department.name,
    gdriveFolderId: department.gdriveFolderId,
  };
};

export const resolveDriveUploadParent = ({
  rawParentId,
  departmentTarget,
}: {
  rawParentId: string;
  departmentTarget: { gdriveFolderId: string } | null;
}) => departmentTarget?.gdriveFolderId || rawParentId;

export const buildDriveUploadUrl = ({
  parentId,
  folderId,
  relativePath,
  departmentId,
}: {
  parentId: string;
  folderId?: string | null;
  relativePath: string;
  departmentId?: string | null;
}) => {
  const query = [
    `parentId=${encodeURIComponent(parentId)}`,
    `relativePath=${encodeURIComponent(relativePath)}`,
  ];
  if (folderId) query.push(`folderId=${encodeURIComponent(folderId)}`);
  if (departmentId) query.push(`departmentId=${encodeURIComponent(departmentId)}`);
  return `/api/gdrive/upload?${query.join("&")}`;
};

export const replaceFetchedFiles = <T>({
  current,
  incoming,
  reset,
  responseReady,
}: {
  current: T[];
  incoming: T[];
  reset: boolean;
  responseReady: boolean;
}): T[] => {
  if (!responseReady) return current;
  return reset ? [...incoming] : [...current, ...incoming];
};
