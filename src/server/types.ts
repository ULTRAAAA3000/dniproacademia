export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ADMIN_PASSWORD: string;
  ADMIN_EMAIL: string;
  MAIL_FROM: string;
  CF_ACCOUNT_ID: string;
  CF_EMAIL_TOKEN: string;
  MAIL_DEBUG?: string;
}

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  recovery: string;
  role: string;
  class_id: number | null;
  subject: string | null;
  reg_ip: string;
  email_verified: number;
  email_verify_token: string | null;
  created_at: string;
}

export interface ClassRow {
  id: number;
  name: string;
}

export interface SubjectRow {
  id: number;
  class_id: number;
  name: string;
}

export interface ScheduleRow {
  id: number;
  class_id: number;
  day: number;
  period: number;
  subject: string;
  group_name: string;
  week_type: string;
}

export interface HomeworkRow {
  id: number;
  class_id: number;
  teacher_id: number;
  subject: string;
  topic: string;
  description: string | null;
  deadline: string;
  created_at: string;
  teacher_name?: string;
}

export interface GradeRow {
  id: number;
  student_id: number;
  teacher_id: number;
  class_id: number;
  subject: string;
  grade: number;
  description: string | null;
  created_at: string;
  teacher_name?: string;
}

export interface FinalGradeRow {
  id: number;
  student_id: number;
  class_id: number;
  subject: string;
  grade: number;
  semester: number;
}

export interface MaterialRow {
  id: number;
  teacher_id: number;
  class_id: number;
  subject: string;
  title: string;
  filename: string;
  filepath: string;
  created_at: string;
  teacher_name?: string;
}

export interface NewsRow {
  id: number;
  class_id: number;
  author_id: number;
  author_type: string;
  title: string;
  body: string;
  created_at: string;
  author_name?: string;
}

export interface MessageRow {
  id: number;
  chat_id: number;
  sender_id: number;
  body: string | null;
  file_name: string | null;
  file_path: string | null;
  file_size: number | null;
  reply_to: number | null;
  edited_at: string | null;
  is_deleted: number;
  is_read: number;
  created_at: string;
  sender_name?: string;
}

export interface ChatListRow {
  id: number;
  other_id: number;
  other_name: string;
  last_msg: string | null;
  last_file: string | null;
  last_at: string | null;
  unread: number;
  is_muted: number;
}

export interface StudentGrades {
  id: number;
  first_name: string;
  last_name: string;
  avg_grade: number | null;
  all_grades: string;
}

export interface Session {
  kind: string;
  user: User | null;
}

export interface AuditActor {
  id: number;
  name: string;
  role: string;
}

export interface Ctx {
  request: Request;
  env: Env;
  waitUntil: (p: Promise<unknown>) => void;
}
