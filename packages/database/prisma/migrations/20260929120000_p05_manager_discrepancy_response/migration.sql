ALTER TABLE discrepancy_actions DROP CONSTRAINT IF EXISTS discrepancy_actions_action_type_check;
ALTER TABLE discrepancy_actions ADD CONSTRAINT discrepancy_actions_action_type_check
  CHECK (action_type IN ('COMMENT', 'REQUEST_INFO', 'MANAGER_RESPONSE', 'RECLASSIFY', 'ADJUST', 'RESOLVE', 'REOPEN'));
