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
    note: "",
    is_active: true,
  };
}

function PickupStudentRulesPanel() {
  const [students, setStudents] = useState([]);
  const [weeklyRules, setWeeklyRules] = useState([]);
  const [dateExceptions, setDateExceptions] = useState([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("ALL");

  const [selectedStudent, setSelectedStudent] = useState(null);
  const [weeklyForm, setWeeklyForm] = useState(null);

  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionShouldPickup, setExceptionShouldPickup] = useState(false);
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
      setWeeklyRules(weeklyResult.data ?? []);
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
        ? {
            ...existing,
          }
        : defaultWeeklyForm(student.id)
    );

    setExceptionDate("");
    setExceptionShouldPickup(false);
    setExceptionNote("");
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function saveWeeklyRule() {
    if (!selectedStudent || !weeklyForm) return;

    try {
      setIsSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      const payload = {
        student_id: selectedStudent.id,
        monday_pickup:
          Boolean(weeklyForm.monday_pickup),
        tuesday_pickup:
          Boolean(weeklyForm.tuesday_pickup),
        wednesday_pickup:
          Boolean(weeklyForm.wednesday_pickup),
        thursday_pickup:
          Boolean(weeklyForm.thursday_pickup),
        friday_pickup:
          Boolean(weeklyForm.friday_pickup),
        note:
          String(weeklyForm.note || "").trim() || null,
        is_active: true,
        updated_at: new Date().toISOString(),
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

      setWeeklyForm(data);
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
        student_id: selectedStudent.id,
        pickup_date: exceptionDate,
        should_pickup: exceptionShouldPickup,
        note:
          exceptionNote.trim() || null,
        is_active: true,
        updated_at: new Date().toISOString(),
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

        {successMessage && (
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

                <button
                  type="button"
                  className="secondaryButton"
                  onClick={resetWeeklyRule}
                  disabled={isSaving}
                >
                  恢復一般規則
                </button>
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
                {WEEKDAYS.map(([key, label]) => (
                  <label
                    key={key}
                    style={{
                      display: "grid",
                      placeItems: "center",
                      gap: "7px",
                      padding: "12px 8px",
                      border: "1px solid #deded8",
                      borderRadius: "12px",
                      background: weeklyForm?.[key]
                        ? "#eef3eb"
                        : "#f7f3f1",
                      cursor: "pointer",
                    }}
                  >
                    <strong>星期{label}</strong>
                    <input
                      type="checkbox"
                      checked={Boolean(
                        weeklyForm?.[key]
                      )}
                      onChange={(event) =>
                        setWeeklyForm(
                          (current) => ({
                            ...current,
                            [key]:
                              event.target.checked,
                          })
                        )
                      }
                    />
                    <small>
                      {weeklyForm?.[key]
                        ? "要接"
                        : "不接"}
                    </small>
                  </label>
                ))}
              </div>

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

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "170px 150px 1fr auto",
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
                      exceptionShouldPickup
                        ? "PICKUP"
                        : "NO_PICKUP"
                    }
                    onChange={(event) =>
                      setExceptionShouldPickup(
                        event.target.value ===
                          "PICKUP"
                      )
                    }
                  >
                    <option value="NO_PICKUP">
                      臨時不接
                    </option>
                    <option value="PICKUP">
                      臨時要接
                    </option>
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
                            "130px 120px 1fr auto",
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
                          {item.should_pickup
                            ? "臨時要接"
                            : "臨時不接"}
                        </span>
                        <span
                          style={{
                            color: "#787d78",
                          }}
                        >
                          {item.note || "—"}
                        </span>
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