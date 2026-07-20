import { supabase } from "../lib/supabase";

const TEACHER_TABLE = "teachers";

function cleanTeacherData(data) {
  return {
    chinese_name: data.chinese_name?.trim() || "",
    english_name: data.english_name?.trim() || null,
    position: data.position?.trim() || null,
    phone: data.phone?.trim() || null,
    email: data.email?.trim() || null,
    hire_date: data.hire_date || null,
    leave_date: data.leave_date || null,
    notes: data.notes?.trim() || null,
    status: data.status || "active",
  };
}

/**
 * 取得全部老師
 * includeInactive = false 時，只取得在職老師
 */
export async function getTeachers({ includeInactive = true } = {}) {
  let query = supabase
    .from(TEACHER_TABLE)
    .select("*")
    .order("status", { ascending: true })
    .order("chinese_name", { ascending: true });

  if (!includeInactive) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;

  if (error) {
    console.error("取得老師資料失敗：", error);
    throw error;
  }

  return data ?? [];
}

/**
 * 取得在職老師
 * 未來老師任務的指派名單會使用這個函式
 */
export async function getActiveTeachers() {
  return getTeachers({ includeInactive: false });
}

/**
 * 新增老師
 */
export async function createTeacher(teacherData) {
  const payload = cleanTeacherData(teacherData);

  if (!payload.chinese_name) {
    throw new Error("請輸入老師中文姓名");
  }

  const { data, error } = await supabase
    .from(TEACHER_TABLE)
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("新增老師失敗：", error);
    throw error;
  }

  return data;
}

/**
 * 修改老師資料
 */
export async function updateTeacher(teacherId, teacherData) {
  if (!teacherId) {
    throw new Error("缺少老師 ID");
  }

  const payload = cleanTeacherData(teacherData);

  if (!payload.chinese_name) {
    throw new Error("請輸入老師中文姓名");
  }

  const { data, error } = await supabase
    .from(TEACHER_TABLE)
    .update(payload)
    .eq("id", teacherId)
    .select()
    .single();

  if (error) {
    console.error("修改老師資料失敗：", error);
    throw error;
  }

  return data;
}

/**
 * 停用或恢復老師
 *
 * 老師資料不直接刪除，避免過去任務紀錄失去關聯。
 */
export async function setTeacherStatus(teacherId, status) {
  if (!teacherId) {
    throw new Error("缺少老師 ID");
  }

  if (!["active", "inactive"].includes(status)) {
    throw new Error("老師狀態不正確");
  }

  const payload = {
    status,
    leave_date:
      status === "inactive"
        ? new Date().toISOString().slice(0, 10)
        : null,
  };

  const { data, error } = await supabase
    .from(TEACHER_TABLE)
    .update(payload)
    .eq("id", teacherId)
    .select()
    .single();

  if (error) {
    console.error("更新老師狀態失敗：", error);
    throw error;
  }

  return data;
}

/**
 * 永久刪除老師
 *
 * 主要用於刪除測試資料。
 * 正式老師建議使用停用功能，保留歷史紀錄。
 */
export async function deleteTeacher(teacherId) {
  if (!teacherId) {
    throw new Error("缺少老師 ID");
  }

  const { error } = await supabase
    .from(TEACHER_TABLE)
    .delete()
    .eq("id", teacherId);

  if (error) {
    console.error("刪除老師失敗：", error);
    throw error;
  }

  return true;
}