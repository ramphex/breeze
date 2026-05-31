-- 2026-05-30: RLS for tenant CHILD tables keyed by a parent FK (no org_id).
--
-- Root cause (security review F2/F5/F6/F7 + systemic): the RLS coverage
-- contract test auto-discovers tenant tables by the presence of an `org_id`
-- column. Tenant child tables that reach their tenant only through a parent
-- FK (and carry no denormalized org_id) are therefore invisible to the test
-- AND tended to ship with NO row-level security at all — violating the
-- CLAUDE.md invariant "no app-layer-only fallback". This migration installs
-- ENABLE + FORCE RLS and per-command policies on the seven such tables, and a
-- companion change to rls-coverage.integration.test.ts adds a new
-- "parent-FK join-policy" allowlist + assertion so the class stops recurring.
--
-- Shape: like the Phase-5 device-join policies, but the join target is the
-- table's actual parent (automations / configuration_policies / ai_sessions /
-- software_catalog / alerts) rather than `devices`. The org axis is the
-- PARENT's org_id, reached via breeze_has_org_access(parent.org_id).
--
-- This works because every listed parent has a NOT-NULL org_id, so the child's
-- EXISTS join reduces to breeze_has_org_access(<a real org>) — the path that
-- evaluates correctly under the production driver's bound-parameter writes.
-- (A parent with a NULLABLE org_id needing an `is_system`-style branch does NOT
-- work as a nested-RLS join under bound parameters; script_execution_batches is
-- exactly that case and is handled by denormalization in
-- 2026-05-31-script-execution-batches-org-id.sql instead — NOT here.)
--
-- Safety (why this cannot break existing writes): each of these child rows is
-- created/updated in a db-access context that already reaches the parent's org
-- (you cannot create a child of a parent you cannot see). The child's EXISTS
-- join evaluates breeze_has_org_access against the parent's org, so it passes
-- in exactly the contexts the parent's own policy already passes. System/
-- background writers run under withSystemDbAccessContext, where
-- breeze_has_org_access short-circuits TRUE.
--
-- One special case:
--   * automation_runs reaches its org via EITHER automation_id -> automations
--     OR config_policy_id -> configuration_policies (config-policy-driven runs
--     leave automation_id NULL). The policy OR's both EXISTS branches so
--     neither run flavor becomes invisible/uninsertable. Both parents have a
--     NOT-NULL org_id, so each branch is a breeze_has_org_access(<real org>).
--
-- Idempotent: DROP POLICY IF EXISTS x4 before each CREATE; ENABLE/FORCE are
-- no-ops when already set. Re-running converges to the same state.
-- autoMigrate wraps each migration file in a transaction — no inner BEGIN/COMMIT.

