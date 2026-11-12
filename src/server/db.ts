import type {
  User, ClassRow, SubjectRow, ScheduleRow, HomeworkRow, GradeRow, FinalGradeRow,
  MaterialRow, MessageRow, ChatListRow, StudentGrades, AuditActor,
} from "./types";
import { nowSql, nowSeconds, sqlMinutesAgo } from "./utils";

export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
  return await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<User>();
}

export async function getUser(db: D1Database, id: number): Promise<User | null> {
  return await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<User>();
}

export async function getPendingUsers(db: D1Database): Promise<User[]> {
  const r = await db.prepare("SELECT * FROM users WHERE role = 'pending' ORDER BY created_at DESC").all<User>();
  return r.results;
}

export async function getStudents(db: D1Database): Promise<User[]> {
  const r = await db.prepare("SELECT * FROM users WHERE role = 'student' ORDER BY last_name, first_name").all<User>();
  return r.results;
}

export async function getTeachers(db: D1Database): Promise<User[]> {
  const r = await db.prepare("SELECT * FROM users WHERE role = 'teacher' ORDER BY last_name, first_name").all<User>();
  return r.results;
}

export async function getClasses(db: D1Database): Promise<ClassRow[]> {
  const r = await db.prepare("SELECT * FROM classes ORDER BY name").all<ClassRow>();
  return r.results;
}

export async function getClass(db: D1Database, id: number): Promise<ClassRow | null> {
  return await db.prepare("SELECT * FROM classes WHERE id = ?").bind(id).first<ClassRow>();
}

export async function getClassMembers(db: D1Database, classId: number, role: string): Promise<User[]> {
  const r = await db
    .prepare(
      "SELECT u.* FROM users u JOIN class_members cm ON cm.user_id = u.id WHERE cm.class_id = ? AND u.role = ? ORDER BY u.last_name, u.first_name"
    )
    .bind(classId, role)
    .all<User>();
  return r.results;
}

export async function getClassSubjects(db: D1Database, classId: number): Promise<SubjectRow[]> {
  const r = await db.prepare("SELECT * FROM subjects WHERE class_id = ? ORDER BY name").bind(classId).all<SubjectRow>();
  return r.results;
}

export async function getSchedule(db: D1Database, classId: number): Promise<ScheduleRow[]> {
  const r = await db
    .prepare("SELECT * FROM schedule WHERE class_id = ? ORDER BY day, period")
    .bind(classId)
    .all<ScheduleRow>();
  return r.results;
}

export async function getUserClasses(db: D1Database, userId: number): Promise<ClassRow[]> {
  const r = await db
    .prepare(
      "SELECT c.* FROM classes c JOIN class_members cm ON cm.class_id = c.id WHERE cm.user_id = ? ORDER BY c.name"
    )
    .bind(userId)
    .all<ClassRow>();
  return r.results;
}

export async function isClassMember(db: D1Database, userId: number, classId: number): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM class_members WHERE user_id = ? AND class_id = ?")
    .bind(userId, classId)
    .first();
  return row !== null;
}

export async function getHomework(db: D1Database, classId: number): Promise<HomeworkRow[]> {
  const r = await db
    .prepare(
      "SELECT h.*, u.last_name || ' ' || u.first_name AS teacher_name FROM homework h JOIN users u ON u.id = h.teacher_id WHERE h.class_id = ? ORDER BY h.created_at DESC, h.id DESC"
    )
    .bind(classId)
    .all<HomeworkRow>();
  return r.results;
}

export async function getTeacherHomework(db: D1Database, classId: number, teacherId: number): Promise<HomeworkRow[]> {
  const r = await db
    .prepare("SELECT * FROM homework WHERE class_id = ? AND teacher_id = ? ORDER BY created_at DESC, id DESC")
    .bind(classId, teacherId)
    .all<HomeworkRow>();
  return r.results;
}

export async function getHomeworkBySubject(db: D1Database, classId: number, subject: string): Promise<HomeworkRow[]> {
  const r = await db
    .prepare(
      "SELECT h.*, u.last_name || ' ' || u.first_name AS teacher_name FROM homework h JOIN users u ON u.id = h.teacher_id WHERE h.class_id = ? AND h.subject = ? ORDER BY h.created_at DESC, h.id DESC"
    )
    .bind(classId, subject)
    .all<HomeworkRow>();
  return r.results;
}

