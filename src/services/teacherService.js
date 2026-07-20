import { supabase } from "../lib/supabase";

const TEACHER_TABLE = "teachers";

function cleanTeacherData(data) {
  return {
    chinese_name: data.chinese_name?.trim() || "",
    english_name: data.english_name?.trim() || null,
    position: data.position?.trim() || null,
    phone: data.phone?.trim() || null,
    email: data.email?.trim().toLowerCase() || null,
    hire_date: data.hire_date || null,
    leave_date: data.leave_date || null,
    notes: data.notes?.trim() || null,
    status: data.status || "active",
  };
}

async function getFunctionErrorMessage(error, fallbackMessage) {
  try {
    if (error?.context?.json) {
      const body = await error.context.json();
      return body?.error || body?.message || fallbackMessage;
    }
  } catch (parseError) {
    console.error("解析 Edge Function 錯誤失敗：", parseError);
  }

  return error?.message || fallbackMessage;
}

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

export async function getActiveTeachers() {
  return getTeachers({ includeInactive: false });
}

/**
 * 新增老師、建立 Supabase Auth 帳號、自動綁定 auth_user_id，
 * 並寄出老師自行設定密碼的邀請信。
 */
export async function createTeacher(teacherData) {
  const payload = cleanTeacherData(teacherData);

  if (!payload.chinese_name) {
    throw new Error("請輸入老師中文姓名");
  }

  if (!payload.email) {
    throw new Error("請輸入老師之後要用來登入的 Email");
  }

  const redirectTo = `${window.location.origin}/?setup=teacher`;

  const { data, error } = await supabase.functions.invoke("invite-teacher", {
    body: {
      action: "invite",
      teacher: payload,
      redirectTo,
    },
  });

  if (error) {
    console.error("新增老師與寄送邀請失敗：", error);
    throw new Error(
      await getFunctionErrorMessage(
        error,
        "新增老師與寄送邀請失敗，請稍後再試。"
      )
    );
  }

  if (!data?.teacher) {
    throw new Error(data?.error || "系統未回傳新老師資料");
  }

  return data.teacher;
}

export async function updateTeacher(teacherId, teacherData) {
  if (!teacherId) {
    throw new Error("缺少老師 ID");
  }

  const payload = cleanTeacherData(teacherData);

  if (!payload.chinese_name) {
    throw new Error("請輸入老師中文姓名");
  }

  // 登入 Email 已綁定 Auth；一般資料編輯時不直接改 Email。
  delete payload.email;

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

export async function setTeacherStatus(teacherId, status) {
  if (!teacherId) {
    throw new Error("缺少老師 ID");
  }

  if (!["active", "inactive"].includes(status)) {
    throw new Error("老師狀態不正確");
  }

  const { data, error } = await supabase.functions.invoke("invite-teacher", {
    body: {
      action: "set-status",
      teacherId,
      status,
    },
  });

  if (error) {
    console.error("更新老師狀態失敗：", error);
    throw new Error(
      await getFunctionErrorMessage(error, "更新老師狀態失敗，請稍後再試。")
    );
  }

  return data?.teacher;
}

/**
 * 永久刪除測試老師，並同步刪除對應的 Supabase Auth 帳號。
 */
export async function deleteTeacher(teacherId) {
  if (!teacherId) {
    throw new Error("缺少老師 ID");
  }

  const { error } = await supabase.functions.invoke("invite-teacher", {
    body: {
      action: "delete",
      teacherId,
    },
  });

  if (error) {
    console.error("刪除老師失敗：", error);
    throw new Error(
      await getFunctionErrorMessage(error, "刪除老師失敗，請稍後再試。")
    );
  }

  return true;
}
