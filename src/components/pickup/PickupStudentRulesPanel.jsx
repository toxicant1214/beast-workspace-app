import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../../lib/supabase";

const WEEKDAYS = [
  ["monday_pickup", "一"],
  ["tuesday_pickup", "二"],
  ["wednesday_pickup", "三"],
  ["thursday_pickup", "四"],
  ["friday_pickup", "五"],
];


const PICKUP_PERIOD_OPTIONS = [
  {
    value: "",
    label: "照原規則",
  },
  {
    value: "NOON",
    label: "中午車",
  },
  {
    value: "AFTERNOON",
    label: "下午車",
  },
];

function getPeriodKey(pickupKey) {
  return pickupKey.replace(
    "_pickup",
    "_period"
  );
}

function getPeriodLabel(period) {
  if (period === "NOON") return "中午車";
  if (period === "AFTERNOON") return "下午車";
  return "照原規則";
}


const PICKUP_STATUS_OPTIONS = [
  {
    value: "NORMAL",
    label: "正常接送",
  },
  {
    value: "ABSENT",
    label: "當天不進班",
  },
  {
    value: "LATE_ARRIVAL",
    label: "社團後進班／晚到",
  },
  {
    value: "PARENT_DROP_OFF",
    label: "家長自行送",
  },
];

const LEGACY_NO_PICKUP =
  "LEGACY_NO_PICKUP";

function getStatusKey(
  pickupKey
) {
  return pickupKey.replace(
    "_pickup",
    "_status"
  );
}

function getStatusLabel(
  status
) {
  if (
    status ===
    LEGACY_NO_PICKUP
  ) {
    return "舊設定：不接（請分類）";
  }

  return (
    PICKUP_STATUS_OPTIONS.find(
      (item) =>
        item.value === status
    )?.label ||
    "正常接送"
  );
}

function normalizeWeeklyRule(
  rule
) {
  if (!rule) {
    return rule;
  }

  const next = {
    ...rule,
  };

  for (const [
    pickupKey,
  ] of WEEKDAYS) {
    const statusKey =
      getStatusKey(
        pickupKey
      );

    if (
      !next[statusKey]
    ) {
      next[statusKey] =
        next[pickupKey]
          ? "NORMAL"
          : LEGACY_NO_PICKUP;
    }

    const periodKey =
      getPeriodKey(
        pickupKey
      );

    if (
      next[periodKey] !== "NOON" &&
      next[periodKey] !== "AFTERNOON"
    ) {
      next[periodKey] = "";
    }
  }

  return next;
}

function getStudentName(student) {
  return (
    student.chinese_name ||
    student.name ||
    "未命名學生"
  );
}

function defaultWeeklyForm(studentId) {
  return {
    student_id: studentId,
    monday_pickup: true,
    tuesday_pickup: true,
    wednesday_pickup: true,
    thursday_pickup: true,
    friday_pickup: true,
    monday_status: "NORMAL",
    tuesday_status: "NORMAL",
    wednesday_status: "NORMAL",
    thursday_status: "NORMAL",
    friday_status: "NORMAL",
    monday_period: "",
    tuesday_period: "",
    wednesday_period: "",
    thursday_period: "",
    friday_period: "",
    note: "",
    is_active: true,
  };
}

