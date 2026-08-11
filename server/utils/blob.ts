export const moveBlob = async (source: string, target: string) => {
  try {
    const blob = await localBlob().get(source);
    if (blob) {
      await localBlob().put(target, blob);
      await localBlob().del(source);
    }
  } catch (err) {
    throw createError({
      status: 500,
      message: "Can't move item",
    });
  }
};

export const copyBlob = async (source: string, target: string) => {
  try {
    const blob = await localBlob().get(source);
    if (!blob) {
      throw createError({ status: 404, message: "Source file is missing from storage." });
    }
    return await localBlob().put(target, blob);
  } catch (err: any) {
    if (err?.statusCode === 404) throw err;
    throw createError({
      status: 500,
      message: "Can't make copy",
    });
  }
};

export const deleteBlob = async (path: string, timestamp: number) => {
  try {
    const blob = await localBlob().get(path);
    if (blob) {
      await localBlob().put(`_trash/${timestamp}/${path}`, blob);
      await localBlob().del(path);
    }
  } catch (err) {
    throw createError({
      status: 500,
      message: "Can't delete item",
    });
  }
};
