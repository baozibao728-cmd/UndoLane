CREATE TABLE workspaces (id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision >= 0));
INSERT INTO workspaces VALUES ('local', 0);
CREATE TABLE resources (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 kind TEXT NOT NULL DEFAULT 'asset', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE actions (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('human','agent')), actor_id TEXT NOT NULL,
 operation_key TEXT NOT NULL, request_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(workspace_id, actor_id, operation_key)
);
CREATE TABLE effects (
 id TEXT PRIMARY KEY, action_id TEXT NOT NULL REFERENCES actions(id),
 resource_id TEXT NOT NULL REFERENCES resources(id), field TEXT NOT NULL,
 before_present INTEGER NOT NULL, before_json TEXT NOT NULL, before_revision INTEGER NOT NULL,
 previous_effect_id TEXT REFERENCES effects(id), after_present INTEGER NOT NULL,
 after_json TEXT NOT NULL, after_revision INTEGER NOT NULL,
 UNIQUE(action_id, resource_id, field)
);
CREATE TABLE resource_fields (
 workspace_id TEXT NOT NULL REFERENCES workspaces(id), resource_id TEXT NOT NULL REFERENCES resources(id),
 field TEXT NOT NULL CHECK(field IN ('display_name','campaign','status','note')),
 present INTEGER NOT NULL CHECK(present IN (0,1)), value_json TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision >= 0), active_effect_id TEXT REFERENCES effects(id), last_mutation_id TEXT,
 PRIMARY KEY(workspace_id, resource_id, field)
);
CREATE TABLE undo_plans (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 target_action_id TEXT NOT NULL REFERENCES actions(id), base_revision INTEGER NOT NULL,
 plan_hash TEXT NOT NULL, items_json TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE undo_commits (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 plan_id TEXT NOT NULL UNIQUE REFERENCES undo_plans(id), operation_key TEXT NOT NULL UNIQUE,
 selected_effect_ids_json TEXT NOT NULL, receipt_json TEXT NOT NULL,
 committed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE compensations (
 id TEXT PRIMARY KEY, undo_commit_id TEXT NOT NULL REFERENCES undo_commits(id),
 effect_id TEXT NOT NULL UNIQUE REFERENCES effects(id),
 before_revision INTEGER NOT NULL, after_revision INTEGER NOT NULL,
 CHECK(after_revision = before_revision + 1)
);
CREATE INDEX effects_action ON effects(action_id);
PRAGMA user_version = 1;
