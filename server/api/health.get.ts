import { createHealthPayload } from "../utils/health";

export default defineEventHandler(() => createHealthPayload());
