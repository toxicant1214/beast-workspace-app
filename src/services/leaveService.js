import { supabase } from "../lib/supabase";


export async function getLeaveTypes() {
  const {
    data,
    error,
  } = await supabase
    .from("leave_types")
    .select(`
      id,
      code,
      name,
      is_active,
      sort_order
    `)
    .eq("is_active", true)
    .order("sort_order", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return data || [];
}


export async function getActiveTeachers() {
  const {
    data,
    error,
  } = await supabase
    .from("teachers")
    .select(`
      id,
      chinese_name,
      english_name,
      status
    `)
    .eq("status", "active")
    .order("chinese_name", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return data || [];
}


export async function getExternalStaff() {
  const {
    data,
    error,
  } = await supabase
    .from("leave_external_staff")
    .select(`
      id,
      name,
      department,
      is_active
    `)
    .order("is_active", {
      ascending: false,
    })
    .order("name", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return data || [];
}


export async function createExternalStaff({
  name,
  department,
}) {
  const cleanName =
    name?.trim();

  const cleanDepartment =
    department?.trim() || null;

  if (!cleanName) {
    throw new Error(
      "請輸入姓名。"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("leave_external_staff")
    .insert({
      name: cleanName,
      department:
        cleanDepartment,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function updateExternalStaffStatus(
  id,
  isActive
) {
  const {
    data,
    error,
  } = await supabase
    .from("leave_external_staff")
    .update({
      is_active: isActive,
      updated_at:
        new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function getLeaveRecords({
  startDate,
  endDate,
} = {}) {
  let query =
    supabase
      .from("teacher_leave_records")
      .select(`
        id,
        teacher_id,
        external_staff_id,
        leave_type_id,
        start_date,
        end_date,
        leave_hours,
        input_unit,
        input_value,
        is_last_minute,
        note,
        created_at,
        updated_at,
        teachers (
          id,
          chinese_name,
          english_name
        ),
        leave_external_staff (
          id,
          name,
          department,
          is_active
        ),
        leave_types (
          id,
          code,
          name
        )
      `)
      .order(
        "start_date",
        {
          ascending: false,
        }
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (startDate) {
    query =
      query.gte(
        "end_date",
        startDate
      );
  }

  if (endDate) {
    query =
      query.lte(
        "start_date",
        endDate
      );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}


export function convertLeaveToHours({
  inputUnit,
  inputValue,
}) {
  const value =
    Number(inputValue);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return 0;
  }

  if (inputUnit === "DAY") {
    return value * 8;
  }

  return value;
}


export function formatLeaveHours(
  hours
) {
  const value =
    Number(hours || 0);

  if (!value) {
    return "0小時";
  }

  const days =
    Math.floor(value / 8);

  const remainingHours =
    value % 8;

  if (
    days > 0 &&
    remainingHours > 0
  ) {
    return `${days}日${remainingHours}小時`;
  }

  if (days > 0) {
    return `${days}日`;
  }

  return `${remainingHours}小時`;
}


export async function createLeaveRecord({
  personType,
  personId,
  leaveTypeId,
  startDate,
  endDate,
  inputUnit,
  inputValue,
  isLastMinute,
  note,
}) {
  const leaveHours =
    convertLeaveToHours({
      inputUnit,
      inputValue,
    });

  if (!personId) {
    throw new Error(
      "請選擇請假人員。"
    );
  }

  if (!leaveTypeId) {
    throw new Error(
      "請選擇假別。"
    );
  }

  if (
    !startDate ||
    !endDate
  ) {
    throw new Error(
      "請選擇請假日期。"
    );
  }

  if (
    new Date(endDate) <
    new Date(startDate)
  ) {
    throw new Error(
      "結束日期不可早於開始日期。"
    );
  }

  if (!leaveHours) {
    throw new Error(
      "請輸入正確的休假時數或天數。"
    );
  }

  const payload = {
    teacher_id:
      personType === "teacher"
        ? personId
        : null,

    external_staff_id:
      personType === "external"
        ? personId
        : null,

    leave_type_id:
      leaveTypeId,

    start_date:
      startDate,

    end_date:
      endDate,

    leave_hours:
      leaveHours,

    input_unit:
      inputUnit,

    input_value:
      Number(inputValue),

    is_last_minute:
      Boolean(isLastMinute),

    note:
      note?.trim() || null,
  };

  const {
    data,
    error,
  } = await supabase
    .from("teacher_leave_records")
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function updateLeaveRecord(
  id,
  {
    personType,
    personId,
    leaveTypeId,
    startDate,
    endDate,
    inputUnit,
    inputValue,
    isLastMinute,
    note,
  }
) {
  const leaveHours =
    convertLeaveToHours({
      inputUnit,
      inputValue,
    });

  if (!personId) {
    throw new Error(
      "請選擇請假人員。"
    );
  }

  if (!leaveTypeId) {
    throw new Error(
      "請選擇假別。"
    );
  }

  if (
    !startDate ||
    !endDate
  ) {
    throw new Error(
      "請選擇請假日期。"
    );
  }

  if (
    new Date(endDate) <
    new Date(startDate)
  ) {
    throw new Error(
      "結束日期不可早於開始日期。"
    );
  }

  if (!leaveHours) {
    throw new Error(
      "請輸入正確的休假時數或天數。"
    );
  }

  const payload = {
    teacher_id:
      personType === "teacher"
        ? personId
        : null,

    external_staff_id:
      personType === "external"
        ? personId
        : null,

    leave_type_id:
      leaveTypeId,

    start_date:
      startDate,

    end_date:
      endDate,

    leave_hours:
      leaveHours,

    input_unit:
      inputUnit,

    input_value:
      Number(inputValue),

    is_last_minute:
      Boolean(isLastMinute),

    note:
      note?.trim() || null,

    updated_at:
      new Date().toISOString(),
  };

  const {
    data,
    error,
  } = await supabase
    .from("teacher_leave_records")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function deleteLeaveRecord(
  id
) {
  const {
    error,
  } = await supabase
    .from("teacher_leave_records")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}