import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Decision, RunStatus } from '@/domain/enums';
import {
  ScaleEvaluationSchema,
  type ScaleEvaluation,
} from '@/domain/scale-evaluation';
import { db } from './db';

/**
 * The only module in the application that speaks SQL.
 *
 * Every read takes `organizationId` as its first parameter and filters on it.
 * That is not defensive decoration: it is what makes a forged or swapped
 * session cookie resolve to a different empty workspace instead of to another
 * tenant's evaluations. A query here without a tenant predicate is a bug.
 *
 * Rows cross this boundary as camelCase application types. Nothing above this
 * module sees a column name, a JSON blob, or SQLite's integer booleans.
 */

/** Optional intake fields. With the 75-word gate these are usually absent. */
export interface IntakeFields {
  name?: string;
  industry?: string;
  targetCustomer?: string;
  geography?: string;
  businessModel?: string;
  competitors?: string[];
  attachments?: Array<{ filename: string; excerpt: string }>;
}

export interface OpportunityRow {
  id: string;
  organizationId: string;
  createdBy: string;
  name: string;
  description: string;
  intake: IntakeFields;
  createdAt: string;
  updatedAt: string;
}

/** The denormalized view the workspace list and version history render. */
export interface EvaluationSummary {
  id: string;
  version: number;
  totalScore: number;
  decision: Decision;
  schemaVersion: string;
  templateId: string;
  templateVersion: string;
  workflowVersion: string;
  createdAt: string;
}

export interface OpportunityListRow {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  latest: EvaluationSummary | null;
  activeRun: { id: string; status: RunStatus } | null;
}

export interface RunRow {
  id: string;
  opportunityId: string;
  organizationId: string;
  createdBy: string;
  status: RunStatus;
  stageIndex: number;
  stageLabel: string | null;
  progress: number;
  provider: string;
  workflowVersion: string;
  promptVersion: string;
  schemaVersion: string;
  modelVersion: string | null;
  templateId: string;
  templateVersion: string;
  retryCount: number;
  sourceCount: number | null;
  schemaValid: boolean | null;
  inputTokens: number | null;
  outputTokens: number | null;
  toolCallCount: number | null;
  estimatedCostUsd: number | null;
  repairNotes: string[];
  idempotencyKey: string | null;
  errorMessage: string | null;
  errorDetails: string[];
  startedAt: string;
  completedAt: string | null;
}

/** Statuses that mean work is still owed. Mirrors TERMINAL_STATUSES. */
const ACTIVE_STATUSES: readonly RunStatus[] = [
  'queued',
  'researching',
  'synthesizing',
  'mapping',
  'evaluating',
  'rendering',
];

const ACTIVE_PLACEHOLDERS = ACTIVE_STATUSES.map(() => '?').join(', ');

function now(): string {
  return new Date().toISOString();
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A malformed blob must not take down a page that only wanted a list.
    return fallback;
  }
}

/** SQLite has no boolean type; columns are 0/1 or NULL when never written. */
function toBool(value: number | null): boolean | null {
  return value === null || value === undefined ? null : value === 1;
}

/* ------------------------------------------------------------------ *
 *  Tenancy and identity
 * ------------------------------------------------------------------ */

