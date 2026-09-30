-- +goose Up

CREATE TABLE roles (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE hospitals (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    address TEXT NOT NULL DEFAULT '',
    phone VARCHAR(50) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    title VARCHAR(150) NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rooms (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(100) NOT NULL UNIQUE,
    room_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_assigned_rooms (
    user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    room_id BIGINT NOT NULL
        REFERENCES rooms(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, room_id)
);

CREATE TABLE checklist_items (
    id           BIGSERIAL PRIMARY KEY,
    room_type    TEXT NOT NULL DEFAULT 'ALL',
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    is_required  BOOLEAN NOT NULL DEFAULT TRUE,
    order_number INT NOT NULL DEFAULT 99,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inspections (
    id               BIGSERIAL PRIMARY KEY,
    room_id          BIGINT NOT NULL
        REFERENCES rooms(id),
    inspector_id     BIGINT NOT NULL
        REFERENCES users(id),
    inspection_month DATE NOT NULL,
    notes            TEXT NOT NULL DEFAULT '',
    status           VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (room_id, inspection_month)
);

CREATE TABLE inspection_checklist_items (
    id                BIGSERIAL PRIMARY KEY,
    inspection_id     BIGINT NOT NULL
        REFERENCES inspections(id) ON DELETE CASCADE,
    checklist_item_id BIGINT NOT NULL
        REFERENCES checklist_items(id),
    answer_date       DATE NOT NULL,
    status            TEXT CHECK (status IS NULL OR status = 'GOOD'),
    notes             TEXT NOT NULL DEFAULT '',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (
        inspection_id,
        checklist_item_id,
        answer_date
    )
);

CREATE TABLE inspection_signatures (
    id              BIGSERIAL PRIMARY KEY,
    inspection_id   BIGINT NOT NULL
        REFERENCES inspections(id) ON DELETE CASCADE,
    signer_user_id  BIGINT
        REFERENCES users(id) ON DELETE SET NULL,
    role            TEXT NOT NULL,
    method          TEXT NOT NULL DEFAULT 'draw',
    signer_name     TEXT NOT NULL DEFAULT '',
    signer_title    TEXT NOT NULL DEFAULT '',
    image_data_url  TEXT NOT NULL DEFAULT '',
    signed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (inspection_id, role)
);

CREATE TABLE token_blacklist (
    jti        TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_users_role_id
    ON users(role_id);

CREATE INDEX idx_rooms_room_type
    ON rooms(room_type);

CREATE INDEX idx_user_assigned_rooms_room_id
    ON user_assigned_rooms(room_id);

CREATE INDEX idx_inspections_inspector_id
    ON inspections(inspector_id);

CREATE INDEX idx_inspections_month
    ON inspections(inspection_month);

CREATE INDEX idx_inspection_checklist_items_inspection_date
    ON inspection_checklist_items(inspection_id, answer_date);

CREATE INDEX idx_token_blacklist_expires 
    ON token_blacklist(expires_at);

-- +goose Down

DROP TABLE IF EXISTS token_blacklist;
DROP TABLE IF EXISTS inspection_signatures;
DROP TABLE IF EXISTS inspection_checklist_items;
DROP TABLE IF EXISTS inspections;
DROP TABLE IF EXISTS user_assigned_rooms;
DROP TABLE IF EXISTS checklist_items;
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS hospitals;
DROP TABLE IF EXISTS roles;