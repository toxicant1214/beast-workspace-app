import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../../lib/supabase";

const GRADE_OPTIONS = [
  { value: "K", label: "幼兒園" },
  { value: "G1", label: "一年級" },
  { value: "G2", label: "二年級" },
  { value: "G3", label: "三年級" },
  { value: "G4", label: "四年級" },
  { value: "G5", label: "五年級" },
  { value: "G6", label: "六年級" },
  { value: "GRADUATED", label: "畢業生" },
];

const GRADE_ORDER = GRADE_OPTIONS.reduce(
  (result, item, index) => ({
    ...result,
    [item.value]: index,
  }),
  {}
);

function getGradeLabel(value) {
  return (
    GRADE_OPTIONS.find((item) => item.value === value)?.label ||
    value ||
    "—"
  );
}

function formatDate(dateString) {
  if (!dateString) return "—";

  const [year, month, day] =
    String(dateString).split("-");

  return `${year}/${month}/${day}`;
}

function CampClassesPanel({
  camp,
  onBack,
}) {
  const [periods, setPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");

  const [students, setStudents] = useState([]);
  const [periodDates, setPeriodDates] = useState([]);
  const [attendanceRows, setAttendanceRows] = useState([]);

  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);

  const [newClassName, setNewClassName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [gradeFilter, setGradeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
  const [batchClassId, setBatchClassId] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const selectedPeriod = useMemo(
    () =>
      periods.find(
        (period) => period.id === selectedPeriodId
      ) || null,
    [periods, selectedPeriodId]
  );

  useEffect(() => {
    loadInitialData();
  }, [camp.id]);

  useEffect(() => {
    if (!selectedPeriodId) {
      setPeriodDates([]);
      setAttendanceRows([]);
      setClasses([]);
      setAssignments([]);
      setSelectedStudentIds(new Set());
      return;
    }

    loadPeriodData(selectedPeriodId);
  }, [selectedPeriodId]);

  async function loadInitialData() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const [
        periodResult,
        studentResult,
      ] = await Promise.all([
        supabase
          .from("camp_periods")
          .select(`
            id,
            camp_id,
            name,
            start_date,
            end_date,
            sort_order
          `)
          .eq("camp_id", camp.id)
          .order("sort_order", { ascending: true })
          .order("start_date", { ascending: true }),

        supabase
          .from("camp_students")
          .select(`
            id,
            chinese_name,
            grade,
            school
          `)
          .eq("camp_id", camp.id),
      ]);

      if (periodResult.error) {
        throw periodResult.error;
      }

      if (studentResult.error) {
        throw studentResult.error;
      }

      const nextPeriods = periodResult.data ?? [];

      const nextStudents =
        [...(studentResult.data ?? [])].sort(
          (a, b) => {
            const gradeDiff =
              (GRADE_ORDER[a.grade] ?? 999) -
              (GRADE_ORDER[b.grade] ?? 999);

            if (gradeDiff !== 0) {
              return gradeDiff;
            }

            return String(a.chinese_name || "")
              .localeCompare(
                String(b.chinese_name || ""),
                "zh-Hant"
              );
          }
        );

      setPeriods(nextPeriods);
      setStudents(nextStudents);

      if (nextPeriods.length > 0) {
        setSelectedPeriodId((current) =>
          current &&
          nextPeriods.some(
            (period) => period.id === current
          )
            ? current
            : nextPeriods[0].id
        );
      } else {
        setSelectedPeriodId("");
      }
    } catch (error) {
      console.error(
        "讀取營隊編班基本資料失敗：",
        error
      );

      setErrorMessage(
        `讀取營隊編班資料失敗：${error.message}`
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPeriodData(periodId) {
    try {
      setIsWorking(true);
      setErrorMessage("");
      setSuccessMessage("");
      setSelectedStudentIds(new Set());

      const [
        periodDateResult,
        recordResult,
        classResult,
        assignmentResult,
      ] = await Promise.all([
        supabase
          .from("camp_period_dates")
          .select("camp_date")
          .eq("camp_id", camp.id)
          .eq("period_id", periodId)
          .order("camp_date", { ascending: true }),

        supabase
          .from("camp_student_daily_records")
          .select(`
            student_id,
            attendance_status,
            camp_dates (
              camp_date
            )
          `)
          .eq("camp_id", camp.id)
          .neq("attendance_status", "ABSENT"),

        supabase
          .from("camp_classes")
          .select(`
            id,
            camp_id,
            period_id,
            name,
            grade_group,
            capacity,
            sort_order,
            notes,
            created_at,
            updated_at
          `)
          .eq("camp_id", camp.id)
          .eq("period_id", periodId)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),

        supabase
          .from("camp_class_students")
          .select(`
            id,
            camp_id,
            period_id,
            class_id,
            student_id,
            created_at
          `)
          .eq("camp_id", camp.id)
          .eq("period_id", periodId),
      ]);

      if (periodDateResult.error) {
        throw periodDateResult.error;
      }

      if (recordResult.error) {
        throw recordResult.error;
      }

      if (classResult.error) {
        throw classResult.error;
      }

      if (assignmentResult.error) {
        throw assignmentResult.error;
      }

      const nextPeriodDates =
        (periodDateResult.data ?? [])
          .map((row) => row.camp_date)
          .filter(Boolean);

      const periodDateSet =
        new Set(nextPeriodDates);

      const nextAttendanceRows =
        (recordResult.data ?? []).filter(
          (row) => {
            const dateKey =
              row.camp_dates?.camp_date;

            return (
              dateKey &&
              periodDateSet.has(dateKey)
            );
          }
        );

      setPeriodDates(nextPeriodDates);
      setAttendanceRows(nextAttendanceRows);
      setClasses(classResult.data ?? []);
      setAssignments(
        assignmentResult.data ?? []
      );
    } catch (error) {
      console.error(
        "讀取活動梯次編班資料失敗：",
        error
      );

      setErrorMessage(
        `讀取活動梯次編班資料失敗：${error.message}`
      );
    } finally {
      setIsWorking(false);
    }
  }

  const participationByStudentId =
    useMemo(() => {
      const map = new Map();

      for (const row of attendanceRows) {
        const current =
          map.get(row.student_id) || {
            total: 0,
            normal: 0,
            leave: 0,
          };

        current.total += 1;

        if (
          row.attendance_status === "LEAVE"
        ) {
          current.leave += 1;
        } else {
          current.normal += 1;
        }

        map.set(row.student_id, current);
      }

      return map;
    }, [attendanceRows]);

  const eligibleStudents = useMemo(
    () =>
      students.filter(
        (student) =>
          participationByStudentId.has(
            student.id
          )
      ),
    [
      students,
      participationByStudentId,
    ]
  );

  const assignmentByStudentId =
    useMemo(() => {
      const map = new Map();

      for (const row of assignments) {
        map.set(
          row.student_id,
          row
        );
      }

      return map;
    }, [assignments]);

  const classById = useMemo(() => {
    const map = new Map();

    for (const classItem of classes) {
      map.set(
        classItem.id,
        classItem
      );
    }

    return map;
  }, [classes]);

  const gradeCounts = useMemo(() => {
    const counts = {};

    for (const student of eligibleStudents) {
      counts[student.grade] =
        (counts[student.grade] || 0) + 1;
    }

    return counts;
  }, [eligibleStudents]);

  const filteredStudents =
    useMemo(() => {
      const keyword =
        searchTerm.trim().toLowerCase();

      return eligibleStudents.filter(
        (student) => {
          const assignment =
            assignmentByStudentId.get(
              student.id
            );

          if (
            statusFilter === "UNASSIGNED" &&
            assignment
          ) {
            return false;
          }

          if (
            statusFilter === "ASSIGNED" &&
            !assignment
          ) {
            return false;
          }

          if (
            gradeFilter !== "ALL" &&
            student.grade !== gradeFilter
          ) {
            return false;
          }

          if (!keyword) {
            return true;
          }

          return (
            String(
              student.chinese_name || ""
            )
              .toLowerCase()
              .includes(keyword) ||
            String(student.school || "")
              .toLowerCase()
              .includes(keyword) ||
            getGradeLabel(student.grade)
              .toLowerCase()
              .includes(keyword)
          );
        }
      );
    }, [
      eligibleStudents,
      assignmentByStudentId,
      statusFilter,
      gradeFilter,
      searchTerm,
    ]);

  const unassignedCount =
    useMemo(
      () =>
        eligibleStudents.filter(
          (student) =>
            !assignmentByStudentId.has(
              student.id
            )
        ).length,
      [
        eligibleStudents,
        assignmentByStudentId,
      ]
    );

  async function handleAddClass() {
    const name =
      newClassName.trim();

    if (
      !name ||
      !selectedPeriodId
    ) {
      return;
    }

    try {
      setIsWorking(true);
      setErrorMessage("");
      setSuccessMessage("");

      const nextSortOrder =
        classes.length === 0
          ? 0
          : Math.max(
              ...classes.map(
                (item) =>
                  Number(
                    item.sort_order || 0
                  )
              )
            ) + 1;

      const { data, error } =
        await supabase
          .from("camp_classes")
          .insert({
            camp_id: camp.id,
            period_id:
              selectedPeriodId,
            class_period_id: null,
            name,
            sort_order:
              nextSortOrder,
          })
          .select()
          .single();

      if (error) {
        throw error;
      }

      setClasses((current) => [
        ...current,
        data,
      ]);

      setNewClassName("");

      setSuccessMessage(
        `已建立班級「${name}」。`
      );
    } catch (error) {
      console.error(
        "建立營隊班級失敗：",
        error
      );

      setErrorMessage(
        `建立班級失敗：${error.message}`
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function assignStudent(
    studentId,
    classId
  ) {
    if (!selectedPeriodId) {
      return;
    }

    try {
      setIsWorking(true);
      setErrorMessage("");
      setSuccessMessage("");

      const { error: deleteError } =
        await supabase
          .from("camp_class_students")
          .delete()
          .eq("camp_id", camp.id)
          .eq(
            "period_id",
            selectedPeriodId
          )
          .eq(
            "student_id",
            studentId
          );

      if (deleteError) {
        throw deleteError;
      }

      if (!classId) {
        setAssignments((current) =>
          current.filter(
            (row) =>
              row.student_id !==
              studentId
          )
        );

        return;
      }

      const { data, error } =
        await supabase
          .from("camp_class_students")
          .insert({
            camp_id: camp.id,
            period_id:
              selectedPeriodId,
            class_period_id: null,
            class_id: classId,
            student_id: studentId,
          })
          .select()
          .single();

      if (error) {
        throw error;
      }

      setAssignments((current) => [
        ...current.filter(
          (row) =>
            row.student_id !==
            studentId
        ),
        data,
      ]);
    } catch (error) {
      console.error(
        "指派學生班級失敗：",
        error
      );

      setErrorMessage(
        `分班失敗：${error.message}`
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function handleBatchAssign() {
    if (
      !batchClassId ||
      selectedStudentIds.size === 0 ||
      !selectedPeriodId
    ) {
      return;
    }

    const ids =
      Array.from(
        selectedStudentIds
      );

    try {
      setIsWorking(true);
      setErrorMessage("");
      setSuccessMessage("");

      const { error: deleteError } =
        await supabase
          .from("camp_class_students")
          .delete()
          .eq("camp_id", camp.id)
          .eq(
            "period_id",
            selectedPeriodId
          )
          .in("student_id", ids);

      if (deleteError) {
        throw deleteError;
      }

      const rows =
        ids.map((studentId) => ({
          camp_id: camp.id,
          period_id:
            selectedPeriodId,
          class_period_id: null,
          class_id:
            batchClassId,
          student_id:
            studentId,
        }));

      const { data, error } =
        await supabase
          .from("camp_class_students")
          .insert(rows)
          .select();

      if (error) {
        throw error;
      }

      const selectedSet =
        new Set(ids);

      setAssignments((current) => [
        ...current.filter(
          (row) =>
            !selectedSet.has(
              row.student_id
            )
        ),
        ...(data ?? []),
      ]);

      setSelectedStudentIds(
        new Set()
      );
      setBatchClassId("");

      setSuccessMessage(
        `已完成 ${rows.length} 位學生的批次分班。`
      );
    } catch (error) {
      console.error(
        "批次分班失敗：",
        error
      );

      setErrorMessage(
        `批次分班失敗：${error.message}`
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDeleteClass(
    classItem
  ) {
    const confirmed =
      window.confirm(
        `確定刪除「${classItem.name}」？\n\n該班學生會回到未分班狀態。`
      );

    if (!confirmed) {
      return;
    }

    try {
      setIsWorking(true);
      setErrorMessage("");
      setSuccessMessage("");

      const { error } =
        await supabase
          .from("camp_classes")
          .delete()
          .eq("id", classItem.id)
          .eq("camp_id", camp.id);

      if (error) {
        throw error;
      }

      setClasses((current) =>
        current.filter(
          (item) =>
            item.id !==
            classItem.id
        )
      );

      setAssignments((current) =>
        current.filter(
          (row) =>
            row.class_id !==
            classItem.id
        )
      );

      setSuccessMessage(
        `已刪除「${classItem.name}」。`
      );
    } catch (error) {
      console.error(
        "刪除營隊班級失敗：",
        error
      );

      setErrorMessage(
        `刪除班級失敗：${error.message}`
      );
    } finally {
      setIsWorking(false);
    }
  }

  function toggleSelectedStudent(
    studentId
  ) {
    setSelectedStudentIds(
      (current) => {
        const next =
          new Set(current);

        if (
          next.has(studentId)
        ) {
          next.delete(studentId);
        } else {
          next.add(studentId);
        }

        return next;
      }
    );
  }

  function getClassStudents(
    classId
  ) {
    const ids =
      new Set(
        assignments
          .filter(
            (row) =>
              row.class_id === classId
          )
          .map(
            (row) =>
              row.student_id
          )
      );

    return eligibleStudents.filter(
      (student) =>
        ids.has(student.id)
    );
  }

  function getClassGradeSummary(
    classId
  ) {
    const classStudents =
      getClassStudents(classId);

    const counts = {};

    for (const student of classStudents) {
      counts[student.grade] =
        (counts[student.grade] || 0) + 1;
    }

    return GRADE_OPTIONS
      .filter(
        (item) =>
          counts[item.value]
      )
      .map(
        (item) =>
          `${item.label} ${counts[item.value]}`
      )
      .join("｜");
  }

  if (isLoading) {
    return (
      <div className="campPage">
        <div className="campEmptyState">
          正在讀取營隊編班資料……
        </div>
      </div>
    );
  }

  return (
    <div className="campPage">
      <button
        type="button"
        className="campBackButton"
        onClick={onBack}
      >
        ← 返回營隊資料夾
      </button>

      <header
        className="campPage__header"
        style={{
          marginTop: "24px",
          alignItems: "flex-end",
        }}
      >
        <div>
          <p className="campEyebrow">
            CAMP CLASSES
          </p>

          <h1>營隊編班</h1>

          <p className="campPage__summary">
            直接沿用前面已建立的活動梯次與每日報名內容，
            不需要重複設定日期或學生名單。
          </p>
        </div>
      </header>

      <section
        style={{
          background: "#fffdf9",
          border: "1px solid #e5ddd1",
          borderRadius: "18px",
          padding: "20px",
          marginBottom: "20px",
        }}
      >
        <label
          style={{
            display: "grid",
            gap: "8px",
            maxWidth: "560px",
          }}
        >
          <strong>
            選擇活動梯次
          </strong>

          <select
            value={selectedPeriodId}
            onChange={(event) =>
              setSelectedPeriodId(
                event.target.value
              )
            }
            disabled={isWorking}
            style={{
              minHeight: "46px",
            }}
          >
            {periods.length === 0 ? (
              <option value="">
                尚未建立活動梯次
              </option>
            ) : (
              periods.map(
                (period) => (
                  <option
                    key={period.id}
                    value={period.id}
                  >
                    {period.name}
                    {"　"}
                    {formatDate(
                      period.start_date
                    )}
                    {"～"}
                    {formatDate(
                      period.end_date
                    )}
                  </option>
                )
              )
            )}
          </select>
        </label>
      </section>

      {errorMessage && (
        <div className="campMessage campMessage--error">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="campMessage campMessage--success">
          {successMessage}
        </div>
      )}

      {!selectedPeriod ? (
        <div className="campEmptyState">
          <strong>
            尚未建立活動梯次
          </strong>

          <p>
            請先回到「活動梯次」建立營隊梯次。
          </p>
        </div>
      ) : (
        <>
          <section
            style={{
              background: "#fffdf9",
              border: "1px solid #e5ddd1",
              borderRadius: "18px",
              padding: "18px 20px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                gap: "18px",
                alignItems:
                  "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                  }}
                >
                  {selectedPeriod.name}
                </h2>

                <p
                  style={{
                    margin:
                      "6px 0 0",
                    opacity: 0.65,
                  }}
                >
                  {formatDate(
                    selectedPeriod.start_date
                  )}
                  {" ～ "}
                  {formatDate(
                    selectedPeriod.end_date
                  )}
                  {" ・ "}
                  {periodDates.length}
                  {" 個活動日"}
                </p>
              </div>

              <strong>
                本梯至少報名一天：
                {" "}
                {eligibleStudents.length}
                {" 人"}
              </strong>
            </div>
          </section>

          <section
            style={{
              background: "#fffdf9",
              border: "1px solid #e5ddd1",
              borderRadius: "18px",
              padding: "18px 20px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <strong
                style={{
                  marginRight: "8px",
                }}
              >
                年級分布：
              </strong>

              <button
                type="button"
                className="campSecondaryButton"
                onClick={() =>
                  setGradeFilter("ALL")
                }
              >
                全部{" "}
                {eligibleStudents.length}
              </button>

              {GRADE_OPTIONS
                .filter(
                  (item) =>
                    gradeCounts[
                      item.value
                    ]
                )
                .map(
                  (item) => (
                    <button
                      type="button"
                      key={item.value}
                      className="campSecondaryButton"
                      onClick={() =>
                        setGradeFilter(
                          item.value
                        )
                      }
                    >
                      {item.label}{" "}
                      {
                        gradeCounts[
                          item.value
                        ]
                      }
                    </button>
                  )
                )}
            </div>
          </section>

          {eligibleStudents.length === 0 ? (
            <div className="campEmptyState">
              <strong>
                這一梯目前沒有已報名學生
              </strong>

              <p>
                請先到「每日報名」設定學生的參與日期。
              </p>
            </div>
          ) : (
            <section
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(390px, 0.95fr) minmax(560px, 1.55fr)",
                gap: "22px",
                alignItems: "start",
              }}
            >
              <div
                style={{
                  border:
                    "1px solid #e5ddd1",
                  borderRadius: "18px",
                  background: "#fffdf9",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "18px",
                    borderBottom:
                      "1px solid #eee7dd",
                  }}
                >
                  <strong>
                    本梯學生總覽
                  </strong>

                  <span
                    style={{
                      marginLeft: "10px",
                      opacity: 0.65,
                    }}
                  >
                    {
                      eligibleStudents.length
                    }{" "}
                    人
                  </span>
                </div>

                <div
                  style={{
                    padding: "14px",
                    display: "grid",
                    gap: "10px",
                    borderBottom:
                      "1px solid #eee7dd",
                  }}
                >
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) =>
                      setSearchTerm(
                        event.target.value
                      )
                    }
                    placeholder="搜尋姓名、年級或學校"
                  />

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      className="campSecondaryButton"
                      onClick={() =>
                        setStatusFilter(
                          "ALL"
                        )
                      }
                    >
                      全部
                    </button>

                    <button
                      type="button"
                      className="campSecondaryButton"
                      onClick={() =>
                        setStatusFilter(
                          "UNASSIGNED"
                        )
                      }
                    >
                      未分班{" "}
                      {unassignedCount}
                    </button>

                    <button
                      type="button"
                      className="campSecondaryButton"
                      onClick={() =>
                        setStatusFilter(
                          "ASSIGNED"
                        )
                      }
                    >
                      已分班{" "}
                      {
                        eligibleStudents.length -
                        unassignedCount
                      }
                    </button>
                  </div>

                  {selectedStudentIds.size >
                    0 && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "1fr auto",
                        gap: "8px",
                      }}
                    >
                      <select
                        value={
                          batchClassId
                        }
                        onChange={(
                          event
                        ) =>
                          setBatchClassId(
                            event.target
                              .value
                          )
                        }
                      >
                        <option value="">
                          選擇批次分入班級
                        </option>

                        {classes.map(
                          (
                            classItem
                          ) => (
                            <option
                              key={
                                classItem.id
                              }
                              value={
                                classItem.id
                              }
                            >
                              {
                                classItem.name
                              }
                            </option>
                          )
                        )}
                      </select>

                      <button
                        type="button"
                        className="campPrimaryButton"
                        onClick={
                          handleBatchAssign
                        }
                        disabled={
                          !batchClassId ||
                          isWorking
                        }
                      >
                        分班{" "}
                        {
                          selectedStudentIds.size
                        }{" "}
                        人
                      </button>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    maxHeight: "650px",
                    overflowY: "auto",
                  }}
                >
                  {filteredStudents.map(
                    (student) => {
                      const assignment =
                        assignmentByStudentId.get(
                          student.id
                        );

                      const assignedClass =
                        assignment
                          ? classById.get(
                              assignment.class_id
                            )
                          : null;

                      const participation =
                        participationByStudentId.get(
                          student.id
                        );

                      return (
                        <div
                          key={student.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "auto 1fr minmax(145px, auto)",
                            gap: "10px",
                            alignItems:
                              "center",
                            padding:
                              "12px 14px",
                            borderBottom:
                              "1px solid #f0ebe4",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.has(
                              student.id
                            )}
                            onChange={() =>
                              toggleSelectedStudent(
                                student.id
                              )
                            }
                          />

                          <div>
                            <div>
                              <span
                                style={{
                                  opacity:
                                    0.65,
                                  marginRight:
                                    "10px",
                                }}
                              >
                                {getGradeLabel(
                                  student.grade
                                )}
                              </span>

                              <strong>
                                {
                                  student.chinese_name
                                }
                              </strong>
                            </div>

                            <small
                              style={{
                                opacity:
                                  0.65,
                              }}
                            >
                              本梯報名{" "}
                              {
                                participation?.total ||
                                0
                              }{" "}
                              天
                              {participation?.leave
                                ? ` ・ 請假 ${participation.leave} 天`
                                : ""}
                              {" ・ "}
                              {assignedClass
                                ? `已分入 ${assignedClass.name}`
                                : "尚未分班"}
                            </small>
                          </div>

                          <select
                            value={
                              assignment?.class_id ||
                              ""
                            }
                            onChange={(
                              event
                            ) =>
                              assignStudent(
                                student.id,
                                event.target
                                  .value
                              )
                            }
                            disabled={
                              isWorking
                            }
                          >
                            <option value="">
                              未分班
                            </option>

                            {classes.map(
                              (
                                classItem
                              ) => (
                                <option
                                  key={
                                    classItem.id
                                  }
                                  value={
                                    classItem.id
                                  }
                                >
                                  {
                                    classItem.name
                                  }
                                </option>
                              )
                            )}
                          </select>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              <div
                style={{
                  border:
                    "1px solid #e5ddd1",
                  borderRadius: "18px",
                  background: "#fffdf9",
                  padding: "18px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    marginBottom:
                      "18px",
                  }}
                >
                  <input
                    type="text"
                    value={newClassName}
                    onChange={(event) =>
                      setNewClassName(
                        event.target
                          .value
                      )
                    }
                    placeholder="輸入班級名稱，例如：第二梯A"
                    style={{
                      flex: 1,
                    }}
                  />

                  <button
                    type="button"
                    className="campPrimaryButton"
                    onClick={
                      handleAddClass
                    }
                    disabled={
                      isWorking ||
                      !newClassName.trim()
                    }
                  >
                    ＋ 新增班級
                  </button>
                </div>

                {classes.length === 0 ? (
                  <div className="campEmptyState">
                    <strong>
                      這一梯還沒有班級
                    </strong>

                    <p>
                      建立 A、B、C 班後即可開始分班。
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(260px, 1fr))",
                      gap: "14px",
                    }}
                  >
                    {classes.map(
                      (classItem) => {
                        const classStudents =
                          getClassStudents(
                            classItem.id
                          );

                        const gradeSummary =
                          getClassGradeSummary(
                            classItem.id
                          );

                        return (
                          <article
                            key={
                              classItem.id
                            }
                            style={{
                              border:
                                "1px solid #e5ddd1",
                              borderRadius:
                                "16px",
                              overflow:
                                "hidden",
                            }}
                          >
                            <div
                              style={{
                                padding:
                                  "14px 16px",
                                display:
                                  "flex",
                                justifyContent:
                                  "space-between",
                                alignItems:
                                  "flex-start",
                                gap:
                                  "10px",
                                borderBottom:
                                  "1px solid #eee7dd",
                              }}
                            >
                              <div>
                                <strong>
                                  {
                                    classItem.name
                                  }
                                </strong>

                                <div
                                  style={{
                                    marginTop:
                                      "4px",
                                    fontSize:
                                      "13px",
                                    opacity:
                                      0.65,
                                  }}
                                >
                                  {
                                    classStudents.length
                                  }{" "}
                                  人
                                </div>

                                {gradeSummary && (
                                  <div
                                    style={{
                                      marginTop:
                                        "5px",
                                      fontSize:
                                        "12px",
                                      opacity:
                                        0.65,
                                    }}
                                  >
                                    {
                                      gradeSummary
                                    }
                                  </div>
                                )}
                              </div>

                              <button
                                type="button"
                                className="campSecondaryButton"
                                onClick={() =>
                                  handleDeleteClass(
                                    classItem
                                  )
                                }
                                disabled={
                                  isWorking
                                }
                              >
                                刪除
                              </button>
                            </div>

                            <div
                              style={{
                                maxHeight:
                                  "470px",
                                overflowY:
                                  "auto",
                              }}
                            >
                              {classStudents.length ===
                              0 ? (
                                <div
                                  style={{
                                    padding:
                                      "18px",
                                    opacity:
                                      0.55,
                                  }}
                                >
                                  尚無學生
                                </div>
                              ) : (
                                classStudents.map(
                                  (
                                    student
                                  ) => (
                                    <div
                                      key={
                                        student.id
                                      }
                                      style={{
                                        display:
                                          "flex",
                                        justifyContent:
                                          "space-between",
                                        alignItems:
                                          "center",
                                        gap:
                                          "10px",
                                        padding:
                                          "11px 14px",
                                        borderBottom:
                                          "1px solid #f0ebe4",
                                      }}
                                    >
                                      <div>
                                        <small
                                          style={{
                                            opacity:
                                              0.6,
                                            marginRight:
                                              "8px",
                                          }}
                                        >
                                          {getGradeLabel(
                                            student.grade
                                          )}
                                        </small>

                                        <strong>
                                          {
                                            student.chinese_name
                                          }
                                        </strong>
                                      </div>

                                      <button
                                        type="button"
                                        className="campSecondaryButton"
                                        onClick={() =>
                                          assignStudent(
                                            student.id,
                                            ""
                                          )
                                        }
                                        disabled={
                                          isWorking
                                        }
                                      >
                                        ×
                                      </button>
                                    </div>
                                  )
                                )
                              )}
                            </div>
                          </article>
                        );
                      }
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default CampClassesPanel;