export async function getStudentGrades(db: D1Database, studentId: number, classId: number): Promise<GradeRow[]> {
  const r = await db
    .prepare(
      "SELECT g.*, u.last_name || ' ' || u.first_name AS teacher_name FROM grades g JOIN users u ON u.id = g.teacher_id WHERE g.student_id = ? AND g.class_id = ? ORDER BY g.created_at DESC, g.id DESC"
    )
    .bind(studentId, classId)
    .all<GradeRow>();
  return r.results;
}

export async function getStudentSubjectGrades(
  db: D1Database,
  studentId: number,
  classId: number,
  subject: string
): Promise<GradeRow[]> {
  const r = await db
    .prepare(
      "SELECT * FROM grades WHERE student_id = ? AND class_id = ? AND subject = ? ORDER BY created_at DESC, id DESC"
    )
    .bind(studentId, classId, subject)
    .all<GradeRow>();
  return r.results;
}

export async function getClassStudentsGrades(db: D1Database, classId: number, subject: string): Promise<StudentGrades[]> {
  const students = await db
    .prepare(
      "SELECT u.id, u.first_name, u.last_name FROM users u JOIN class_members cm ON cm.user_id = u.id AND cm.class_id = ? WHERE u.role = 'student' ORDER BY u.last_name, u.first_name"
    )
    .bind(classId)
    .all<{ id: number; first_name: string; last_name: string }>();

  const grades = await db
    .prepare("SELECT student_id, grade FROM grades WHERE class_id = ? AND subject = ? ORDER BY created_at, id")
    .bind(classId, subject)
    .all<{ student_id: number; grade: number }>();

  const result: StudentGrades[] = [];
  for (let i = 0; i < students.results.length; i++) {
    const st = students.results[i];
    const list: number[] = [];
    for (let j = 0; j < grades.results.length; j++) {
      if (grades.results[j].student_id === st.id) {
        list.push(grades.results[j].grade);
      }
    }
    let avg: number | null = null;
    if (list.length > 0) {
      let sum = 0;
      for (let k = 0; k < list.length; k++) sum += list[k];
      avg = Math.round((sum / list.length) * 100) / 100;
    }
    result.push({
      id: st.id,
      first_name: st.first_name,
      last_name: st.last_name,
      avg_grade: avg,
      all_grades: list.join(", "),
    });
  }
  return result;
}

export async function getAvgBySubject(
  db: D1Database,
  studentId: number,
  classId: number
): Promise<{ subject: string; avg_grade: number }[]> {
  const r = await db
    .prepare(
      "SELECT subject, ROUND(AVG(grade), 2) AS avg_grade FROM grades WHERE student_id = ? AND class_id = ? GROUP BY subject ORDER BY subject"
    )
    .bind(studentId, classId)
    .all<{ subject: string; avg_grade: number }>();
  return r.results;
}

export async function getOverallAvg(db: D1Database, studentId: number, classId: number): Promise<number> {
  const row = await db
    .prepare("SELECT ROUND(AVG(grade), 2) AS avg FROM grades WHERE student_id = ? AND class_id = ?")
    .bind(studentId, classId)
    .first<{ avg: number | null }>();
  if (!row || !row.avg) return 0;
  return row.avg;
}

export async function getFinalGrades(db: D1Database, studentId: number, classId: number): Promise<FinalGradeRow[]> {
  const r = await db
    .prepare("SELECT * FROM final_grades WHERE student_id = ? AND class_id = ?")
    .bind(studentId, classId)
    .all<FinalGradeRow>();
  return r.results;
}

export async function getClassFinalGrades(db: D1Database, classId: number, subject: string): Promise<FinalGradeRow[]> {
  const r = await db
    .prepare("SELECT * FROM final_grades WHERE class_id = ? AND subject = ?")
    .bind(classId, subject)
    .all<FinalGradeRow>();
  return r.results;
}

export async function getMaterials(db: D1Database, classId: number): Promise<MaterialRow[]> {
  const r = await db
    .prepare(
      "SELECT m.*, u.last_name || ' ' || u.first_name AS teacher_name FROM materials m JOIN users u ON u.id = m.teacher_id WHERE m.class_id = ? ORDER BY m.created_at DESC, m.id DESC"
    )
    .bind(classId)
    .all<MaterialRow>();
  return r.results;
}

export async function getTeacherMaterials(db: D1Database, classId: number, teacherId: number): Promise<MaterialRow[]> {
  const r = await db
    .prepare("SELECT * FROM materials WHERE class_id = ? AND teacher_id = ? ORDER BY created_at DESC, id DESC")
    .bind(classId, teacherId)
    .all<MaterialRow>();
  return r.results;
}