-- ---------------------------------------------------------------------------
-- automation_runs  ->  automations(automation_id) OR configuration_policies(config_policy_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS breeze_org_isolation_select ON automation_runs;
DROP POLICY IF EXISTS breeze_org_isolation_insert ON automation_runs;
DROP POLICY IF EXISTS breeze_org_isolation_update ON automation_runs;
DROP POLICY IF EXISTS breeze_org_isolation_delete ON automation_runs;
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY breeze_org_isolation_select ON automation_runs FOR SELECT USING (
  EXISTS (SELECT 1 FROM automations a WHERE a.id = automation_runs.automation_id AND public.breeze_has_org_access(a.org_id))
  OR EXISTS (SELECT 1 FROM configuration_policies cp WHERE cp.id = automation_runs.config_policy_id AND public.breeze_has_org_access(cp.org_id))
);
CREATE POLICY breeze_org_isolation_insert ON automation_runs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM automations a WHERE a.id = automation_runs.automation_id AND public.breeze_has_org_access(a.org_id))
  OR EXISTS (SELECT 1 FROM configuration_policies cp WHERE cp.id = automation_runs.config_policy_id AND public.breeze_has_org_access(cp.org_id))
);
CREATE POLICY breeze_org_isolation_update ON automation_runs FOR UPDATE USING (
  EXISTS (SELECT 1 FROM automations a WHERE a.id = automation_runs.automation_id AND public.breeze_has_org_access(a.org_id))
  OR EXISTS (SELECT 1 FROM configuration_policies cp WHERE cp.id = automation_runs.config_policy_id AND public.breeze_has_org_access(cp.org_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM automations a WHERE a.id = automation_runs.automation_id AND public.breeze_has_org_access(a.org_id))
  OR EXISTS (SELECT 1 FROM configuration_policies cp WHERE cp.id = automation_runs.config_policy_id AND public.breeze_has_org_access(cp.org_id))
);
CREATE POLICY breeze_org_isolation_delete ON automation_runs FOR DELETE USING (
  EXISTS (SELECT 1 FROM automations a WHERE a.id = automation_runs.automation_id AND public.breeze_has_org_access(a.org_id))
  OR EXISTS (SELECT 1 FROM configuration_policies cp WHERE cp.id = automation_runs.config_policy_id AND public.breeze_has_org_access(cp.org_id))
);

-- ---------------------------------------------------------------------------
-- ai_messages  ->  ai_sessions(session_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS breeze_org_isolation_select ON ai_messages;
DROP POLICY IF EXISTS breeze_org_isolation_insert ON ai_messages;
DROP POLICY IF EXISTS breeze_org_isolation_update ON ai_messages;
DROP POLICY IF EXISTS breeze_org_isolation_delete ON ai_messages;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY breeze_org_isolation_select ON ai_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM ai_sessions s WHERE s.id = ai_messages.session_id AND public.breeze_has_org_access(s.org_id))
);
CREATE POLICY breeze_org_isolation_insert ON ai_messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM ai_sessions s WHERE s.id = ai_messages.session_id AND public.breeze_has_org_access(s.org_id))
);
CREATE POLICY breeze_org_isolation_update ON ai_messages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM ai_sessions s WHERE s.id = ai_messages.session_id AND public.breeze_has_org_access(s.org_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM ai_sessions s WHERE s.id = ai_messages.session_id AND public.breeze_has_org_access(s.org_id))
);
CREATE POLICY breeze_org_isolation_delete ON ai_messages FOR DELETE USING (
  EXISTS (SELECT 1 FROM ai_sessions s WHERE s.id = ai_messages.session_id AND public.breeze_has_org_access(s.org_id))
);

-- ---------------------------------------------------------------------------
-- ai_tool_executions  ->  ai_sessions(session_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS breeze_org_isolation_select ON ai_tool_executions;
DROP POLICY IF EXISTS breeze_org_isolation_insert ON ai_tool_executions;
DROP POLICY IF EXISTS breeze_org_isolation_update ON ai_tool_executions;
DROP POLICY IF EXISTS breeze_org_isolation_delete ON ai_tool_executions;
ALTER TABLE ai_tool_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tool_executions FORCE ROW LEVEL SECURITY;
CREATE POLICY breeze_org_isolation_select ON ai_tool_executions FOR SELECT USING (
  EXISTS (SELECT 1 FROM ai_sessions s WHERE s.id = ai_tool_executions.session_id AND public.breeze_has_org_access(s.org_id))
);
CREATE POLICY breeze_org_isolation_insert ON ai_tool_executions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM ai_sessions s WHERE s.id = ai_tool_executions.session_id AND public.breeze_has_org_access(s.org_id))
);
CREATE POLICY breeze_org_isolation_update ON ai_tool_executions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM ai_sessions s WHERE s.id = ai_tool_executions.session_id AND public.breeze_has_org_access(s.org_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM ai_sessions s WHERE s.id = ai_tool_executions.session_id AND public.breeze_has_org_access(s.org_id))
);
CREATE POLICY breeze_org_isolation_delete ON ai_tool_executions FOR DELETE USING (
  EXISTS (SELECT 1 FROM ai_sessions s WHERE s.id = ai_tool_executions.session_id AND public.breeze_has_org_access(s.org_id))
);

-- NOTE: script_execution_batches is intentionally NOT handled here. Its parent
-- `scripts` has a nullable org_id (system scripts), and a nested-RLS EXISTS
-- through scripts could not satisfy the system-script INSERT under bound-
-- parameter (extended-protocol) writes — the production driver. It is given a
-- denormalized org_id + a direct org policy in
-- 2026-05-31-script-execution-batches-org-id.sql instead.

