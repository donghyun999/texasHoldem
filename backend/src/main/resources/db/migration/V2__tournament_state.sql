create table if not exists tournament_state (
    code varchar(16) primary key,
    payload text not null,
    updated_at timestamp not null default current_timestamp
);