export async function getOrCreateChat(db: D1Database, a: number, b: number): Promise<number> {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  const found = await db
    .prepare("SELECT id FROM chats WHERE user_a = ? AND user_b = ?")
    .bind(low, high)
    .first<{ id: number }>();
  if (found) return found.id;
  const res = await db.prepare("INSERT INTO chats (user_a, user_b) VALUES (?, ?)").bind(low, high).run();
  return res.meta.last_row_id;
}

export async function getChat(
  db: D1Database,
  chatId: number,
  userId: number
): Promise<{ id: number; user_a: number; user_b: number } | null> {
  return await db
    .prepare("SELECT * FROM chats WHERE id = ? AND (user_a = ? OR user_b = ?)")
    .bind(chatId, userId, userId)
    .first<{ id: number; user_a: number; user_b: number }>();
}

export async function getUserChats(db: D1Database, userId: number): Promise<ChatListRow[]> {
  const other = "(CASE WHEN c.user_a = ?1 THEN c.user_b ELSE c.user_a END)";
  const sql =
    "SELECT c.id, " + other + " AS other_id, " +
    "u.last_name || ' ' || u.first_name AS other_name, " +
    "(SELECT body FROM messages m2 WHERE m2.chat_id = c.id AND m2.is_deleted = 0 ORDER BY m2.created_at DESC, m2.id DESC LIMIT 1) AS last_msg, " +
    "(SELECT file_name FROM messages m3 WHERE m3.chat_id = c.id AND m3.is_deleted = 0 ORDER BY m3.created_at DESC, m3.id DESC LIMIT 1) AS last_file, " +
    "(SELECT created_at FROM messages m4 WHERE m4.chat_id = c.id ORDER BY m4.created_at DESC, m4.id DESC LIMIT 1) AS last_at, " +
    "(SELECT COUNT(*) FROM messages m5 WHERE m5.chat_id = c.id AND m5.sender_id != ?1 AND m5.is_read = 0 " +
    "AND NOT EXISTS (SELECT 1 FROM chat_settings cs2 WHERE cs2.user_id = ?1 AND cs2.other_id = m5.sender_id AND cs2.is_muted = 1)) AS unread, " +
    "COALESCE((SELECT cs3.is_muted FROM chat_settings cs3 WHERE cs3.user_id = ?1 AND cs3.other_id = " + other + "), 0) AS is_muted " +
    "FROM chats c JOIN users u ON u.id = " + other + " " +
    "WHERE c.user_a = ?1 OR c.user_b = ?1 " +
    "ORDER BY COALESCE(last_at, c.created_at) DESC";
  const r = await db.prepare(sql).bind(userId).all<ChatListRow>();
  return r.results;
}

export async function getMessages(
  db: D1Database,
  chatId: number,
  limit: number,
  beforeId: number
): Promise<MessageRow[]> {
  let sql =
    "SELECT m.*, u.last_name || ' ' || u.first_name AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.chat_id = ?";
  const params: number[] = [chatId];
  if (beforeId) {
    sql += " AND m.id < ?";
    params.push(beforeId);
  }
  sql += " ORDER BY m.created_at DESC, m.id DESC LIMIT ?";
  params.push(limit);
  const r = await db.prepare(sql).bind(...params).all<MessageRow>();
  return r.results;
}

export async function getMessage(db: D1Database, id: number): Promise<MessageRow | null> {
  return await db.prepare("SELECT * FROM messages WHERE id = ?").bind(id).first<MessageRow>();
}

export async function markChatRead(db: D1Database, chatId: number, userId: number): Promise<void> {
  await db
    .prepare("UPDATE messages SET is_read = 1 WHERE chat_id = ? AND sender_id != ? AND is_read = 0")
    .bind(chatId, userId)
    .run();
}

export async function countUnreadMessages(db: D1Database, userId: number): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS c FROM messages m JOIN chats c ON c.id = m.chat_id WHERE (c.user_a = ?1 OR c.user_b = ?1) AND m.sender_id != ?1 AND m.is_read = 0 AND NOT EXISTS (SELECT 1 FROM chat_settings cs WHERE cs.user_id = ?1 AND cs.other_id = m.sender_id AND cs.is_muted = 1)"
    )
    .bind(userId)
    .first<{ c: number }>();
  if (!row) return 0;
  return row.c;
}

