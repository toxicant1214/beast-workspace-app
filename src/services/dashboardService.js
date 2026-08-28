import { supabase } from "../lib/supabase";

function countUniqueStudents(rows = []) {
  return new Set(
    rows
      .map((item) => item.student_id)
      .filter(Boolean)
  ).size;
}

export async function getDashboardEnrollmentStats() {
  const [
    afterSchoolResult,
    englishResult,
    talentResult,
  ] = await Promise.all([
    // 安親在籍：
    // 班級紀錄 ACTIVE + 學生本人 ACTIVE + 正式學生 NORMAL
    supabase
      .from("class_students")
      .select(`
        student_id,
        students!inner (
          student_status,
          record_scope
        )
      `)
      .eq("status", "ACTIVE")
      .eq("students.student_status", "ACTIVE")
      .eq("students.record_scope", "NORMAL"),

    // 美語在籍
    supabase
      .from("english_class_students")
      .select("student_id")
      .eq("status", "ACTIVE"),

    // 才藝在籍
    supabase
      .from("course_class_students")
      .select("student_id")
      .eq("is_active", true),
  ]);

  if (afterSchoolResult.error) {
    throw afterSchoolResult.error;
  }

  if (englishResult.error) {
    throw englishResult.error;
  }

  if (talentResult.error) {
    throw talentResult.error;
  }

  const afterSchoolCount = countUniqueStudents(
    afterSchoolResult.data
  );

  const englishCount = countUniqueStudents(
    englishResult.data
  );

  const talentCount = countUniqueStudents(
    talentResult.data
  );

  return {
    afterSchoolCount,
    englishCount,
    talentCount,

    // 才藝人次不去重
    talentEnrollmentCount:
      talentResult.data?.length ?? 0,
  };
}