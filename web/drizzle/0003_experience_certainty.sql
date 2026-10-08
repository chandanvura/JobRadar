-- Correct title-inferred experience without deleting jobs or private application state.
UPDATE jobs SET experience_min=NULL, experience_max=NULL,
 experience_label='Entry-level title — experience unverified', is_eligible=0,
 eligibility_reason='Entry-level title — experience unverified', updated_at=CURRENT_TIMESTAMP
WHERE experience_label='Entry-level title';
