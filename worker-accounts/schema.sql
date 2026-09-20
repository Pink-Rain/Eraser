-- Schema for the shared Eraser accounts Worker.
-- Mirrors the identity-related tables from the main app's db/schema.ts
-- (users, sessions, google_drive_authorizations, google_oauth_settings),
-- kept in a dedicated D1 database so every installed copy of Eraser
-- shares the same accounts/roles directory and Google Drive connection.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin', 'mj', 'joueur')),
  status TEXT NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente', 'actif', 'suspendu')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS users_status_idx ON users(status);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS google_drive_authorizations (
  id TEXT PRIMARY KEY,
  google_email TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  refresh_token_iv TEXT NOT NULL,
  access_token_ciphertext TEXT,
  access_token_iv TEXT,
  access_token_expires_at INTEGER,
  scopes TEXT NOT NULL,
  connected_by TEXT NOT NULL REFERENCES users(id),
  connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS google_oauth_settings (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_secret_ciphertext TEXT,
  client_secret_iv TEXT,
  configured_by TEXT NOT NULL REFERENCES users(id),
  configured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
