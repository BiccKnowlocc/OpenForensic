export const PHYSICAL_OUT_OF_SCOPE =
  "Physical block imaging is outside v1. OpenForensic will not run dd or read block devices.";

export function refusePhysical(): { ok: false; code: "out_of_scope"; message: string } {
  return { ok: false, code: "out_of_scope", message: PHYSICAL_OUT_OF_SCOPE };
}
