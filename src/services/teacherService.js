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

async function invokeTeacherFunction(body, fallbackMessage) {
  const { data, error } = await supabase.functions.invoke("invite-teacher", {
    body,
  });

  if (error) {
    console.error("invite-teacher Edge Function 呼叫失敗：", error);

    let message = fallbackMessage;

    try {
      if (error.context?.json) {
        const responseBody = await error.context.json();
        message = responseBody?.error || responseBody?.message || message;
      }
    } catch (parseError) {
      console.error("解析 Edge Function 錯誤內容失敗：", parseError);
    }

    throw new Error(error.message || message);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
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

export async function createTeacher(teacherData) {
  const teacher = cleanTeacherData(teacherData);

  if (!teacher.chinese_name) {
    throw new Error("請輸入老師中文姓名。");
  }

  if (!teacher.email) {
    throw new Error("請輸入老師之後要用來登入的 Email。");
  }

  const data = await invokeTeacherFunction(
    {
      action: "invite-new",
      teacher,
      redirectTo: `${window.location.origin}/?setup=teacher`,
    },
    "新增老師與寄送邀請失敗，請稍後再試。"
  );

  return data.teacher;
}

export async function inviteExistingTeacher(teacherId, teacherData) {
  if (!teacherId) {
    throw new Error("缺少老師 ID。");
  }

  const teacher = cleanTeacherData(teacherData);

  if (!teacher.chinese_name) {
    throw new Error("請輸入老師中文姓名。");
  }

  if (!teacher.email) {
    throw new Error("請輸入老師登入 Email。");
  }

  const data = await invokeTeacherFunction(
    {
      action: "invite-existing",
      teacherId,
      teacher,
      redirectTo: `${window.location.origin}/?setup=teacher`,
    },
    "更新既有老師並寄送邀請失敗，請稍後再試。"
  );

  return data.teacher;
}

export async function updateTeacher(teacherId, teacherData) {
  if (!teacherId) {
    throw new Error("缺少老師 ID。");
  }

  const payload = cleanTeacherData(teacherData);

  if (!payload.chinese_name) {
    throw new Error("請輸入老師中文姓名。");
  }

  // 已建立 Auth 帳號時，不讓一般資料編輯直接改動登入 Email。
  delete payload.email;

  const { data, error } = await supabase
    .from(TEACHER_TABLE)
    .update(payload)
    .eq("id", teacherId)
    .select()
    .single();

  if (error) {
    console.error("修改老師資料失敗：", error);
    throw new Error(error.message || "修改老師資料失敗。");
  }

  return data;
}

export async function setTeacherStatus(teacherId, status) {
  if (!teacherId) {
    throw new Error("缺少老師 ID。");
  }

  if (!["active", "inactive"].includes(status)) {
    throw new Error("老師狀態不正確。");
  }

  const data = await invokeTeacherFunction(
    {
      action: "set-status",
      teacherId,
      status,
    },
    "更新老師狀態失敗，請稍後再試。"
  );

  return data.teacher;
}

export async function deleteTeacher(teacherId) {
  if (!teacherId) {
    throw new Error("缺少老師 ID。");
  }

  await invokeTeacherFunction(
    {
      action: "delete",
      teacherId,
    },
    "刪除老師失敗，請稍後再試。"
  );

  return true;
}

export async function sendTeacherPasswordReset(email) {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error("缺少老師登入 Email。");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(
    normalizedEmail,
    {
      redirectTo: `${window.location.origin}/?setup=teacher`,
    }
  );

  if (error) {
    console.error("寄送密碼設定信失敗：", error);
    throw new Error(error.message || "寄送密碼設定信失敗。");
  }

  return true;
}
export async function generateTeacherLineBindingCode() {
  const { data, error } = await supabase.rpc(
    "generate_teacher_line_binding_code"
  );

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    throw new Error("無法產生 LINE 綁定碼");
  }

  return data[0];
}