-- What this user thinks of an event — want / planned / visited, and a note.
-- The same shape as user_places, so an event's popup can offer exactly what a
-- place's does, and the Status / "My list only" filters mean the same thing
-- for both.
CREATE TABLE user_events (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status     TEXT CHECK (status IN ('want','planned','visited')),
  note       TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, event_id)
);
CREATE INDEX idx_user_events_status ON user_events(user_id, status);
