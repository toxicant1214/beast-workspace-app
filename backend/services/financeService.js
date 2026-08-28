import { supabase } from "../lib/supabase";

export async function getFinanceStudentFeeSettings() {
  const [studentsResult, settingsResult] = await Promise.all([
    supabase
      .from("students")
      .select("id, student_no, chinese_name, current_grade")
      .eq("student_status", "ACTIVE")
      .eq("record_scope", "NORMAL")
      .order("chinese_name", { ascending: true }),

    supabase
      .from("finance_student_fee_settings")
      .select(
        "id, student_id, childcare_enabled, childcare_list_price, childcare_discount, childcare_discount_reason, childcare_discount_note, english_enabled, english_list_price, english_discount, english_discount_reason, english_discount_note, updated_at"
      ),
  ]);

  if (studentsResult.error) {
    throw studentsResult.error;
  }

  if (settingsResult.error) {
    throw settingsResult.error;
  }

  const settingsMap = new Map(
    (settingsResult.data || []).map((row) => [row.student_id, row])
  );

  return (studentsResult.data || []).map((student) => ({
    ...student,
    feeSetting: settingsMap.get(student.id) || null,
  }));
}

export async function saveFinanceStudentFeeSetting(studentId, values) {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  const payload = {
    student_id: studentId,

    childcare_enabled: Boolean(values.childcare_enabled),
    childcare_list_price: Number(values.childcare_list_price || 0),
    childcare_discount: Number(values.childcare_discount || 0),
    childcare_discount_reason:
      values.childcare_discount_reason?.trim() || null,
    childcare_discount_note:
      values.childcare_discount_note?.trim() || null,

    english_enabled: Boolean(values.english_enabled),
    english_list_price: Number(values.english_list_price || 0),
    english_discount: Number(values.english_discount || 0),
    english_discount_reason:
      values.english_discount_reason?.trim() || null,
    english_discount_note:
      values.english_discount_note?.trim() || null,

    updated_by: userData?.user?.id || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("finance_student_fee_settings")
    .upsert(payload, { onConflict: "student_id" })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getFinanceMonthSummary(targetMonth) {
  const normalizedMonth = `${targetMonth.slice(0, 7)}-01`;

  const [monthResult, feeCountResult] = await Promise.all([
    supabase
      .from("finance_months")
      .select("id, month, status, closed_at, note")
      .eq("month", normalizedMonth)
      .maybeSingle(),

    supabase
      .from("finance_student_monthly_fees")
      .select("id", { count: "exact", head: true })
      .eq("billing_month", normalizedMonth),
  ]);

  if (monthResult.error) {
    throw monthResult.error;
  }

  if (feeCountResult.error) {
    throw feeCountResult.error;
  }

  return {
    month: normalizedMonth,
    monthRecord: monthResult.data || null,
    feeCount: feeCountResult.count || 0,
  };
}

export async function generateFinanceMonthlyFees(targetMonth) {
  const normalizedMonth = `${targetMonth.slice(0, 7)}-01`;

  const { data, error } = await supabase.rpc(
    "generate_finance_monthly_fees",
    {
      target_month: normalizedMonth,
    }
  );

  if (error) {
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : data;

  return {
    createdCount: Number(result?.created_count || 0),
    existingCount: Number(result?.existing_count || 0),
  };
}