alter table tournament_state
    add column if not exists created_at timestamp;

update tournament_state
set created_at = updated_at
where created_at is null;

alter table tournament_state
    alter column created_at set default current_timestamp;

alter table tournament_state
    alter column created_at set not null;
