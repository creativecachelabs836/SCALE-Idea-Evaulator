/**
 * Schema migrations (spec section 7, Persistence; section 10, Versioning).
 *
 * Two rules shape every table here:
 *
 *   1. Multi-tenancy is carried from the first migration. Every row-owning
 *      table has `organization_id` and every repository read takes it as a
 *      parameter, so a swapped or forged session cookie resolves to a
 *      different empty workspace rather than to someone else's data.
 *      Retrofitting tenancy costs far more than carrying the column.
 *
 *   2. Nothing attached to a completed evaluation is ever mutated. A rerun
 *      inserts a new `evaluations` row with the next version; the run that
 *      produced it keeps its own provider, prompt, schema, model and template
 *      versions, so a report stays interpretable after the product evolves.
 */

export interface Migration {
  version: number;
  up: string;
}

export const MIGRATIONS: ReadonlyArray<Migration> = [
  {
    version: 1,
    up: `
      CREATE TABLE organizations (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE users (
        id              TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        role            TEXT NOT NULL,
        created_at      TEXT NOT NULL
      );
      CREATE INDEX idx_users_org ON users (organization_id);

      CREATE TABLE opportunities (
        id              TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        created_by      TEXT NOT NULL,
        name            TEXT NOT NULL,
        description     TEXT NOT NULL,
        -- Optional intake fields the user supplied, verbatim. Kept whole so a
        -- rerun replays exactly what the first run was given.
        intake_json     TEXT NOT NULL DEFAULT '{}',
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );
      CREATE INDEX idx_opportunities_org ON opportunities (organization_id, created_at DESC);

      CREATE TABLE runs (
        id                 TEXT PRIMARY KEY,
        opportunity_id     TEXT NOT NULL REFERENCES opportunities(id),
        organization_id    TEXT NOT NULL REFERENCES organizations(id),
        created_by         TEXT NOT NULL,

        status             TEXT NOT NULL,
        stage_index        INTEGER NOT NULL DEFAULT 0,
        stage_label        TEXT,
        progress           REAL NOT NULL DEFAULT 0,

        -- Provenance required by section 10. Captured per run, never derived
        -- from current configuration at read time.
        provider           TEXT NOT NULL,
        workflow_version   TEXT NOT NULL,
        prompt_version     TEXT NOT NULL,
        schema_version     TEXT NOT NULL,
        model_version      TEXT,
        template_id        TEXT NOT NULL,
        template_version   TEXT NOT NULL,

        -- Telemetry (AC-11): captured per run whether or not it is exported.
        retry_count        INTEGER NOT NULL DEFAULT 0,
        source_count       INTEGER,
        schema_valid       INTEGER,
        input_tokens       INTEGER,
        output_tokens      INTEGER,
        tool_call_count    INTEGER,
        estimated_cost_usd REAL,
        repair_notes_json  TEXT,

        idempotency_key    TEXT,
        error_message      TEXT,
        error_details_json TEXT,

        started_at         TEXT NOT NULL,
        completed_at       TEXT,
        -- Advanced on every progress write; the stale-run reaper reads it.
        heartbeat_at       TEXT NOT NULL
      );
      CREATE INDEX idx_runs_opportunity ON runs (opportunity_id, started_at DESC);
      CREATE INDEX idx_runs_org ON runs (organization_id, started_at DESC);
      CREATE INDEX idx_runs_status ON runs (status, heartbeat_at);
      -- Idempotency is scoped to the tenant: two workspaces may legitimately
      -- submit the same client-generated key.
      CREATE UNIQUE INDEX idx_runs_idempotency
        ON runs (organization_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL;

      CREATE TABLE evaluations (
        id               TEXT PRIMARY KEY,
        opportunity_id   TEXT NOT NULL REFERENCES opportunities(id),
        organization_id  TEXT NOT NULL REFERENCES organizations(id),
        run_id           TEXT NOT NULL REFERENCES runs(id),
        version          INTEGER NOT NULL,

        -- Denormalized for the workspace list and version history, which must
        -- not deserialize a full payload per row to show a score.
        total_score      INTEGER NOT NULL,
        decision         TEXT NOT NULL,

        schema_version   TEXT NOT NULL,
        template_id      TEXT NOT NULL,
        template_version TEXT NOT NULL,
        workflow_version TEXT NOT NULL,

        -- The canonical ScaleEvaluation, exactly as it validated.
        payload_json     TEXT NOT NULL,
        created_at       TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_evaluations_version
        ON evaluations (opportunity_id, version);
      CREATE INDEX idx_evaluations_org ON evaluations (organization_id, created_at DESC);

      -- Normalized evidence (FR-09). The payload already holds these, but a
      -- citation that can only be reached by parsing a blob cannot be audited,
      -- counted, or traced back across evaluations.
      CREATE TABLE evaluation_sources (
        evaluation_id   TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL,
        source_id       TEXT NOT NULL,
        title           TEXT NOT NULL,
        url             TEXT,
        publisher       TEXT,
        source_type     TEXT NOT NULL,
        retrieved_at    TEXT,
        excerpt         TEXT,
        PRIMARY KEY (evaluation_id, source_id)
      );
      CREATE INDEX idx_sources_org ON evaluation_sources (organization_id);

      CREATE TABLE evaluation_claims (
        evaluation_id   TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL,
        claim_id        TEXT NOT NULL,
        statement       TEXT NOT NULL,
        claim_type      TEXT NOT NULL,
        confidence      TEXT NOT NULL,
        section         TEXT,
        source_ids_json TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (evaluation_id, claim_id)
      );
      CREATE INDEX idx_claims_org ON evaluation_claims (organization_id);
      CREATE INDEX idx_claims_type ON evaluation_claims (evaluation_id, claim_type);

      CREATE TABLE audit_log (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id TEXT NOT NULL,
        actor_id        TEXT,
        action          TEXT NOT NULL,
        subject_type    TEXT NOT NULL,
        subject_id      TEXT NOT NULL,
        detail          TEXT,
        created_at      TEXT NOT NULL
      );
      CREATE INDEX idx_audit_org ON audit_log (organization_id, created_at DESC);
      CREATE INDEX idx_audit_subject ON audit_log (subject_type, subject_id);

      CREATE TABLE rate_limits (
        bucket_key   TEXT NOT NULL,
        window_start TEXT NOT NULL,
        count        INTEGER NOT NULL,
        PRIMARY KEY (bucket_key, window_start)
      );
    `,
  },
];
