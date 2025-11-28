DROP TABLE IF EXISTS repos;
CREATE TABLE repos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  latest_tag TEXT,
  latest_release_at TEXT,
  updated_at TEXT,
  UNIQUE(owner, repo)
);
