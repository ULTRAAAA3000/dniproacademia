CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  recovery TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'pending' CHECK (role IN ('pending','student','teacher')),
  class_id INTEGER,
  subject TEXT,
  reg_ip TEXT NOT NULL DEFAULT '',
  email_verified INTEGER NOT NULL DEFAULT 0,
  email_verify_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE class_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  UNIQUE (class_id, user_id)
);

CREATE TABLE subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (class_id, name)
);

CREATE TABLE schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  day INTEGER NOT NULL,
  period INTEGER NOT NULL,
  subject TEXT NOT NULL,
  group_name TEXT NOT NULL DEFAULT 'all' CHECK (group_name IN ('all','group1','group2')),
  week_type TEXT NOT NULL DEFAULT 'all' CHECK (week_type IN ('all','numerator','denominator'))
);
CREATE INDEX idx_schedule ON schedule (class_id, day, period);

CREATE TABLE homework (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  description TEXT,
  deadline TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_homework ON homework (class_id, created_at);

CREATE TABLE grades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  grade INTEGER NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_grades ON grades (student_id, subject);

CREATE TABLE final_grades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  grade INTEGER NOT NULL,
  semester INTEGER NOT NULL DEFAULT 1,
  UNIQUE (student_id, subject, semester)
);

CREATE TABLE chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a INTEGER NOT NULL,
  user_b INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_a, user_b)
);
CREATE INDEX idx_chats_a ON chats (user_a);
CREATE INDEX idx_chats_b ON chats (user_b);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  body TEXT,
  file_name TEXT,
  file_path TEXT,
  file_size INTEGER,
  reply_to INTEGER,
  edited_at TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_messages_chat ON messages (chat_id, created_at);

CREATE TABLE chat_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  other_id INTEGER NOT NULL,
  is_blocked INTEGER NOT NULL DEFAULT 0,
  is_muted INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, other_id)
);

CREATE TABLE ip_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL DEFAULT '',
  blocked_at TEXT NOT NULL DEFAULT (datetime('now')),
  blocked_by INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE reg_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  user_id INTEGER NOT NULL DEFAULT 0,
  registered_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reg_log ON reg_log (ip, registered_at);

CREATE TABLE submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  homework_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  filename TEXT NOT NULL DEFAULT '',
  filepath TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  grade INTEGER,
  grade_comment TEXT,
  graded_at TEXT
);

CREATE TABLE materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_materials ON materials (class_id, subject);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 0,
  user_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  entity TEXT NOT NULL DEFAULT '',
  entity_id INTEGER NOT NULL DEFAULT 0,
  details TEXT,
  ip TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_created ON audit_log (created_at);

CREATE TABLE login_fails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT 'bad_password',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_fails_ip ON login_fails (ip, created_at);

CREATE TABLE settings (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'user',
  expires_at INTEGER NOT NULL
);

CREATE TABLE transients (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