-- ---------------------------------------------------------------------------
-- software_versions  ->  software_catalog(catalog_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS breeze_org_isolation_select ON software_versions;
DROP POLICY IF EXISTS breeze_org_isolation_insert ON software_versions;
DROP POLICY IF EXISTS breeze_org_isolation_update ON software_versions;
DROP POLICY IF EXISTS breeze_org_isolation_delete ON software_versions;
ALTER TABLE software_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE software_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY breeze_org_isolation_select ON software_versions FOR SELECT USING (
  EXISTS (SELECT 1 FROM software_catalog sc WHERE sc.id = software_versions.catalog_id AND public.breeze_has_org_access(sc.org_id))
);
CREATE POLICY breeze_org_isolation_insert ON software_versions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM software_catalog sc WHERE sc.id = software_versions.catalog_id AND public.breeze_has_org_access(sc.org_id))
);
CREATE POLICY breeze_org_isolation_update ON software_versions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM software_catalog sc WHERE sc.id = software_versions.catalog_id AND public.breeze_has_org_access(sc.org_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM software_catalog sc WHERE sc.id = software_versions.catalog_id AND public.breeze_has_org_access(sc.org_id))
);
CREATE POLICY breeze_org_isolation_delete ON software_versions FOR DELETE USING (
  EXISTS (SELECT 1 FROM software_catalog sc WHERE sc.id = software_versions.catalog_id AND public.breeze_has_org_access(sc.org_id))
);

-- ---------------------------------------------------------------------------
-- alert_correlations  ->  alerts(parent_alert_id)
-- Joined via parent_alert_id only. The table also has a NOT-NULL child_alert_id
-- FK to alerts that is intentionally NOT org-checked here: the correlation
-- engine only links alerts within one org, so the parent alert's org governs
-- the row. If cross-org correlations ever become possible, gate child_alert_id
-- too (or require both alerts to be org-accessible).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS breeze_org_isolation_select ON alert_correlations;
DROP POLICY IF EXISTS breeze_org_isolation_insert ON alert_correlations;
DROP POLICY IF EXISTS breeze_org_isolation_update ON alert_correlations;
DROP POLICY IF EXISTS breeze_org_isolation_delete ON alert_correlations;
ALTER TABLE alert_correlations ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_correlations FORCE ROW LEVEL SECURITY;
CREATE POLICY breeze_org_isolation_select ON alert_correlations FOR SELECT USING (
  EXISTS (SELECT 1 FROM alerts al WHERE al.id = alert_correlations.parent_alert_id AND public.breeze_has_org_access(al.org_id))
);
CREATE POLICY breeze_org_isolation_insert ON alert_correlations FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM alerts al WHERE al.id = alert_correlations.parent_alert_id AND public.breeze_has_org_access(al.org_id))
);
CREATE POLICY breeze_org_isolation_update ON alert_correlations FOR UPDATE USING (
  EXISTS (SELECT 1 FROM alerts al WHERE al.id = alert_correlations.parent_alert_id AND public.breeze_has_org_access(al.org_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM alerts al WHERE al.id = alert_correlations.parent_alert_id AND public.breeze_has_org_access(al.org_id))
);
CREATE POLICY breeze_org_isolation_delete ON alert_correlations FOR DELETE USING (
  EXISTS (SELECT 1 FROM alerts al WHERE al.id = alert_correlations.parent_alert_id AND public.breeze_has_org_access(al.org_id))
);

-- ---------------------------------------------------------------------------
-- alert_notifications  ->  alerts(alert_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS breeze_org_isolation_select ON alert_notifications;
DROP POLICY IF EXISTS breeze_org_isolation_insert ON alert_notifications;
DROP POLICY IF EXISTS breeze_org_isolation_update ON alert_notifications;
DROP POLICY IF EXISTS breeze_org_isolation_delete ON alert_notifications;
ALTER TABLE alert_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY breeze_org_isolation_select ON alert_notifications FOR SELECT USING (
  EXISTS (SELECT 1 FROM alerts al WHERE al.id = alert_notifications.alert_id AND public.breeze_has_org_access(al.org_id))
);
CREATE POLICY breeze_org_isolation_insert ON alert_notifications FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM alerts al WHERE al.id = alert_notifications.alert_id AND public.breeze_has_org_access(al.org_id))
);
CREATE POLICY breeze_org_isolation_update ON alert_notifications FOR UPDATE USING (
  EXISTS (SELECT 1 FROM alerts al WHERE al.id = alert_notifications.alert_id AND public.breeze_has_org_access(al.org_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM alerts al WHERE al.id = alert_notifications.alert_id AND public.breeze_has_org_access(al.org_id))
);
CREATE POLICY breeze_org_isolation_delete ON alert_notifications FOR DELETE USING (
  EXISTS (SELECT 1 FROM alerts al WHERE al.id = alert_notifications.alert_id AND public.breeze_has_org_access(al.org_id))
);
