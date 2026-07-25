/**
 * Marker base for **pre-existing** legacy SRS entities without Suite audit columns.
 *
 * - **New tables** → always `EntityBase` + SQL `created_at`/`updated_at`/`deleted_at`. Do not use this.
 * - **Old tables** (ROL, ROL_ACCION, …) → may extend this marker and declare their real PK/columns.
 */
export abstract class SrsEntityBase {}