export async function getChatSetting(
  db: D1Database,
  userId: number,
  otherId: number,
  field: "is_blocked" | "is_muted"
): Promise<boolean> {
  const row = await db
    .prepare("SELECT is_blocked, is_muted FROM chat_settings WHERE user_id = ? AND other_id = ?")
    .bind(userId, otherId)
    .first<{ is_blocked: number; is_muted: number }>();
  if (!row) return false;
  return row[field] === 1;
}

export async function setChatSetting(
  db: D1Database,
  userId: number,
  otherId: number,
  field: "is_blocked" | "is_muted",
  value: number
): Promise<void> {
  const sql =
    "INSERT INTO chat_settings (user_id, other_id, " + field + ") VALUES (?, ?, ?) ON CONFLICT (user_id, other_id) DO UPDATE SET " + field + " = ?";
  await db.prepare(sql).bind(userId, otherId, value, value).run();
}

export async function editMessage(db: D1Database, id: number, senderId: number, body: string): Promise<boolean> {
  const res = await db
    .prepare("UPDATE messages SET body = ?, edited_at = ? WHERE id = ? AND sender_id = ?")
    .bind(body, nowSql(), id, senderId)
    .run();
  return res.meta.changes > 0;
}

export async function deleteMessage(db: D1Database, id: number, senderId: number): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE messages SET is_deleted = 1, body = NULL, file_path = NULL, file_name = NULL WHERE id = ? AND sender_id = ?"
    )
    .bind(id, senderId)
    .run();
  return res.meta.changes > 0;
}

export async function getChatFilePaths(db: D1Database, chatId: number): Promise<string[]> {
  const r = await db
    .prepare("SELECT file_path FROM messages WHERE chat_id = ? AND file_path IS NOT NULL")
    .bind(chatId)
    .all<{ file_path: string }>();
  const list: string[] = [];
  for (let i = 0; i < r.results.length; i++) {
    list.push(r.results[i].file_path);
  }
  return list;
}

export async function deleteChatMessages(db: D1Database, chatId: number): Promise<void> {
  await db.prepare("DELETE FROM messages WHERE chat_id = ?").bind(chatId).run();
}

export async function searchUsers(
  db: D1Database,
  query: string,
  excludeId: number
): Promise<{ id: number; first_name: string; last_name: string; email: string; role: string }[]> {
  const like = "%" + query.replace(/[%_]/g, "") + "%";
  const r = await db
    .prepare(
      "SELECT id, first_name, last_name, email, role FROM users WHERE (email LIKE ?1 OR last_name || ' ' || first_name LIKE ?1) AND id != ?2 AND role != 'pending' ORDER BY last_name, first_name LIMIT 10"
    )
    .bind(like, excludeId)
    .all<{ id: number; first_name: string; last_name: string; email: string; role: string }>();
  return r.results;
}

export async function isIpBlacklisted(db: D1Database, ip: string): Promise<boolean> {
  const row = await db.prepare("SELECT id FROM ip_blacklist WHERE ip = ?").bind(ip).first();
  return row !== null;
}

export async function countRegistrationsFromIp(db: D1Database, ip: string, days: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS c FROM reg_log WHERE ip = ? AND registered_at >= ?")
    .bind(ip, sqlMinutesAgo(days * 1440))
    .first<{ c: number }>();
  if (!row) return 0;
  return row.c;
}

export async function logRegistration(db: D1Database, ip: string, userId: number): Promise<void> {
  await db.prepare("INSERT INTO reg_log (ip, user_id, registered_at) VALUES (?, ?, ?)").bind(ip, userId, nowSql()).run();
}

export async function getBlacklist(db: D1Database): Promise<{ ip: string; reason: string; blocked_at: string }[]> {
  const r = await db
    .prepare("SELECT ip, reason, blocked_at FROM ip_blacklist ORDER BY blocked_at DESC, id DESC")
    .all<{ ip: string; reason: string; blocked_at: string }>();
  return r.results;
}

export async function getRegLog(
  db: D1Database,
  limit: number
): Promise<{ ip: string; user_name: string | null; email: string | null; registered_at: string }[]> {
  const r = await db
    .prepare(
      "SELECT r.ip, r.registered_at, u.last_name || ' ' || u.first_name AS user_name, u.email FROM reg_log r LEFT JOIN users u ON u.id = r.user_id ORDER BY r.registered_at DESC, r.id DESC LIMIT ?"
    )
    .bind(limit)
    .all<{ ip: string; user_name: string | null; email: string | null; registered_at: string }>();
  return r.results;
}