function PickupStudentRulesPanel({ readOnly = false }) {
  const [students, setStudents] = useState([]);
  const [weeklyRules, setWeeklyRules] = useState([]);
  const [dateExceptions, setDateExceptions] = useState([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("ALL");

  const [selectedStudent, setSelectedStudent] = useState(null);
  const [weeklyForm, setWeeklyForm] = useState(null);

  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionStatus, setExceptionStatus] = useState("NORMAL");
  const [exceptionPeriod, setExceptionPeriod] = useState("");
  const [exceptionNote, setExceptionNote] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const [
        studentsResult,
        weeklyResult,
        exceptionsResult,
      ] = await Promise.all([
        supabase
          .from("students")
          .select(`
            id,
            chinese_name,
            school,
            current_grade,
            primary_parent_phone,
            student_status,
            is_test
          `)
          .eq("student_status", "ACTIVE")
          .order("school")
          .order("current_grade")
          .order("chinese_name"),

        supabase
          .from("pickup_student_weekly_rules")
          .select("*")
          .eq("is_active", true),

        supabase
          .from("pickup_student_date_exceptions")
          .select("*")
          .eq("is_active", true)
          .order("pickup_date", { ascending: false }),
      ]);

      if (studentsResult.error) throw studentsResult.error;
      if (weeklyResult.error) throw weeklyResult.error;
      if (exceptionsResult.error) throw exceptionsResult.error;

      setStudents(studentsResult.data ?? []);
      setWeeklyRules(
        (weeklyResult.data ?? []).map(
          normalizeWeeklyRule
        )
      );
      setDateExceptions(exceptionsResult.data ?? []);
    } catch (error) {
      console.error("讀取學生特殊接送失敗：", error);
      setErrorMessage(
        `讀取學生接送設定失敗：${error.message}`
      );
    } finally {
      setIsLoading(false);
    }
  }

  const schools = useMemo(
    () =>
      Array.from(
        new Set(
          students
            .map((student) => student.school)
            .filter(Boolean)
        )
      ).sort((a, b) =>
        a.localeCompare(b, "zh-Hant")
      ),
    [students]
  );

  const weeklyByStudentId = useMemo(() => {
    const map = new Map();

    for (const rule of weeklyRules) {
      map.set(rule.student_id, rule);
    }

    return map;
  }, [weeklyRules]);

  const exceptionsByStudentId = useMemo(() => {
    const map = new Map();

    for (const item of dateExceptions) {
      if (!map.has(item.student_id)) {
        map.set(item.student_id, []);
      }

      map.get(item.student_id).push(item);
    }

    return map;
  }, [dateExceptions]);

  const filteredStudents = useMemo(() => {
    const keyword =
      searchTerm.trim().toLowerCase();

    return students.filter((student) => {
      if (
        schoolFilter !== "ALL" &&
        student.school !== schoolFilter
      ) {
        return false;
      }

      if (!keyword) return true;

      return (
        getStudentName(student)
          .toLowerCase()
          .includes(keyword) ||
        String(student.school || "")
          .toLowerCase()
          .includes(keyword) ||
        String(student.current_grade || "")
          .toLowerCase()
          .includes(keyword)
      );
    });
  }, [
    students,
    searchTerm,
    schoolFilter,
  ]);

  function openStudent(student) {
    const existing =
      weeklyByStudentId.get(student.id);

    setSelectedStudent(student);
    setWeeklyForm(
      existing
        ? normalizeWeeklyRule(
            existing
          )
        : defaultWeeklyForm(
            student.id
          )
    );

    setExceptionDate("");
    setExceptionStatus("NORMAL");
    setExceptionPeriod("");
    setExceptionNote("");
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function saveWeeklyRule() {
    if (!selectedStudent || !weeklyForm) return;

    const legacyDay =
      WEEKDAYS.find(
        ([pickupKey]) =>
          weeklyForm[
            getStatusKey(
              pickupKey
            )
          ] ===
          LEGACY_NO_PICKUP
      );

    if (legacyDay) {
      setErrorMessage(
        `星期${legacyDay[1]}仍是舊版「不接」設定，請先選擇：當天不進班、社團後進班／晚到，或家長自行送。`
      );
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      const payload = {
        student_id:
          selectedStudent.id,

        monday_status:
          weeklyForm.monday_status,
        tuesday_status:
          weeklyForm.tuesday_status,
        wednesday_status:
          weeklyForm.wednesday_status,
        thursday_status:
          weeklyForm.thursday_status,
        friday_status:
          weeklyForm.friday_status,

        monday_period:
          weeklyForm.monday_status === "NORMAL"
            ? weeklyForm.monday_period || null
            : null,
        tuesday_period:
          weeklyForm.tuesday_status === "NORMAL"
            ? weeklyForm.tuesday_period || null
            : null,
        wednesday_period:
          weeklyForm.wednesday_status === "NORMAL"
            ? weeklyForm.wednesday_period || null
            : null,
        thursday_period:
          weeklyForm.thursday_status === "NORMAL"
            ? weeklyForm.thursday_period || null
            : null,
        friday_period:
          weeklyForm.friday_status === "NORMAL"
            ? weeklyForm.friday_period || null
            : null,

        // 舊欄位先保留相容：
        // 只有 NORMAL 代表接車，其餘三種都不進接車名單。
        monday_pickup:
          weeklyForm.monday_status ===
          "NORMAL",
        tuesday_pickup:
          weeklyForm.tuesday_status ===
          "NORMAL",
        wednesday_pickup:
          weeklyForm.wednesday_status ===
          "NORMAL",
        thursday_pickup:
          weeklyForm.thursday_status ===
          "NORMAL",
        friday_pickup:
          weeklyForm.friday_status ===
          "NORMAL",

        note:
          String(
            weeklyForm.note || ""
          ).trim() || null,
        is_active: true,
        updated_at:
          new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("pickup_student_weekly_rules")
        .upsert(payload, {
          onConflict: "student_id",
        })
        .select()
        .single();

      if (error) throw error;

      setWeeklyRules((current) => [
        ...current.filter(
          (item) =>
            item.student_id !== selectedStudent.id
        ),
        data,
      ]);

      setWeeklyForm(
        normalizeWeeklyRule(
          data
        )
      );
      setSuccessMessage("每週固定接送日已儲存。");
    } catch (error) {
      console.error("儲存每週特殊接送失敗：", error);
      setErrorMessage(
        `儲存失敗：${error.message}`
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function resetWeeklyRule() {
    if (!selectedStudent) return;

    const confirmed = window.confirm(
      `確定將「${getStudentName(
        selectedStudent
      )}」恢復成一般接送規則嗎？`
    );

    if (!confirmed) return;

    try {
      setIsSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      const { error } = await supabase
        .from("pickup_student_weekly_rules")
        .delete()
        .eq("student_id", selectedStudent.id);

      if (error) throw error;

      setWeeklyRules((current) =>
        current.filter(
          (item) =>
            item.student_id !== selectedStudent.id
        )
      );

      setWeeklyForm(
        defaultWeeklyForm(selectedStudent.id)
      );

      setSuccessMessage(
        "已恢復一般接送規則。"
      );
    } catch (error) {
      setErrorMessage(
        `恢復失敗：${error.message}`
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function addDateException() {
    if (!selectedStudent || !exceptionDate) {
      setErrorMessage("請先選擇日期。");
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      const payload = {
        student_id:
          selectedStudent.id,
        pickup_date:
          exceptionDate,

        attendance_status:
          exceptionStatus,

        pickup_period:
          exceptionStatus === "NORMAL"
            ? exceptionPeriod || null
            : null,

        // 舊欄位保留相容：
        // 只有 NORMAL 代表當天要接。
        should_pickup:
          exceptionStatus ===
          "NORMAL",

        note:
          exceptionNote.trim() ||
          null,
        is_active: true,
        updated_at:
          new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("pickup_student_date_exceptions")
        .upsert(payload, {
          onConflict: "student_id,pickup_date",
        })
        .select()
        .single();

      if (error) throw error;

      setDateExceptions((current) => [
        ...current.filter(
          (item) =>
            !(
              item.student_id ===
                selectedStudent.id &&
              item.pickup_date === exceptionDate
            )
        ),
        data,
      ]);

      setExceptionDate("");
      setExceptionStatus("NORMAL");
      setExceptionPeriod("");
      setExceptionNote("");
      setSuccessMessage("單日例外已儲存。");
    } catch (error) {
      console.error("儲存單日接送例外失敗：", error);
      setErrorMessage(
        `儲存單日例外失敗：${error.message}`
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteException(item) {
    try {
      setIsSaving(true);
      setErrorMessage("");

      const { error } = await supabase
        .from("pickup_student_date_exceptions")
        .delete()
        .eq("id", item.id);

      if (error) throw error;

      setDateExceptions((current) =>
        current.filter(
          (row) => row.id !== item.id
        )
      );
    } catch (error) {
      setErrorMessage(
        `刪除單日例外失敗：${error.message}`
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <section className="pickupPanel">
        <div className="pickupEmptyState">
          正在讀取學生特殊接送設定……
        </div>
      </section>
    );
  }

  return (
    <section
      className="pickupPanel"
      style={{
        display: "grid",
        gridTemplateColumns:
          "minmax(360px, 0.9fr) minmax(520px, 1.4fr)",
        gap: "22px",
        alignItems: "start",
      }}
    >
      <div
        style={{
          border: "1px solid #deded8",
          borderRadius: "16px",
          background: "#fff",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px",
            borderBottom: "1px solid #e7e7e1",
          }}
        >
          <p className="eyebrow">STUDENT PICKUP RULES</p>
          <h2 style={{ margin: "4px 0 8px" }}>
            學生特殊接送
          </h2>
          <p
            style={{
              margin: 0,
              color: "#6f746f",
              lineHeight: 1.6,
            }}
          >
            有特殊規則的學生才需要設定；未設定者維持原本接車規則。
          </p>
        </div>

        <div
          style={{
            padding: "14px",
            display: "grid",
            gridTemplateColumns: "1fr 160px",
            gap: "10px",
            borderBottom: "1px solid #e7e7e1",
          }}
        >
          <input
            type="search"
            placeholder="搜尋姓名、年級或學校"
            value={searchTerm}
            onChange={(event) =>
              setSearchTerm(event.target.value)
            }
          />

          <select
            value={schoolFilter}
            onChange={(event) =>
              setSchoolFilter(event.target.value)
            }
          >
            <option value="ALL">全部學校</option>
            {schools.map((school) => (
              <option key={school} value={school}>
                {school}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            maxHeight: "650px",
            overflowY: "auto",
          }}
        >
          {filteredStudents.map((student) => {
            const weekly =
              weeklyByStudentId.get(student.id);

            const exceptionCount =
              exceptionsByStudentId.get(student.id)
                ?.length || 0;

            const pickupDays = weekly
              ? WEEKDAYS
                  .filter(
                    ([key]) =>
                      weekly[key]
                  )
                  .map(([, label]) => label)
                  .join("、")
              : "依一般規則";

            const periodOverrides = weekly
              ? WEEKDAYS
                  .map(([key, label]) => {
                    const period =
                      weekly[
                        getPeriodKey(key)
                      ];

                    if (
                      period !== "NOON" &&
                      period !== "AFTERNOON"
                    ) {
                      return null;
                    }

                    return `${label}${period === "NOON" ? "午" : "下"}`;
                  })
                  .filter(Boolean)
                  .join("、")
              : "";

            return (
              <button
                key={student.id}
                type="button"
                onClick={() =>
                  openStudent(student)
                }
                style={{
                  width: "100%",
                  border: 0,
                  borderBottom:
                    "1px solid #efefe9",
                  background:
                    selectedStudent?.id === student.id
                      ? "#f3efe8"
                      : "#fff",
                  padding: "13px 15px",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    gap: "12px",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <strong>
                      {getStudentName(student)}
                    </strong>
                    <div
                      style={{
                        marginTop: "4px",
                        fontSize: "13px",
                        color: "#7a7e79",
                      }}
                    >
                      {student.current_grade || "—"}
                      {" ・ "}
                      {student.school || "—"}
                    </div>
                  </div>

                  <small
                    style={{
                      color: weekly
                        ? "#6f5f4f"
                        : "#8b8f8a",
                      textAlign: "right",
                    }}
                  >
                    {weekly
                      ? `接：${pickupDays || "無"}`
                      : "一般"}
                    {periodOverrides
                      ? ` ・ 特殊 ${periodOverrides}`
                      : ""}
                    {exceptionCount > 0
                      ? ` ・ 例外 ${exceptionCount}`
                      : ""}
                  </small>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {errorMessage && (
          <div className="pickupStaffError">
            {errorMessage}
          </div>
        )}

        {!readOnly && successMessage && (
          <div
            style={{
              marginBottom: "14px",
              padding: "12px 14px",
              borderRadius: "12px",
              background: "#edf4ec",
              color: "#4f684e",
            }}
          >
            {successMessage}
          </div>
        )}

        {!selectedStudent ? (
          <div className="pickupEmptyState">
            <span className="pickupEmptyState__icon">
              👧🏻
            </span>
            <h2>選擇一位學生</h2>
            <p>
              設定每週固定接送日，或新增單日臨時接／不接。
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "16px",
            }}
          >
            <article
              style={{
                border: "1px solid #deded8",
                borderRadius: "16px",
                background: "#fff",
                padding: "20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  gap: "16px",
                  marginBottom: "18px",
                }}
              >
                <div>
                  <p className="eyebrow">
                    WEEKLY PICKUP
                  </p>
                  <h2 style={{ margin: "4px 0" }}>
                    {getStudentName(selectedStudent)}
                  </h2>
                  <p
                    style={{
                      margin: 0,
                      color: "#767b76",
                    }}
                  >
                    {selectedStudent.current_grade || "—"}
                    {" ・ "}
                    {selectedStudent.school || "—"}
                  </p>
                </div>

                {!readOnly && (
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={resetWeeklyRule}
                    disabled={isSaving}
                  >
                    恢復一般規則
                  </button>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(5, minmax(70px, 1fr))",
                  gap: "10px",
                  marginBottom: "16px",
                }}
              >
                {WEEKDAYS.map(
                  ([pickupKey, label]) => {
                    const statusKey =
                      getStatusKey(
                        pickupKey
                      );

                    const status =
                      weeklyForm?.[
                        statusKey
                      ] || "NORMAL";

                    const isPickup =
                      status ===
                      "NORMAL";

                    const periodKey =
                      getPeriodKey(
                        pickupKey
                      );

                    const period =
                      weeklyForm?.[
                        periodKey
                      ] || "";

                    return (
                      <label
                        key={pickupKey}
                        style={{
                          display: "grid",
                          gap: "7px",
                          padding: "10px",
                          border: "1px solid #e2ded5",
                          borderRadius: "14px",
                          background: "#fffdf9",
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                          }}
                        >
                          <strong
                            style={{
                              fontSize: "14px",
                              lineHeight: 1.2,
                              whiteSpace: "nowrap",
                            }}
                          >
                            星期{label}
                          </strong>

                          <span
                            style={{
                              flex: "0 0 auto",
                              padding: "3px 7px",
                              borderRadius: "999px",
                              fontSize: "10px",
                              lineHeight: 1.2,
                              color: isPickup
                                ? "#5f7464"
                                : "#8b665e",
                              background: isPickup
                                ? "#edf3ec"
                                : "#f4ebe7",
                            }}
                          >
                            {isPickup
                              ? "接車"
                              : "不接"}
                          </span>
                        </div>

                        {readOnly ? (
                          <div
                            style={{
                              padding: "8px 9px",
                              border: "1px solid #e5e1d8",
                              borderRadius: "9px",
                              background: "#faf9f6",
                              fontSize: "12px",
                              color: "#4f514d",
                            }}
                          >
                            {getStatusLabel(status)}
                          </div>
                        ) : (
                        <select
                          value={status}
                          onChange={(event) =>
                            setWeeklyForm(
                              (current) => ({
                                ...current,
                                [statusKey]:
                                  event.target.value,
                                [pickupKey]:
                                  event.target.value ===
                                  "NORMAL",
                              })
                            )
                          }
                          style={{
                            width: "100%",
                            minWidth: 0,
                            height: "34px",
                            padding: "0 30px 0 9px",
                            border: "1px solid #dedad1",
                            borderRadius: "9px",
                            background: "#fff",
                            font: "inherit",
                            fontSize: "12px",
                            color: "#373934",
                          }}
                        >
                          {status ===
                            LEGACY_NO_PICKUP && (
                            <option
                              value={LEGACY_NO_PICKUP}
                            >
                              舊設定：不接（請分類）
                            </option>
                          )}

                          {PICKUP_STATUS_OPTIONS.map(
                            (option) => (
                              <option
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </option>
                            )
                          )}
                        </select>
                        )}

                        {status === "NORMAL" && (
                          readOnly ? (
                            <div
                              style={{
                                padding: "8px 9px",
                                border: "1px solid #e5e1d8",
                                borderRadius: "9px",
                                background: "#faf9f6",
                                fontSize: "12px",
                                color: "#4f514d",
                              }}
                            >
                              {getPeriodLabel(period)}
                            </div>
                          ) : (
                            <select
                              value={period}
                              onChange={(event) =>
                                setWeeklyForm(
                                  (current) => ({
                                    ...current,
                                    [periodKey]:
                                      event.target.value,
                                  })
                                )
                              }
                              style={{
                                width: "100%",
                                minWidth: 0,
                                height: "34px",
                                padding: "0 30px 0 9px",
                                border: "1px solid #dedad1",
                                borderRadius: "9px",
                                background:
                                  period
                                    ? "#f3f7f2"
                                    : "#fff",
                                font: "inherit",
                                fontSize: "12px",
                                color: "#373934",
                              }}
                            >
                              {PICKUP_PERIOD_OPTIONS.map(
                                (option) => (
                                  <option
                                    key={option.value || "DEFAULT"}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                )
                              )}
                            </select>
                          )
                        )}
                      </label>
                    );
                  }
                )}
              </div>

              {readOnly ? (
                <div
                  style={{
                    display: "grid",
                    gap: "7px",
                  }}
                >
                  <span>固定規則備註</span>
                  <div
                    style={{
                      padding: "10px 12px",
                      border: "1px solid #e5e1d8",
                      borderRadius: "10px",
                      background: "#faf9f6",
                      color: "#656863",
                    }}
                  >
                    {weeklyForm?.note || "—"}
                  </div>
                </div>
              ) : (
              <label
                style={{
                  display: "grid",
                  gap: "7px",
                }}
              >
                <span>固定規則備註</span>
                <input
                  type="text"
                  value={weeklyForm?.note || ""}
                  onChange={(event) =>
                    setWeeklyForm(
                      (current) => ({
                        ...current,
                        note: event.target.value,
                      })
                    )
                  }
                  placeholder="例如：週二固定外出上課"
                />
              </label>
              )}

              {!readOnly && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: "16px",
                }}
              >
                <button
                  type="button"
                  className="primaryButton"
                  onClick={saveWeeklyRule}
                  disabled={isSaving}
                >
                  {isSaving
                    ? "儲存中…"
                    : "儲存每週接送設定"}
                </button>
              </div>
              )}
            </article>

            <article
              style={{
                border: "1px solid #deded8",
                borderRadius: "16px",
                background: "#fff",
                padding: "20px",
              }}
            >
              <p className="eyebrow">
                DATE EXCEPTIONS
              </p>
              <h2 style={{ margin: "4px 0 14px" }}>
                單日例外
              </h2>

              {!readOnly && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "160px 150px 150px 1fr auto",
                  gap: "10px",
                  alignItems: "end",
                }}
              >
                <label>
                  <span>日期</span>
                  <input
                    type="date"
                    value={exceptionDate}
                    onChange={(event) =>
                      setExceptionDate(
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  <span>當天設定</span>
                  <select
                    value={
                      exceptionStatus
                    }
                    onChange={(
                      event
                    ) => {
                      const nextStatus =
                        event.target.value;

                      setExceptionStatus(
                        nextStatus
                      );

                      if (
                        nextStatus !== "NORMAL"
                      ) {
                        setExceptionPeriod("");
                      }
                    }}
                  >
                    <option value="NORMAL">
                      臨時要接
                    </option>
                    <option value="ABSENT">
                      當天不進班
                    </option>
                    <option value="LATE_ARRIVAL">
                      社團後進班／晚到
                    </option>
                    <option value="PARENT_DROP_OFF">
                      家長自行送
                    </option>
                  </select>
                </label>

                <label>
                  <span>車別</span>
                  <select
                    value={exceptionPeriod}
                    disabled={
                      exceptionStatus !== "NORMAL"
                    }
                    onChange={(event) =>
                      setExceptionPeriod(
                        event.target.value
                      )
                    }
                  >
                    {PICKUP_PERIOD_OPTIONS.map(
                      (option) => (
                        <option
                          key={option.value || "DEFAULT"}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label>
                  <span>備註</span>
                  <input
                    type="text"
                    value={exceptionNote}
                    onChange={(event) =>
                      setExceptionNote(
                        event.target.value
                      )
                    }
                    placeholder="可留空"
                  />
                </label>

                <button
                  type="button"
                  className="primaryButton"
                  onClick={addDateException}
                  disabled={isSaving}
                >
                  新增
                </button>
              </div>

              )}

              <div
                style={{
                  marginTop: "18px",
                  display: "grid",
                  gap: "8px",
                }}
              >
                {(
                  exceptionsByStudentId.get(
                    selectedStudent.id
                  ) || []
                ).length === 0 ? (
                  <div
                    style={{
                      color: "#8a8e89",
                      padding: "14px 0",
                    }}
                  >
                    尚無單日例外。
                  </div>
                ) : (
                  (
                    exceptionsByStudentId.get(
                      selectedStudent.id
                    ) || []
                  )
                    .slice()
                    .sort((a, b) =>
                      b.pickup_date.localeCompare(
                        a.pickup_date
                      )
                    )
                    .map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "130px 120px 100px 1fr auto",
                          gap: "12px",
                          alignItems: "center",
                          padding: "11px 12px",
                          border:
                            "1px solid #e3e3dd",
                          borderRadius: "12px",
                        }}
                      >
                        <strong>
                          {item.pickup_date}
                        </strong>
                        <span>
                          {item.attendance_status
                            ? getStatusLabel(
                                item.attendance_status
                              )
                            : item.should_pickup
                              ? "臨時要接"
                              : "舊設定：不接（未分類）"}
                        </span>

                        <span
                          style={{
                            color:
                              item.pickup_period
                                ? "#5f7464"
                                : "#8a8e89",
                            fontWeight:
                              item.pickup_period
                                ? 600
                                : 400,
                          }}
                        >
                          {(
                            item.attendance_status ||
                            (
                              item.should_pickup
                                ? "NORMAL"
                                : LEGACY_NO_PICKUP
                            )
                          ) === "NORMAL"
                            ? getPeriodLabel(
                                item.pickup_period
                              )
                            : "—"}
                        </span>

                        <span
                          style={{
                            color: "#787d78",
                          }}
                        >
                          {item.note || "—"}
                        </span>
                        {!readOnly && (
                          <button
                            type="button"
                            className="secondaryButton"
                            onClick={() =>
                              deleteException(item)
                            }
                            disabled={isSaving}
                          >
                            刪除
                          </button>
                        )}
                      </div>
                    ))
                )}
              </div>
            </article>
          </div>
        )}
      </div>
    </section>
  );
}

export default PickupStudentRulesPanel;