export function ensureOrganization(id: string, name: string): void {
  db()
    .prepare(
      `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .run(id, name, now());
}

export function ensureUser(user: {
  id: string;
  organizationId: string;
  role: string;
}): void {
  db()
    .prepare(
      `INSERT INTO users (id, organization_id, role, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .run(user.id, user.organizationId, user.role, now());
}

/* ------------------------------------------------------------------ *
 *  Opportunities
 * ------------------------------------------------------------------ */

interface OpportunityRecord {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  description: string;
  intake_json: string;
  created_at: string;
  updated_at: string;
}

function mapOpportunity(row: OpportunityRecord): OpportunityRow {
  return {
    id: row.id,
    organizationId: row.organization_id,
    createdBy: row.created_by,
    name: row.name,
    description: row.description,
    intake: parseJson<IntakeFields>(row.intake_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createOpportunity(params: {
  organizationId: string;
  createdBy: string;
  name: string;
  description: string;
  intake: IntakeFields;
}): OpportunityRow {
  const id = randomUUID();
  const timestamp = now();

  db()
    .prepare(
      `INSERT INTO opportunities
         (id, organization_id, created_by, name, description, intake_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      params.organizationId,
      params.createdBy,
      params.name,
      params.description,
      JSON.stringify(params.intake ?? {}),
      timestamp,
      timestamp,
    );

  return {
    id,
    organizationId: params.organizationId,
    createdBy: params.createdBy,
    name: params.name,
    description: params.description,
    intake: params.intake ?? {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function getOpportunity(
  organizationId: string,
  id: string,
): OpportunityRow | null {
  const row = db()
    .prepare(
      `SELECT * FROM opportunities WHERE organization_id = ? AND id = ?`,
    )
    .get(organizationId, id) as OpportunityRecord | undefined;

  return row ? mapOpportunity(row) : null;
}

/**
 * The workspace list: every opportunity with its latest saved evaluation and
 * whether a run is currently in flight. Assembled with two grouped queries
 * rather than one per row, so the list stays flat as a workspace grows.
 */
export function listOpportunities(organizationId: string): OpportunityListRow[] {
  const opportunities = db()
    .prepare(
      `SELECT * FROM opportunities
       WHERE organization_id = ?
       ORDER BY created_at DESC, rowid DESC`,
    )
    .all(organizationId) as OpportunityRecord[];

  if (opportunities.length === 0) return [];

  // Latest evaluation per opportunity. The correlated MAX(version) keeps this
  // correct when a rerun lands between the two queries.
  const latestRows = db()
    .prepare(
      `SELECT e.* FROM evaluations e
       WHERE e.organization_id = ?
         AND e.version = (
           SELECT MAX(version) FROM evaluations
           WHERE opportunity_id = e.opportunity_id
         )`,
    )
    .all(organizationId) as EvaluationRecord[];

  const latest = new Map<string, EvaluationSummary>();
  for (const row of latestRows) latest.set(row.opportunity_id, mapSummary(row));

  const activeRows = db()
    .prepare(
      `SELECT id, opportunity_id, status FROM runs
       WHERE organization_id = ? AND status IN (${ACTIVE_PLACEHOLDERS})
       ORDER BY started_at DESC, rowid DESC`,
    )
    .all(organizationId, ...ACTIVE_STATUSES) as Array<{
    id: string;
    opportunity_id: string;
    status: RunStatus;
  }>;

  const active = new Map<string, { id: string; status: RunStatus }>();
  // Ordered newest first, so the first entry per opportunity wins.
  for (const row of activeRows) {
    if (!active.has(row.opportunity_id)) {
      active.set(row.opportunity_id, { id: row.id, status: row.status });
    }
  }

  return opportunities.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latest: latest.get(row.id) ?? null,
    activeRun: active.get(row.id) ?? null,
  }));
}

/* ------------------------------------------------------------------ *
 *  Runs
 * ------------------------------------------------------------------ */

interface RunRecord {
  id: string;
  opportunity_id: string;
  organization_id: string;
  created_by: string;
  status: RunStatus;
  stage_index: number;
  stage_label: string | null;
  progress: number;
  provider: string;
  workflow_version: string;
  prompt_version: string;
  schema_version: string;
  model_version: string | null;
  template_id: string;
  template_version: string;
  retry_count: number;
  source_count: number | null;
  schema_valid: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  tool_call_count: number | null;
  estimated_cost_usd: number | null;
  repair_notes_json: string | null;
  idempotency_key: string | null;
  error_message: string | null;
  error_details_json: string | null;
  started_at: string;
  completed_at: string | null;
}

function mapRun(row: RunRecord): RunRow {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    organizationId: row.organization_id,
    createdBy: row.created_by,
    status: row.status,
    stageIndex: row.stage_index,
    stageLabel: row.stage_label,
    progress: row.progress,
    provider: row.provider,
    workflowVersion: row.workflow_version,
    promptVersion: row.prompt_version,
    schemaVersion: row.schema_version,
    modelVersion: row.model_version,
    templateId: row.template_id,
    templateVersion: row.template_version,
    retryCount: row.retry_count,
    sourceCount: row.source_count,
    schemaValid: toBool(row.schema_valid),
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    toolCallCount: row.tool_call_count,
    estimatedCostUsd: row.estimated_cost_usd,
    repairNotes: parseJson<string[]>(row.repair_notes_json, []),
    idempotencyKey: row.idempotency_key,
    errorMessage: row.error_message,
    errorDetails: parseJson<string[]>(row.error_details_json, []),
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export function createRun(params: {
  opportunityId: string;
  organizationId: string;
  createdBy: string;
  provider: string;
  workflowVersion: string;
  promptVersion: string;
  schemaVersion: string;
  templateId: string;
  templateVersion: string;
  idempotencyKey?: string;
}): RunRow {
  const id = randomUUID();
  const timestamp = now();

  db()
    .prepare(
      `INSERT INTO runs
         (id, opportunity_id, organization_id, created_by, status, stage_index,
          stage_label, progress, provider, workflow_version, prompt_version,
          schema_version, template_id, template_version, retry_count,
          idempotency_key, started_at, heartbeat_at)
       VALUES (?, ?, ?, ?, 'queued', 0, NULL, 0, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .run(
      id,
      params.opportunityId,
      params.organizationId,
      params.createdBy,
      params.provider,
      params.workflowVersion,
      params.promptVersion,
      params.schemaVersion,
      params.templateId,
      params.templateVersion,
      params.idempotencyKey ?? null,
      timestamp,
      timestamp,
    );

  return getRunById(id)!;
}

/** Untenanted lookup, private to this module. Callers go through `getRun`. */
function getRunById(id: string): RunRow | null {
  const row = db().prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as
    | RunRecord
    | undefined;
  return row ? mapRun(row) : null;
}

export function getRun(organizationId: string, id: string): RunRow | null {
  const row = db()
    .prepare(`SELECT * FROM runs WHERE organization_id = ? AND id = ?`)
    .get(organizationId, id) as RunRecord | undefined;
  return row ? mapRun(row) : null;
}

export function getRunByIdempotencyKey(
  organizationId: string,
  idempotencyKey: string,
): RunRow | null {
  const row = db()
    .prepare(
      `SELECT * FROM runs WHERE organization_id = ? AND idempotency_key = ?`,
    )
    .get(organizationId, idempotencyKey) as RunRecord | undefined;
  return row ? mapRun(row) : null;
}

export function listRuns(
  organizationId: string,
  opportunityId: string,
): RunRow[] {
  const rows = db()
    .prepare(
      `SELECT * FROM runs
       WHERE organization_id = ? AND opportunity_id = ?
       ORDER BY started_at DESC, rowid DESC`,
    )
    .all(organizationId, opportunityId) as RunRecord[];
  return rows.map(mapRun);
}

/** The in-flight run for an opportunity, if any. Used to block double-runs. */
export function getActiveRun(
  organizationId: string,
  opportunityId: string,
): RunRow | null {
  const row = db()
    .prepare(
      `SELECT * FROM runs
       WHERE organization_id = ? AND opportunity_id = ?
         AND status IN (${ACTIVE_PLACEHOLDERS})
       ORDER BY started_at DESC, rowid DESC
       LIMIT 1`,
    )
    .get(organizationId, opportunityId, ...ACTIVE_STATUSES) as
    | RunRecord
    | undefined;
  return row ? mapRun(row) : null;
}

/**
 * Advance a run's progress. Also advances the heartbeat, which is what stops
 * a healthy long run from being reaped as stale.
 */
export function updateRunProgress(
  runId: string,
  progress: {
    status: RunStatus;
    stageIndex: number;
    stageLabel?: string;
    progress: number;
  },
): void {
  db()
    .prepare(
      `UPDATE runs
         SET status = ?,
             stage_index = ?,
             stage_label = COALESCE(?, stage_label),
             progress = ?,
             heartbeat_at = ?
       WHERE id = ?`,
    )
    .run(
      progress.status,
      progress.stageIndex,
      progress.stageLabel ?? null,
      progress.progress,
      now(),
      runId,
    );
}

/**
 * Record what the run actually cost and whether its output validated (AC-11).
 * Every field is optional: the failure path records only what it knows.
 */
export function recordRunTelemetry(
  runId: string,
  telemetry: {
    modelVersion?: string;
    workflowVersion?: string;
    inputTokens?: number;
    outputTokens?: number;
    toolCallCount?: number;
    estimatedCostUsd?: number;
    sourceCount?: number;
    schemaValid?: boolean;
    repairNotes?: string[];
    retryCount?: number;
  },
): void {
  db()
    .prepare(
      `UPDATE runs
         SET model_version      = COALESCE(?, model_version),
             workflow_version   = COALESCE(?, workflow_version),
             input_tokens       = COALESCE(?, input_tokens),
             output_tokens      = COALESCE(?, output_tokens),
             tool_call_count    = COALESCE(?, tool_call_count),
             estimated_cost_usd = COALESCE(?, estimated_cost_usd),
             source_count       = COALESCE(?, source_count),
             schema_valid       = COALESCE(?, schema_valid),
             repair_notes_json  = COALESCE(?, repair_notes_json),
             retry_count        = COALESCE(?, retry_count),
             heartbeat_at       = ?
       WHERE id = ?`,
    )
    .run(
      telemetry.modelVersion ?? null,
      telemetry.workflowVersion ?? null,
      telemetry.inputTokens ?? null,
      telemetry.outputTokens ?? null,
      telemetry.toolCallCount ?? null,
      telemetry.estimatedCostUsd ?? null,
      telemetry.sourceCount ?? null,
      telemetry.schemaValid === undefined ? null : telemetry.schemaValid ? 1 : 0,
      telemetry.repairNotes ? JSON.stringify(telemetry.repairNotes) : null,
      telemetry.retryCount ?? null,
      now(),
      runId,
    );
}

export function markRunFailed(
  runId: string,
  message: string,
  details: string[] = [],
  retryCount?: number,
): void {
  const timestamp = now();
  db()
    .prepare(
      `UPDATE runs
         SET status = 'failed',
             error_message = ?,
             error_details_json = ?,
             retry_count = COALESCE(?, retry_count),
             completed_at = ?,
             heartbeat_at = ?
       WHERE id = ?`,
    )
    .run(
      message,
      JSON.stringify(details),
      retryCount ?? null,
      timestamp,
      timestamp,
      runId,
    );
}

/**
 * Fail any run whose heartbeat has gone quiet past `staleMs`.
 *
 * A worker killed mid-run leaves a row claiming to be "researching" forever.
 * Surfacing that as a failed run with a clear message is the whole point of
 * keeping run state in the database rather than in process memory.
 */
export function reapStaleRuns(staleMs: number): number {
  const cutoff = new Date(Date.now() - staleMs).toISOString();
  const timestamp = now();

  const result = db()
    .prepare(
      `UPDATE runs
         SET status = 'failed',
             error_message = 'Run was interrupted before it completed. Re-run to try again.',
             completed_at = ?,
             heartbeat_at = ?
       WHERE status IN (${ACTIVE_PLACEHOLDERS}) AND heartbeat_at <= ?`,
    )
    .run(timestamp, timestamp, ...ACTIVE_STATUSES, cutoff);

  return result.changes;
}

/* ------------------------------------------------------------------ *
 *  Evaluations
 * ------------------------------------------------------------------ */

interface EvaluationRecord {
  id: string;
  opportunity_id: string;
  organization_id: string;
  run_id: string;
  version: number;
  total_score: number;
  decision: Decision;
  schema_version: string;
  template_id: string;
  template_version: string;
  workflow_version: string;
  payload_json: string;
  created_at: string;
}

function mapSummary(row: EvaluationRecord): EvaluationSummary {
  return {
    id: row.id,
    version: row.version,
    totalScore: row.total_score,
    decision: row.decision,
    schemaVersion: row.schema_version,
    templateId: row.template_id,
    templateVersion: row.template_version,
    workflowVersion: row.workflow_version,
    createdAt: row.created_at,
  };
}

/** The version a new evaluation for this opportunity should take. */
export function nextEvaluationVersion(opportunityId: string): number {
  const row = db()
    .prepare(
      `SELECT MAX(version) AS max_version FROM evaluations WHERE opportunity_id = ?`,
    )
    .get(opportunityId) as { max_version: number | null };
  return (row.max_version ?? 0) + 1;
}

/**
 * Persist a validated evaluation, its normalized evidence, and the completion
 * of the run that produced it - in one transaction, so a crash mid-write can
 * never leave a completed run with no evaluation behind it.
 *
 * Nothing is updated in place. A rerun arrives here as a new version.
 */
export function saveEvaluation(evaluation: ScaleEvaluation): void {
  const database = db();

  const insertEvaluation = database.prepare(
    `INSERT INTO evaluations
       (id, opportunity_id, organization_id, run_id, version, total_score,
        decision, schema_version, template_id, template_version,
        workflow_version, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const insertSource = database.prepare(
    `INSERT INTO evaluation_sources
       (evaluation_id, organization_id, source_id, title, url, publisher,
        source_type, retrieved_at, excerpt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(evaluation_id, source_id) DO NOTHING`,
  );

  const insertClaim = database.prepare(
    `INSERT INTO evaluation_claims
       (evaluation_id, organization_id, claim_id, statement, claim_type,
        confidence, section, source_ids_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(evaluation_id, claim_id) DO NOTHING`,
  );

  const completeRun = database.prepare(
    `UPDATE runs
       SET status = 'completed', progress = 1, completed_at = ?, heartbeat_at = ?
     WHERE id = ?`,
  );

  const touchOpportunity = database.prepare(
    `UPDATE opportunities SET updated_at = ? WHERE id = ?`,
  );

  const write = database.transaction((record: ScaleEvaluation) => {
    insertEvaluation.run(
      record.evaluationId,
      record.opportunityId,
      record.organizationId,
      record.runId,
      record.version,
      record.scores.total,
      record.recommendation.decision,
      record.schemaVersion,
      record.templateId,
      record.templateVersion,
      record.workflowVersion,
      JSON.stringify(record),
      record.createdAt,
    );

    for (const source of record.sources) {
      insertSource.run(
        record.evaluationId,
        record.organizationId,
        source.id,
        source.title,
        source.url ?? null,
        source.publisher ?? null,
        source.sourceType,
        source.retrievedAt ?? null,
        source.excerpt ?? null,
      );
    }

    for (const claim of record.claims) {
      insertClaim.run(
        record.evaluationId,
        record.organizationId,
        claim.id,
        claim.statement,
        claim.type,
        claim.confidence,
        claim.section ?? null,
        JSON.stringify(claim.sourceIds),
      );
    }

    completeRun.run(record.createdAt, record.createdAt, record.runId);
    touchOpportunity.run(record.createdAt, record.opportunityId);
  });

  write(evaluation);
}

/**
 * Load a stored evaluation, re-validated on the way out.
 *
 * The payload was validated before it was written, so a row that fails here is
 * corruption or an unmigrated schema change, not bad model output - and it is
 * better to say so by id than to hand a renderer a half-shaped object.
 */
export function getEvaluation(
  organizationId: string,
  evaluationId: string,
): ScaleEvaluation | null {
  const row = db()
    .prepare(
      `SELECT * FROM evaluations WHERE organization_id = ? AND id = ?`,
    )
    .get(organizationId, evaluationId) as EvaluationRecord | undefined;

  if (!row) return null;

  const parsed = ScaleEvaluationSchema.safeParse(
    parseJson<unknown>(row.payload_json, null),
  );
  if (!parsed.success) {
    throw new Error(
      `Stored evaluation ${evaluationId} does not match schema ${row.schema_version}. ` +
        `This row was written by an incompatible version and needs migration.`,
    );
  }
  return parsed.data;
}

/** Newest version first: callers treat index 0 as the current evaluation. */
export function listEvaluationSummaries(
  organizationId: string,
  opportunityId: string,
): EvaluationSummary[] {
  const rows = db()
    .prepare(
      `SELECT * FROM evaluations
       WHERE organization_id = ? AND opportunity_id = ?
       ORDER BY version DESC`,
    )
    .all(organizationId, opportunityId) as EvaluationRecord[];
  return rows.map(mapSummary);
}

export function getLatestEvaluationSummary(
  organizationId: string,
  opportunityId: string,
): EvaluationSummary | null {
  const row = db()
    .prepare(
      `SELECT * FROM evaluations
       WHERE organization_id = ? AND opportunity_id = ?
       ORDER BY version DESC
       LIMIT 1`,
    )
    .get(organizationId, opportunityId) as EvaluationRecord | undefined;
  return row ? mapSummary(row) : null;
}

/* ------------------------------------------------------------------ *
 *  Rate limiting and audit
 * ------------------------------------------------------------------ */

/**
 * Fixed-window limiter, one row per bucket per hour.
 *
 * Returns false once the allowance is spent. The insert-then-update ordering
 * makes the whole check a single atomic statement pair under the connection's
 * write lock, so two simultaneous submissions cannot both see a free slot.
 */
export function consumeRateLimit(bucketKey: string, perHour: number): boolean {
  if (perHour <= 0) return false;

  const database = db();
  const windowStart = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH

  const consume = database.transaction((): boolean => {
    database
      .prepare(
        `INSERT INTO rate_limits (bucket_key, window_start, count) VALUES (?, ?, 0)
         ON CONFLICT(bucket_key, window_start) DO NOTHING`,
      )
      .run(bucketKey, windowStart);

    const result = database
      .prepare(
        `UPDATE rate_limits SET count = count + 1
         WHERE bucket_key = ? AND window_start = ? AND count < ?`,
      )
      .run(bucketKey, windowStart, perHour);

    return result.changes > 0;
  });

  return consume();
}

export function writeAudit(entry: {
  organizationId: string;
  actorId?: string;
  action: string;
  subjectType: string;
  subjectId: string;
  detail?: string;
}): void {
  db()
    .prepare(
      `INSERT INTO audit_log
         (organization_id, actor_id, action, subject_type, subject_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.organizationId,
      entry.actorId ?? null,
      entry.action,
      entry.subjectType,
      entry.subjectId,
      entry.detail ?? null,
      now(),
    );
}

export { closeDb } from './db';
