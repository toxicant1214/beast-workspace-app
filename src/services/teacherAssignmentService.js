import { supabase } from "../lib/supabase";

const ASSIGNMENT_TABLE = "teacher_assignments";
const MEMBER_TABLE = "teacher_assignment_members";

/**
 * 取得全部老師任務
 * 同時帶回每位被指派老師的完成狀態與老師資料
 */
export async function getTeacherAssignments() {
  const { data, error } = await supabase
    .from(ASSIGNMENT_TABLE)
    .select(`
      *,
      teacher_assignment_members (
        id,
        teacher_id,
        teacher_completed,
        teacher_completed_at,
        admin_confirmed,
        admin_confirmed_at,
        teachers (
          id,
          chinese_name,
          english_name,
          position,
          status
        )
      )
    `)
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("取得老師任務失敗：", error);
    throw error;
  }
  console.log(data);
  return data ?? [];
}

/**
 * 新增老師任務
 *
 * assignmentData:
 * {
 *   title,
 *   description,
 *   deadline,
 *   priority,
 *   teacherIds,
 *   reminderOffsets
 * }
 */
export async function createTeacherAssignment(assignmentData) {
  const title = assignmentData.title?.trim();

  if (!title) {
    throw new Error("請輸入任務名稱");
  }

  if (
    !Array.isArray(assignmentData.teacherIds) ||
    assignmentData.teacherIds.length === 0
  ) {
    throw new Error("請至少指派一位老師");
  }

  const reminderOffsets = Array.isArray(assignmentData.reminderOffsets)
    ? [
        ...new Set(
          assignmentData.reminderOffsets
            .map((offset) => Number(offset))
            .filter(
              (offset) =>
                Number.isInteger(offset) &&
                offset > 0
            )
        ),
      ].sort((a, b) => b - a)
    : [];

  const assignmentPayload = {
    title,
    description: assignmentData.description?.trim() || null,
    deadline: assignmentData.deadline || null,
    priority: assignmentData.priority || "normal",
    status: "active",
    reminder_offsets: reminderOffsets,
  };

  const { data: assignment, error: assignmentError } = await supabase
  .from(ASSIGNMENT_TABLE)
  .insert([assignmentPayload])
  .select("*")
  .single();
  alert(JSON.stringify(assignment));
console.log("Supabase 新增後回傳：", assignment);
  if (assignmentError) {
    console.error("新增老師任務失敗：", assignmentError);
    throw assignmentError;
  }

  const memberPayload = assignmentData.teacherIds.map((teacherId) => ({
    assignment_id: assignment.id,
    teacher_id: teacherId,
    teacher_completed: false,
    teacher_completed_at: null,
    admin_confirmed: false,
    admin_confirmed_at: null,
  }));

  const { error: memberError } = await supabase
    .from(MEMBER_TABLE)
    .insert(memberPayload);

  if (memberError) {
    console.error("新增任務指派老師失敗：", memberError);

    await supabase
      .from(ASSIGNMENT_TABLE)
      .delete()
      .eq("id", assignment.id);

    throw memberError;
  }

  return assignment;
}

/**
 * 老師自行回報完成
 */
export async function markTeacherAssignmentCompleted(memberId) {
  if (!memberId) {
    throw new Error("缺少任務成員 ID");
  }

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error("缺少 VITE_API_BASE_URL");
  }

  const response = await fetch(
    `${apiBaseUrl}/api/teacher-assignments/${memberId}/complete`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  const result = await response.json();

  if (!response.ok || !result.success) {
    console.error("老師回報完成失敗：", result);
    throw new Error(result.message || "老師回報完成失敗");
  }

  return result.member;
}

/**
 * 取消老師的完成回報
 */
export async function undoTeacherAssignmentCompleted(memberId) {
  if (!memberId) {
    throw new Error("缺少任務成員 ID");
  }

  const { data, error } = await supabase
    .from(MEMBER_TABLE)
    .update({
      teacher_completed: false,
      teacher_completed_at: null,
      admin_confirmed: false,
      admin_confirmed_at: null,
    })
    .eq("id", memberId)
    .select()
    .single();

  if (error) {
    console.error("取消完成回報失敗：", error);
    throw error;
  }

  return data;
}

/**
 * 主管確認老師已完成
 */
export async function confirmTeacherAssignment(memberId) {
  if (!memberId) {
    throw new Error("缺少任務成員 ID");
  }

  const { data, error } = await supabase
    .from(MEMBER_TABLE)
    .update({
      admin_confirmed: true,
      admin_confirmed_at: new Date().toISOString(),
    })
    .eq("id", memberId)
    .eq("teacher_completed", true)
    .select()
    .single();

  if (error) {
    console.error("主管確認完成失敗：", error);
    throw error;
  }

  return data;
}

/**
 * 取消主管確認
 */
export async function undoConfirmTeacherAssignment(memberId) {
  if (!memberId) {
    throw new Error("缺少任務成員 ID");
  }

  const { data, error } = await supabase
    .from(MEMBER_TABLE)
    .update({
      admin_confirmed: false,
      admin_confirmed_at: null,
    })
    .eq("id", memberId)
    .select()
    .single();

  if (error) {
    console.error("取消主管確認失敗：", error);
    throw error;
  }

  return data;
}

/**
 * 刪除整筆老師任務
 *
 * teacher_assignment_members 會因 on delete cascade 一起刪除。
 */
export async function deleteTeacherAssignment(assignmentId) {
  if (!assignmentId) {
    throw new Error("缺少任務 ID");
  }

  const { error } = await supabase
    .from(ASSIGNMENT_TABLE)
    .delete()
    .eq("id", assignmentId);

  if (error) {
    console.error("刪除老師任務失敗：", error);
    throw error;
  }

  return true;
}