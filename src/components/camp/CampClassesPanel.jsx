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

function rangesOverlap(
  startA,
  endA,
  startB,
  endB
) {
  return startA <= endB && startB <= endA;
}

function CampClassesPanel({
  camp,
  onBack,
}) {
  const [classPeriods, setClassPeriods] = useState([]);
  const [selectedClassPeriodId, setSelectedClassPeriodId] = useState("");

  const [students, setStudents] = useState([]);
  const [eligibleStudentIds, setEligibleStudentIds] = useState(new Set());

  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);

  const [isPeriodFormOpen, setIsPeriodFormOpen] = useState(false);
  const [periodForm, setPeriodForm] = useState({
    name: "",
    start_date: "",
    end_date: "",
    notes: "",
  });

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

  const selectedClassPeriod = useMemo(
    () =>
      classPeriods.find(
        (period) => period.id === selectedClassPeriodId
      ) || null,
    [classPeriods, selectedClassPeriodId]
  );

  useEffect(() => {
    loadInitialData();
  }, [camp.id]);

  useEffect(() => {
    if (!selectedClassPeriodId) {
      setEligibleStudentIds(new Set());
      setClasses([]);
      setAssignments([]);
      setSelectedStudentIds(new Set());
      return;
    }

    loadClassPeriodData(selectedClassPeriodId);
  }, [selectedClassPeriodId]);

  async function loadInitialData() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const [
        periodResult,
        studentResult,
      ] = await Promise.all([
        supabase
          .from("camp_class_periods")
          .select(`
            id,
            camp_id,
            name,
            start_date,
            end_date,
            sort_order,
            notes,
            created_at,
            updated_at
          `)
          .eq("camp_id", camp.id)
          .order("sort_order", { ascending: true })
          .order("start_date", { ascending: true }),

        supabase
          .from("camp_students")
          .select("id, chinese_name, grade, school")
          .eq("camp_id", camp.id),
      ]);

      if (periodResult.error) {
        throw periodResult.error;
      }

      if (studentResult.error) {
        throw studentResult.error;
      }

      const nextPeriods = periodResult.data ?? [];

      const nextStudents = (studentResult.data ?? [])
        .sort((a, b) => {
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
        });

      setClassPeriods(nextPeriods);
      setStudents(nextStudents);

      if (nextPeriods.length > 0) {
        setSelectedClassPeriodId((current) =>
          current &&
          nextPeriods.some(
            (period) => period.id === current
          )
            ? current
            : nextPeriods[0].id
        );
      } else {
        setSelectedClassPeriodId("");
      }
    } catch (error) {
      console.error("讀取營隊編班基本資料失敗：", error);
      setErrorMessage(
        `讀取營隊編班資料失敗：${error.message}`
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadClassPeriodData(classPeriodId) {
    const classPeriod =
      classPeriods.find(
        (item) => item.id === classPeriodId
      ) || null;

    if (!classPeriod) {
      return;
    }

    try {
      setIsWorking(true);
      setErrorMessage("");
      setSuccessMessage("");
      setSelectedStudentIds(new Set());

      const [
        classResult,
        assignmentResult,
        recordResult,
      ] = await Promise.all([
        supabase
          .from("camp_classes")
          .select(`
            id,
            camp_id,
            class_period_id,
            name,
            grade_group,
            capacity,
            sort_order,
            notes,
            created_at,
            updated_at
          `)
          .eq("camp_id", camp.id)
          .eq("class_period_id", classPeriodId)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),

        supabase
          .from("camp_class_students")
          .select(`
            id,
            camp_id,
            class_period_id,
            class_id,
            student_id,
            created_at
          `)
          .eq("camp_id", camp.id)
          .eq("class_period_id", classPeriodId),

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
      ]);

      if (classResult.error) {
        throw classResult.error;
      }

      if (assignmentResult.error) {
        throw assignmentResult.error;
      }

      if (recordResult.error) {
        throw recordResult.error;
      }

      const ids = new Set();

      for (const row of recordResult.data ?? []) {
        const dateKey = row.camp_dates?.camp_date;

        if (
          dateKey &&
          dateKey >= classPeriod.start_date &&
          dateKey <= classPeriod.end_date
        ) {
          ids.add(row.student_id);
        }
      }

      setEligibleStudentIds(ids);
      setClasses(classResult.data ?? []);
      setAssignments(assignmentResult.data ?? []);
    } catch (error) {
      console.error("讀取編班區間資料失敗：", error);
      setErrorMessage(
        `讀取編班區間資料失敗：${error.message}`
      );
    } finally {
      setIsWorking(false);
    }
  }

  const eligibleStudents = useMemo(
    () =>
      students.filter(
        (student) =>
          eligibleStudentIds.has(student.id)
      ),
    [students, eligibleStudentIds]
  );

  const assignmentByStudentId = useMemo(() => {
    const map = new Map();

    for (const row of assignments) {
      map.set(row.student_id, row);
    }

    return map;
  }, [assignments]);

  const classById = useMemo(() => {
    const map = new Map();

    for (const item of classes) {
      map.set(item.id, item);
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

  const filteredStudents = useMemo(() => {
    const keyword =
      searchTerm.trim().toLowerCase();

    return eligibleStudents.filter(
      (student) => {
        const assignment =
          assignmentByStudentId.get(student.id);

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
          String(student.chinese_name || "")
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

  const unassignedCount = useMemo(
    () =>
      eligibleStudents.filter(
        (student) =>
          !assignmentByStudentId.has(student.id)
      ).length,
    [eligibleStudents, assignmentByStudentId]
  );

  async function handleCreateClassPeriod(event) {
    event.preventDefault();

    const name = periodForm.name.trim();

    if (!name) {
      setErrorMessage("請輸入編班區間名稱。");
      return;
    }

    if (
      !periodForm.start_date ||
      !periodForm.end_date
    ) {
      setErrorMessage("請選擇編班區間起迄日期。");
      return;
    }

    if (
      periodForm.start_date < camp.start_date ||
      periodForm.end_date > camp.end_date
    ) {
      setErrorMessage(
        "編班區間必須落在營隊總期間內。"
      );
      return;
    }

    if (
      periodForm.end_date <
      periodForm.start_date
    ) {
      setErrorMessage(
        "結束日期不能早於開始日期。"
      );
      return;
    }

    const overlap =
      classPeriods.some(
        (period) =>
          rangesOverlap(
            periodForm.start_date,
            periodForm.end_date,
            period.start_date,
            period.end_date
          )
      );

    if (overlap) {
      setErrorMessage(
        "這段日期已包含在其他編班區間中，請改選其他日期。"
      );
      return;
    }

    try {
      setIsWorking(true);
      setErrorMessage("");
      setSuccessMessage("");

      const nextSortOrder =
        classPeriods.length === 0
          ? 0
          : Math.max(
              ...classPeriods.map(
                (item) =>
                  Number(item.sort_order || 0)
              )
            ) + 1;

      const { data, error } = await supabase
        .from("camp_class_periods")
        .insert({
          camp_id: camp.id,
          name,
          start_date:
            periodForm.start_date,
          end_date:
            periodForm.end_date,
          sort_order:
            nextSortOrder,
          notes:
            periodForm.notes.trim() || null,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      setClassPeriods((current) => [
        ...current,
        data,
      ]);

      setSelectedClassPeriodId(data.id);

      setPeriodForm({
        name: "",
        start_date: "",
        end_date: "",
        notes: "",
      });

      setIsPeriodFormOpen(false);
      setSuccessMessage(
        `已建立「${name}」。`
      );
    } catch (error) {
      console.error("建立編班區間失敗：", error);
      setErrorMessage(
        `建立編班區間失敗：${error.message}`
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDeleteClassPeriod(
    classPeriod
  ) {
    const confirmed =
      window.confirm(
        `確定刪除「${classPeriod.name}」？\n\n這個區間內建立的班級與分班資料也會一起刪除。`
      );

    if (!confirmed) {
      return;
    }

    try {
      setIsWorking(true);
      setErrorMessage("");
      setSuccessMessage("");

      const { error } = await supabase
        .from("camp_class_periods")
        .delete()
        .eq("id", classPeriod.id)
        .eq("camp_id", camp.id);

      if (error) {
        throw error;
      }

      const nextPeriods =
        classPeriods.filter(
          (item) =>
            item.id !== classPeriod.id
        );

      setClassPeriods(nextPeriods);

      setSelectedClassPeriodId(
        nextPeriods[0]?.id || ""
      );

      setSuccessMessage(
        `已刪除「${classPeriod.name}」。`
      );
    } catch (error) {
      console.error("刪除編班區間失敗：", error);
      setErrorMessage(
        `刪除編班區間失敗：${error.message}`
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function handleAddClass() {
    const name = newClassName.trim();

    if (
      !name ||
      !selectedClassPeriodId
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
                  Number(item.sort_order || 0)
              )
            ) + 1;

      const { data, error } = await supabase
        .from("camp_classes")
        .insert({
          camp_id: camp.id,
          class_period_id:
            selectedClassPeriodId,
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
      console.error("建立營隊班級失敗：", error);
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
    if (!selectedClassPeriodId) {
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
            "class_period_id",
            selectedClassPeriodId
          )
          .eq("student_id", studentId);

      if (deleteError) {
        throw deleteError;
      }

      if (!classId) {
        setAssignments((current) =>
          current.filter(
            (row) =>
              row.student_id !== studentId
          )
        );
        return;
      }

      const { data, error } = await supabase
        .from("camp_class_students")
        .insert({
          camp_id: camp.id,
          class_period_id:
            selectedClassPeriodId,
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
            row.student_id !== studentId
        ),
        data,
      ]);
    } catch (error) {
      console.error("指派學生班級失敗：", error);
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
      !selectedClassPeriodId
    ) {
      return;
    }

    const ids =
      Array.from(selectedStudentIds);

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
            "class_period_id",
            selectedClassPeriodId
          )
          .in("student_id", ids);

      if (deleteError) {
        throw deleteError;
      }

      const rows =
        ids.map((studentId) => ({
          camp_id: camp.id,
          class_period_id:
            selectedClassPeriodId,
          class_id: batchClassId,
          student_id: studentId,
        }));

      const { data, error } = await supabase
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

      setSelectedStudentIds(new Set());
      setBatchClassId("");

      setSuccessMessage(
        `已完成 ${rows.length} 位學生的批次分班。`
      );
    } catch (error) {
      console.error("批次分班失敗：", error);
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

      const { error } = await supabase
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
            item.id !== classItem.id
        )
      );

      setAssignments((current) =>
        current.filter(
          (row) =>
            row.class_id !== classItem.id
        )
      );

      setSuccessMessage(
        `已刪除「${classItem.name}」。`
      );
    } catch (error) {
      console.error("刪除營隊班級失敗：", error);
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
    setSelectedStudentIds((current) => {
      const next =
        new Set(current);

      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }

      return next;
    });
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
            編班區間獨立於活動梯次。可依實際需要建立數個編班區間，
            每個區間再建立自己的班級與學生分班。
          </p>
        </div>

        <button
          type="button"
          className="campPrimaryButton"
          onClick={() =>
            setIsPeriodFormOpen(true)
          }
        >
          ＋ 建立編班區間
        </button>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(280px, 0.65fr) minmax(0, 2fr)",
          gap: "22px",
          alignItems: "start",
        }}
      >
        <aside
          style={{
            border: "1px solid #e5ddd1",
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
              編班區間
            </strong>

            <span
              style={{
                marginLeft: "10px",
                opacity: 0.65,
              }}
            >
              {classPeriods.length}
            </span>
          </div>

          {classPeriods.length === 0 ? (
            <div
              style={{
                padding: "24px 18px",
                opacity: 0.65,
              }}
            >
              尚未建立編班區間
            </div>
          ) : (
            classPeriods.map(
              (period) => (
                <button
                  type="button"
                  key={period.id}
                  onClick={() =>
                    setSelectedClassPeriodId(
                      period.id
                    )
                  }
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "16px 18px",
                    border: "0",
                    borderBottom:
                      "1px solid #eee7dd",
                    background:
                      period.id ===
                      selectedClassPeriodId
                        ? "#f5efe7"
                        : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <strong
                    style={{
                      display: "block",
                      marginBottom: "5px",
                    }}
                  >
                    {period.name}
                  </strong>

                  <small
                    style={{
                      opacity: 0.65,
                    }}
                  >
                    {period.start_date}
                    {" ～ "}
                    {period.end_date}
                  </small>
                </button>
              )
            )
          )}
        </aside>

        <main>
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

          {!selectedClassPeriod ? (
            <div className="campEmptyState">
              <strong>
                請先建立編班區間
              </strong>

              <p>
                例如：七月第一段、七月第二段、八月第一段。
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
                    gap: "16px",
                    alignItems:
                      "flex-start",
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                      }}
                    >
                      {selectedClassPeriod.name}
                    </h2>

                    <p
                      style={{
                        margin:
                          "6px 0 0",
                        opacity: 0.65,
                      }}
                    >
                      {selectedClassPeriod.start_date}
                      {" ～ "}
                      {selectedClassPeriod.end_date}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="campSecondaryButton"
                    onClick={() =>
                      handleDeleteClassPeriod(
                        selectedClassPeriod
                      )
                    }
                    disabled={isWorking}
                  >
                    刪除區間
                  </button>
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
                    本區間已報名學生年級分布：
                  </strong>

                  <button
                    type="button"
                    className="campSecondaryButton"
                    onClick={() =>
                      setGradeFilter("ALL")
                    }
                  >
                    全部 {eligibleStudents.length}
                  </button>

                  {GRADE_OPTIONS
                    .filter(
                      (item) =>
                        gradeCounts[item.value]
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
                          {gradeCounts[item.value]}
                        </button>
                      )
                    )}
                </div>
              </section>

              {eligibleStudents.length === 0 ? (
                <div className="campEmptyState">
                  <strong>
                    這個編班區間目前沒有已報名學生
                  </strong>

                  <p>
                    系統會抓這段日期內至少有一天正常出席或請假的學生。
                  </p>
                </div>
              ) : (
                <section
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "minmax(360px, 0.9fr) minmax(560px, 1.6fr)",
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
                        本區間學生總覽
                      </strong>

                      <span
                        style={{
                          marginLeft:
                            "10px",
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
                          {eligibleStudents.length -
                            unassignedCount}
                        </button>
                      </div>

                      {selectedStudentIds.size >
                        0 && (
                        <div
                          style={{
                            display:
                              "grid",
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
                        maxHeight: "640px",
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

                          return (
                            <div
                              key={student.id}
                              style={{
                                display:
                                  "grid",
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
                        placeholder="輸入新班級名稱，例如：A班"
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
                        尚未建立班級。
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
        </main>
      </section>

      {isPeriodFormOpen && (
        <div
          className="campModalBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setIsPeriodFormOpen(
                false
              );
            }
          }}
        >
          <div
            className="campModal"
            role="dialog"
            aria-modal="true"
          >
            <div className="campModal__header">
              <div>
                <p className="campEyebrow">
                  NEW CLASS PERIOD
                </p>

                <h2>
                  建立編班區間
                </h2>
              </div>

              <button
                type="button"
                className="campModal__close"
                onClick={() =>
                  setIsPeriodFormOpen(
                    false
                  )
                }
                disabled={isWorking}
              >
                ×
              </button>
            </div>

            <form
              className="campForm"
              onSubmit={
                handleCreateClassPeriod
              }
            >
              <label className="campForm__field">
                <span>
                  區間名稱 *
                </span>

                <input
                  type="text"
                  value={periodForm.name}
                  onChange={(event) =>
                    setPeriodForm(
                      (current) => ({
                        ...current,
                        name:
                          event.target
                            .value,
                      })
                    )
                  }
                  placeholder="例如：七月第一段"
                  autoFocus
                />
              </label>

              <div className="campForm__dateGrid">
                <label className="campForm__field">
                  <span>
                    開始日期 *
                  </span>

                  <input
                    type="date"
                    value={
                      periodForm.start_date
                    }
                    min={
                      camp.start_date
                    }
                    max={
                      camp.end_date
                    }
                    onChange={(
                      event
                    ) => {
                      const value =
                        event.target
                          .value;

                      setPeriodForm(
                        (current) => ({
                          ...current,
                          start_date:
                            value,
                          end_date:
                            !current.end_date ||
                            current.end_date <
                              value
                              ? value
                              : current.end_date,
                        })
                      );
                    }}
                  />
                </label>

                <label className="campForm__field">
                  <span>
                    結束日期 *
                  </span>

                  <input
                    type="date"
                    value={
                      periodForm.end_date
                    }
                    min={
                      periodForm.start_date ||
                      camp.start_date
                    }
                    max={
                      camp.end_date
                    }
                    onChange={(
                      event
                    ) =>
                      setPeriodForm(
                        (current) => ({
                          ...current,
                          end_date:
                            event.target
                              .value,
                        })
                      )
                    }
                  />
                </label>
              </div>

              <label className="campForm__field">
                <span>
                  備註
                </span>

                <textarea
                  rows="3"
                  value={
                    periodForm.notes
                  }
                  onChange={(event) =>
                    setPeriodForm(
                      (current) => ({
                        ...current,
                        notes:
                          event.target
                            .value,
                      })
                    )
                  }
                  placeholder="可留空"
                />
              </label>

              <p className="campPeriodFormHint">
                編班區間只用來決定這段時間採用哪一套分班；
                它與「活動梯次」互相獨立。
              </p>

              <div className="campModal__actions">
                <button
                  type="button"
                  className="campSecondaryButton"
                  onClick={() =>
                    setIsPeriodFormOpen(
                      false
                    )
                  }
                  disabled={isWorking}
                >
                  取消
                </button>

                <button
                  type="submit"
                  className="campPrimaryButton"
                  disabled={isWorking}
                >
                  {isWorking
                    ? "建立中…"
                    : "建立區間"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CampClassesPanel;