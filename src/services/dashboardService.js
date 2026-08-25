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
    supabase
      .from("class_students")
      .select("student_id")
      .eq("status", "ACTIVE"),

    supabase
      .from("english_class_students")
      .select("student_id")
      .eq("status", "ACTIVE"),

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

    // 才藝「人次」不去重，之後營運分析可以直接使用
    talentEnrollmentCount:
      talentResult.data?.length ?? 0,
  };
}