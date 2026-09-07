import { supabase } from "../lib/supabase";


// =========================================================
// BEAST Workspace｜教師考核
// 工作區間 Service
// =========================================================


const TABLE_NAME =
  "evaluation_work_periods";


// ---------------------------------------------------------
// 日期排序
// ---------------------------------------------------------

function sortWorkPeriods(rows = []) {
  return [...rows].sort((a, b) => {
    const startCompare =
      String(b.start_date || "")
        .localeCompare(
          String(a.start_date || "")
        );

    if (startCompare !== 0) {
      return startCompare;
    }

    return String(b.end_date || "")
      .localeCompare(
        String(a.end_date || "")
      );
  });
}


// ---------------------------------------------------------
// 讀取所有工作區間
// ---------------------------------------------------------

export async function
getEvaluationWorkPeriods({
  includeInactive = false,
} = {}) {
  let query = supabase
    .from(TABLE_NAME)
    .select(`
      id,
      name,
      period_type,
      start_date,
      end_date,
      is_active,
      created_at,
      updated_at
    `);

  if (!includeInactive) {
    query = query.eq(
      "is_active",
      true
    );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    console.error(
      "讀取考核工作區間失敗：",
      error
    );

    throw error;
  }

  return sortWorkPeriods(
    data || []
  );
}


// ---------------------------------------------------------
// 讀取單一工作區間
// ---------------------------------------------------------

export async function
getEvaluationWorkPeriodById(
  periodId
) {
  if (!periodId) {
    throw new Error(
      "缺少工作區間 ID。"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from(TABLE_NAME)
    .select(`
      id,
      name,
      period_type,
      start_date,
      end_date,
      is_active,
      created_at,
      updated_at
    `)
    .eq(
      "id",
      periodId
    )
    .maybeSingle();

  if (error) {
    console.error(
      "讀取工作區間失敗：",
      error
    );

    throw error;
  }

  return data || null;
}


// ---------------------------------------------------------
// 新增工作區間
// ---------------------------------------------------------

export async function
createEvaluationWorkPeriod({
  name,
  periodType,
  startDate,
  endDate,
  isActive = true,
}) {
  const cleanName =
    String(name || "").trim();

  if (!cleanName) {
    throw new Error(
      "請輸入工作區間名稱。"
    );
  }

  if (
    !["semester", "vacation"]
      .includes(periodType)
  ) {
    throw new Error(
      "工作區間類型不正確。"
    );
  }

  if (
    !startDate ||
    !endDate
  ) {
    throw new Error(
      "請設定開始與結束日期。"
    );
  }

  if (endDate < startDate) {
    throw new Error(
      "結束日期不可早於開始日期。"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from(TABLE_NAME)
    .insert({
      name: cleanName,
      period_type: periodType,
      start_date: startDate,
      end_date: endDate,
      is_active: isActive,
    })
    .select()
    .single();

  if (error) {
    console.error(
      "新增工作區間失敗：",
      error
    );

    throw error;
  }

  return data;
}


// ---------------------------------------------------------
// 修改工作區間
// ---------------------------------------------------------

export async function
updateEvaluationWorkPeriod(
  periodId,
  {
    name,
    periodType,
    startDate,
    endDate,
    isActive,
  }
) {
  if (!periodId) {
    throw new Error(
      "缺少工作區間 ID。"
    );
  }

  const cleanName =
    String(name || "").trim();

  if (!cleanName) {
    throw new Error(
      "請輸入工作區間名稱。"
    );
  }

  if (
    !["semester", "vacation"]
      .includes(periodType)
  ) {
    throw new Error(
      "工作區間類型不正確。"
    );
  }

  if (
    !startDate ||
    !endDate
  ) {
    throw new Error(
      "請設定開始與結束日期。"
    );
  }

  if (endDate < startDate) {
    throw new Error(
      "結束日期不可早於開始日期。"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from(TABLE_NAME)
    .update({
      name: cleanName,
      period_type: periodType,
      start_date: startDate,
      end_date: endDate,
      is_active: Boolean(
        isActive
      ),
    })
    .eq(
      "id",
      periodId
    )
    .select()
    .single();

  if (error) {
    console.error(
      "修改工作區間失敗：",
      error
    );

    throw error;
  }

  return data;
}


// ---------------------------------------------------------
// 啟用／停用工作區間
// ---------------------------------------------------------

export async function
setEvaluationWorkPeriodActive(
  periodId,
  isActive
) {
  if (!periodId) {
    throw new Error(
      "缺少工作區間 ID。"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from(TABLE_NAME)
    .update({
      is_active: Boolean(
        isActive
      ),
    })
    .eq(
      "id",
      periodId
    )
    .select()
    .single();

  if (error) {
    console.error(
      "更新工作區間狀態失敗：",
      error
    );

    throw error;
  }

  return data;
}


// ---------------------------------------------------------
// 刪除工作區間
//
// 第一版先保留 Service 能力。
// UI 之後會優先提供「停用」而不是鼓勵刪除，
// 避免已有工作紀錄關聯後破壞歷史資料。
// ---------------------------------------------------------

export async function
deleteEvaluationWorkPeriod(
  periodId
) {
  if (!periodId) {
    throw new Error(
      "缺少工作區間 ID。"
    );
  }

  const {
    error,
  } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq(
      "id",
      periodId
    );

  if (error) {
    console.error(
      "刪除工作區間失敗：",
      error
    );

    throw error;
  }

  return true;
}


// ---------------------------------------------------------
// 找出某一天屬於哪些工作區間
//
// 正常設定下通常只會有一個。
// 保留陣列是因為未來正式考核可以自行勾選多個區間，
// 且不在資料層偷偷假設區間永遠不重疊。
// ---------------------------------------------------------

export async function
getEvaluationWorkPeriodsForDate(
  date
) {
  if (!date) {
    return [];
  }

  const {
    data,
    error,
  } = await supabase
    .from(TABLE_NAME)
    .select(`
      id,
      name,
      period_type,
      start_date,
      end_date,
      is_active
    `)
    .lte(
      "start_date",
      date
    )
    .gte(
      "end_date",
      date
    )
    .eq(
      "is_active",
      true
    );

  if (error) {
    console.error(
      "依日期讀取工作區間失敗：",
      error
    );

    throw error;
  }

  return sortWorkPeriods(
    data || []
  );
}