export async function getClassStudents(db: D1Database, classId: number): Promise<{ id: number; first_name: string; last_name: string }[]> {
  const r = await db
    .prepare(
      "SELECT u.id, u.first_name, u.last_name FROM users u JOIN class_members cm ON cm.user_id = u.id WHERE cm.class_id = ? AND u.role = 'student' ORDER BY u.last_name, u.first_name"
    )
    .bind(classId)
    .all<{ id: number; first_name: string; last_name: string }>();
  return r.results;
}

export async function getExportData(db: D1Database, classId: number, subjectFilter: string) {
  const students = await getClassStudents(db, classId);

  let subjectRows;
  if (subjectFilter) {
    subjectRows = await db
      .prepare("SELECT name FROM subjects WHERE class_id = ? AND name = ?")
      .bind(classId, subjectFilter)
      .all<{ name: string }>();
  } else {
    subjectRows = await db
      .prepare("SELECT name FROM subjects WHERE class_id = ? ORDER BY name")
      .bind(classId)
      .all<{ name: string }>();
  }
  const subjects: string[] = [];
  for (let i = 0; i < subjectRows.results.length; i++) {
    subjects.push(subjectRows.results[i].name);
  }

  const gradeRows = await db
    .prepare("SELECT student_id, subject, grade FROM grades WHERE class_id = ? ORDER BY created_at, id")
    .bind(classId)
    .all<{ student_id: number; subject: string; grade: number }>();

  const grades: Record<string, { avg: number; all: string }> = {};
  const lists: Record<string, number[]> = {};
  for (let i = 0; i < gradeRows.results.length; i++) {
    const g = gradeRows.results[i];
    const key = g.student_id + "|" + g.subject;
    if (!lists[key]) lists[key] = [];
    lists[key].push(g.grade);
  }
  for (const key in lists) {
    let sum = 0;
    for (let i = 0; i < lists[key].length; i++) sum += lists[key][i];
    grades[key] = { avg: Math.round((sum / lists[key].length) * 10) / 10, all: lists[key].join(", ") };
  }

  const finalRows = await db
    .prepare("SELECT student_id, subject, grade FROM final_grades WHERE class_id = ?")
    .bind(classId)
    .all<{ student_id: number; subject: string; grade: number }>();
  const finals: Record<string, number> = {};
  for (let i = 0; i < finalRows.results.length; i++) {
    const f = finalRows.results[i];
    finals[f.student_id + "|" + f.subject] = f.grade;
  }

  return { students: students, subjects: subjects, grades: grades, finals: finals };
}

export async function logLoginFail(db: D1Database, email: string, ip: string, reason: string): Promise<void> {
  await db
    .prepare("INSERT INTO login_fails (email, ip, reason, created_at) VALUES (?, ?, ?, ?)")
    .bind(email.toLowerCase().trim(), ip, reason, nowSql())
    .run();
}

export async function countLoginFailsByIp(db: D1Database, ip: string, minutes: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS c FROM login_fails WHERE ip = ? AND created_at >= ?")
    .bind(ip, sqlMinutesAgo(minutes))
    .first<{ c: number }>();
  if (!row) return 0;
  return row.c;
}

export async function getLoginFails(
  db: D1Database,
  limit: number
): Promise<{ ip: string; email: string; reason: string; created_at: string }[]> {
  const r = await db
    .prepare("SELECT ip, email, reason, created_at FROM login_fails ORDER BY created_at DESC, id DESC LIMIT ?")
    .bind(limit)
    .all<{ ip: string; email: string; reason: string; created_at: string }>();
  return r.results;
}

export async function getSuspiciousIps(
  db: D1Database,
  threshold: number,
  minutes: number
): Promise<{ ip: string; fails: number; last_fail: string }[]> {
  const r = await db
    .prepare(
      "SELECT ip, COUNT(*) AS fails, MAX(created_at) AS last_fail FROM login_fails WHERE created_at >= ? GROUP BY ip HAVING COUNT(*) >= ? ORDER BY fails DESC"
    )
    .bind(sqlMinutesAgo(minutes), threshold)
    .all<{ ip: string; fails: number; last_fail: string }>();
  return r.results;
}

