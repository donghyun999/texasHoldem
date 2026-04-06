create table if not exists app_health_marker (
    id bigint primary key,
    created_at timestamp not null default current_timestamp
);