export async function setEmailVerifyToken(db: D1Database, userId: number, token: string): Promise<void> {
  await db
    .prepare("UPDATE users SET email_verify_token = ?, email_verified = 0 WHERE id = ?")
    .bind(token, userId)
    .run();
}

export async function findUserByVerifyToken(db: D1Database, token: string): Promise<User | null> {
  if (!token) return null;
  return await db
    .prepare("SELECT * FROM users WHERE email_verify_token = ? AND email_verified = 0")
    .bind(token)
    .first<User>();
}

export async function markEmailVerified(db: D1Database, userId: number): Promise<void> {
  await db.prepare("UPDATE users SET email_verified = 1, email_verify_token = NULL WHERE id = ?").bind(userId).run();
}

export async function auditLog(
  db: D1Database,
  actor: AuditActor,
  action: string,
  entity: string,
  entityId: number,
  details: string | null,
  ip: string
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO audit_log (user_id, user_name, role, action, entity, entity_id, details, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(actor.id, actor.name, actor.role, action, entity, entityId, details, ip, nowSql())
    .run();
}

export async function getAuditLog(
  db: D1Database,
  limit: number,
  offset: number,
  action: string,
  entity: string
) {
  let where = "1 = 1";
  const params: (string | number)[] = [];
  if (action) {
    where += " AND action = ?";
    params.push(action);
  }
  if (entity) {
    where += " AND entity = ?";
    params.push(entity);
  }
  const rows = await db
    .prepare("SELECT * FROM audit_log WHERE " + where + " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?")
    .bind(...params, limit, offset)
    .all<{
      user_name: string;
      role: string;
      action: string;
      entity: string;
      entity_id: number;
      details: string | null;
      ip: string;
      created_at: string;
    }>();
  const count = await db
    .prepare("SELECT COUNT(*) AS c FROM audit_log WHERE " + where)
    .bind(...params)
    .first<{ c: number }>();
  return { rows: rows.results, total: count ? count.c : 0 };
}

export async function getSetting(db: D1Database, name: string, fallback: string): Promise<string> {
  const row = await db.prepare("SELECT value FROM settings WHERE name = ?").bind(name).first<{ value: string }>();
  if (!row) return fallback;
  return row.value;
}

export async function setSetting(db: D1Database, name: string, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO settings (name, value) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET value = ?")
    .bind(name, value, value)
    .run();
}

export async function getTransient(db: D1Database, name: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT value, expires_at FROM transients WHERE name = ?")
    .bind(name)
    .first<{ value: string; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at < nowSeconds()) {
    await db.prepare("DELETE FROM transients WHERE name = ?").bind(name).run();
    return null;
  }
  return row.value;
}

export async function setTransient(db: D1Database, name: string, value: string, seconds: number): Promise<void> {
  const expires = nowSeconds() + seconds;
  await db
    .prepare(
      "INSERT INTO transients (name, value, expires_at) VALUES (?, ?, ?) ON CONFLICT (name) DO UPDATE SET value = ?, expires_at = ?"
    )
    .bind(name, value, expires, value, expires)
    .run();
}

export async function deleteTransient(db: D1Database, name: string): Promise<void> {
  await db.prepare("DELETE FROM transients WHERE name = ?").bind(name).run();
}

export async function createSession(db: D1Database, token: string, userId: number, kind: string, seconds: number): Promise<void> {
  await db
    .prepare("INSERT INTO sessions (token, user_id, kind, expires_at) VALUES (?, ?, ?, ?)")
    .bind(token, userId, kind, nowSeconds() + seconds)
    .run();
}

export async function findSession(
  db: D1Database,
  token: string
): Promise<{ user_id: number; kind: string } | null> {
  const row = await db
    .prepare("SELECT user_id, kind, expires_at FROM sessions WHERE token = ?")
    .bind(token)
    .first<{ user_id: number; kind: string; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at < nowSeconds()) {
    await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return { user_id: row.user_id, kind: row.kind };
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
}

export async function deleteExpired(db: D1Database): Promise<void> {
  const now = nowSeconds();
  await db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();
  await db.prepare("DELETE FROM transients WHERE expires_at < ?").bind(now).run();
}

export async function getClassSubjectGrades(db: D1Database, classId: number, subject: string): Promise<GradeRow[]> {
  const r = await db
    .prepare("SELECT * FROM grades WHERE class_id = ? AND subject = ? ORDER BY created_at DESC, id DESC")
    .bind(classId, subject)
    .all<GradeRow>();
  return r.results;
}
