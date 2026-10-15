
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const SUBJECTS = {
  CHINESE: "國語",
  MATH: "數學",
  ENGLISH: "英文",
  SOCIAL: "社會",
  SCIENCE: "自然",
};

const FINISHED = new Set(["SCORED", "EXEMPT_APPROVED"]);

const REQUEST_STATUS = {
  PENDING: "待審核",
  APPROVED: "已核准",
  REJECTED: "已退回",
  WITHDRAWN: "已撤回",
};

const styles = {
  page: { maxWidth: 1350, margin: "0 auto", padding: 28 },
  heading: { fontSize: 28, margin: "0 0 8px", color: "#252525" },
  muted: { color: "#888", fontSize: 13 },
  panel: {
    background: "#fff",
    border: "1px solid #e7e7e7",
    borderRadius: 14,
    padding: 22,
    marginTop: 20,
  },
  row: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" },
  button: {
    padding: "10px 15px",
    border: "1px solid #ddd",
    borderRadius: 9,
    background: "#fff",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  input: {
    padding: "11px 12px",
    border: "1px solid #ddd",
    borderRadius: 9,
    background: "#fff",
    fontFamily: "inherit",
    width: "100%",
  },
  label: { display: "block", marginBottom: 8, fontWeight: 700, fontSize: 14 },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 12,
    marginTop: 20,
  },
  stat: {
    padding: 18,
    border: "1px solid #e8e8e8",
    borderRadius: 12,
    background: "#fafafa",
  },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 700, fontSize: 14 },
  th: {
    padding: "13px 10px",
    textAlign: "left",
    borderBottom: "1px solid #ddd",
    background: "#f7f7f7",
    whiteSpace: "nowrap",
  },
  td: { padding: "13px 10px", borderBottom: "1px solid #eee", verticalAlign: "top" },
};

async function fetchAll(table, columns = "*", filter) {
  const result = [];

  for (let offset = 0; ; offset += 500) {
    let query = supabase
      .from(table)
      .select(columns)
      .range(offset, offset + 499);

    if (filter) query = filter(query);

    const { data, error } = await query;
    if (error) throw error;

    result.push(...(data || []));
    if (!data || data.length < 500) break;
  }

  return result;
}

function examName(exam) {
  if (!exam) return "未知考試";

  const type =
    exam.exam_type === "MOCK"
      ? `模擬考 第${exam.mock_number || 1}次`
      : "學校正式考試";

  return [
    exam.academic_year,
    exam.term,
    exam.exam_period,
    type,
  ].filter(Boolean).join("｜");
}

function dateText(value) {
  return value ? new Date(value).toLocaleString("zh-TW", { hour12: false }) : "—";
}

function Stat({ label, value }) {
  return (
    <div style={styles.stat}>
      <div style={styles.muted}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 7 }}>{value}</div>
    </div>
  );
}

function Table({ headings, children }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={styles.table}>
        <thead>
          <tr>{headings.map((heading) => (
            <th key={heading} style={styles.th}>{heading}</th>
          ))}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Cell({ children }) {
  return <td style={styles.td}>{children}</td>;
}

export default function ScorePendingPage({ onBack, currentTeacher }) {
  const isAdmin = currentTeacher?.role === "admin";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("progress");

  const [exams, setExams] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [requests, setRequests] = useState([]);

  const [selectedExam, setSelectedExam] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [examData, classData, studentData, subjectData, requestData] =
        await Promise.all([
          fetchAll("score_exams"),
          fetchAll("score_exam_classes"),
          fetchAll("score_exam_students"),
          fetchAll("score_exam_subjects"),
          fetchAll("score_exemption_requests"),
        ]);

      setExams(examData);
      setClasses(classData);
      setStudents(studentData.filter((item) => item.is_active !== false));
      setSubjects(subjectData);
      setRequests(requestData);
    } catch (err) {
      console.error("讀取成績進度失敗：", err);
      setError(err.message || "讀取資料失敗。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const examMap = useMemo(
    () => new Map(exams.map((item) => [String(item.id), item])),
    [exams]
  );

  const classMap = useMemo(
    () => new Map(classes.map((item) => [String(item.id), item])),
    [classes]
  );

  const studentMap = useMemo(
    () => new Map(students.map((item) => [String(item.id), item])),
    [students]
  );

  const subjectMap = useMemo(
    () => new Map(subjects.map((item) => [String(item.id), item])),
    [subjects]
  );

  // 只列出已建立科目資料、且至少一科尚未完成的班級。
  // 免考審核中不屬於 FINISHED，因此仍留在待完成。
  const incompleteClassIds = useMemo(() => {
    const studentClassMap = new Map(
      students.map((student) => [
        String(student.id),
        String(student.exam_class_id),
      ])
    );
    const ids = new Set();
    for (const subject of subjects) {
      if (FINISHED.has(subject.status)) continue;
      const classId = studentClassMap.get(String(subject.exam_student_id));
      if (classId) ids.add(classId);
    }
    return ids;
  }, [students, subjects]);

  const examOptions = useMemo(() => {
    const incompleteExamIds = new Set(
      classes
        .filter((item) => incompleteClassIds.has(String(item.id)))
        .map((item) => String(item.exam_id))
    );
    return exams
      .filter((item) => incompleteExamIds.has(String(item.id)))
      .sort((a, b) => examName(b).localeCompare(examName(a), "zh-TW"));
  }, [exams, classes, incompleteClassIds]);

  const classOptions = useMemo(() => (
    classes
      .filter((item) =>
        String(item.exam_id) === selectedExam &&
        incompleteClassIds.has(String(item.id))
      )
      .sort((a, b) =>
        (a.class_name_snapshot || "").localeCompare(
          b.class_name_snapshot || "", "zh-TW"
        )
      )
  ), [classes, selectedExam, incompleteClassIds]);

  // 重新整理後若已全數完成，清除已不在待完成清單中的選擇。
  useEffect(() => {
    if (loading) return;
    if (selectedExam && !examOptions.some((exam) => String(exam.id) === selectedExam)) {
      setSelectedExam("");
      setSelectedClass("");
    } else if (selectedClass && !classOptions.some((item) => String(item.id) === selectedClass)) {
      setSelectedClass("");
    }
  }, [loading, selectedExam, selectedClass, examOptions, classOptions]);

  const selectedClassData = classMap.get(selectedClass);
  const selectedExamData = examMap.get(selectedExam);

  const selectedStudents = useMemo(() => (
    students.filter((item) => String(item.exam_class_id) === selectedClass)
  ), [students, selectedClass]);

  const selectedStudentIds = useMemo(
    () => new Set(selectedStudents.map((item) => String(item.id))),
    [selectedStudents]
  );

  const selectedSubjects = useMemo(() => (
    subjects
      .filter((item) => selectedStudentIds.has(String(item.exam_student_id)))
      .map((item) => ({
        ...item,
        student: studentMap.get(String(item.exam_student_id)),
      }))
  ), [subjects, selectedStudentIds, studentMap]);

  const completed = selectedSubjects.filter((item) => FINISHED.has(item.status));
  const incomplete = selectedSubjects.filter((item) => !FINISHED.has(item.status));

  const visibleIncomplete = incomplete.filter((item) => {
    const text = [
      item.student?.student_name_snapshot,
      SUBJECTS[item.subject] || item.subject,
    ].join(" ").toLowerCase();

    return text.includes(search.trim().toLowerCase());
  });

  const enrichedRequests = useMemo(() => (
    requests.map((request) => {
      const subject = subjectMap.get(String(request.exam_subject_id));
      const student = subject
        ? studentMap.get(String(subject.exam_student_id))
        : null;
      const examClass = student
        ? classMap.get(String(student.exam_class_id))
        : null;
      const exam = examClass
        ? examMap.get(String(examClass.exam_id))
        : null;

      return { ...request, subject, student, examClass, exam };
    })
      .filter((item) => item.subject && item.student && item.exam)
      .sort((a, b) =>
        new Date(b.requested_at || 0) - new Date(a.requested_at || 0)
      )
  ), [requests, subjectMap, studentMap, classMap, examMap]);

  const pendingRequests = enrichedRequests.filter(
    (item) => item.status === "PENDING"
  );

  async function review(request, action) {
    if (!isAdmin || busy) return;

    const label = {
      APPROVE: "核准",
      REJECT: "退回",
      REVOKE: "撤銷核准",
    }[action];

    let note = "";

    if (action === "APPROVE") {
      if (!window.confirm(`確定核准 ${request.student.student_name_snapshot} 的免考申請？`)) {
        return;
      }
    } else {
      const answer = window.prompt(`請填寫「${label}」原因（必填）`);
      if (answer === null) return;
      note = answer.trim();
      if (!note) {
        window.alert("請填寫原因。");
        return;
      }
    }

    setBusy(true);

    try {
      const { error: rpcError } = await supabase.rpc(
        "review_score_exemption",
        {
          p_request_id: request.id,
          p_action: action,
          p_note: note || null,
        }
      );

      if (rpcError) throw rpcError;

      await load();
      window.alert(`${label}成功。`);
    } catch (err) {
      console.error(err);
      window.alert(`${label}失敗：${err.message || "未知錯誤"}`);
    } finally {
      setBusy(false);
    }
  }

  const tabButton = (active) => ({
    ...styles.button,
    background: active ? "#242424" : "#f5f5f5",
    color: active ? "#fff" : "#555",
    borderColor: active ? "#242424" : "#eee",
    fontWeight: active ? 700 : 400,
  });

  return (
    <div style={styles.page}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: 15,
      }}>
        <div>
          <h1 style={styles.heading}>待完成</h1>
          <div style={styles.muted}>
            僅顯示尚未完成的考試與班級，並可審核模擬考免考申請
          </div>
        </div>

        <div style={styles.row}>
          <button style={styles.button} onClick={load} disabled={loading}>
            重新整理
          </button>
          <button style={styles.button} onClick={onBack}>
            ← 返回學生成績
          </button>
        </div>
      </div>

      <div style={{ ...styles.row, marginTop: 25 }}>
        <button
          style={tabButton(tab === "progress")}
          onClick={() => setTab("progress")}
        >
          成績登記檢查
        </button>

        <button
          style={tabButton(tab === "requests")}
          onClick={() => setTab("requests")}
        >
          免考申請審核
          {pendingRequests.length > 0 ? `（待審 ${pendingRequests.length}）` : ""}
        </button>
      </div>

      {error && (
        <div style={{ ...styles.panel, color: "#b33" }}>{error}</div>
      )}

      {loading ? (
        <div style={styles.panel}>正在讀取資料…</div>
      ) : tab === "progress" ? (
        <>
          <section style={styles.panel}>
            <h2 style={{ marginTop: 0 }}>選擇查詢範圍</h2>
            <p style={styles.muted}>已全部完成的班級及考試會自動隱藏，成績資料仍保留。</p>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 18,
            }}>
              <div>
                <label style={styles.label}>考試時程</label>
                <select
                  style={styles.input}
                  value={selectedExam}
                  onChange={(event) => {
                    setSelectedExam(event.target.value);
                    setSelectedClass("");
                    setSearch("");
                  }}
                >
                  <option value="">請選擇考試時程</option>
                  {examOptions.map((exam) => (
                    <option key={exam.id} value={String(exam.id)}>
                      {examName(exam)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={styles.label}>班級</label>
                <select
                  style={styles.input}
                  value={selectedClass}
                  disabled={!selectedExam}
                  onChange={(event) => {
                    setSelectedClass(event.target.value);
                    setSearch("");
                  }}
                >
                  <option value="">請選擇班級</option>
                  {classOptions.map((item) => (
                    <option key={item.id} value={String(item.id)}>
                      {item.class_name_snapshot || "未命名班級"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {examOptions.length === 0 && (
              <p style={styles.muted}>目前沒有尚未完成登記的考試。</p>
            )}

          </section>

          {!selectedExam || !selectedClass ? (
            <div style={{
              ...styles.panel,
              textAlign: "center",
              color: "#888",
              padding: 45,
            }}>
              請先選擇考試時程與班級，登記進度就會自動顯示。
            </div>
          ) : (
            <>
              <section style={styles.panel}>
                <h2 style={{ marginTop: 0 }}>
                  {examName(selectedExamData)}
                </h2>
                <div style={styles.muted}>
                  {selectedClassData?.class_name_snapshot || "班級"}
                  {"　"}即時登記進度
                </div>

                <div style={styles.stats}>
                  <Stat label="應登記科目" value={selectedSubjects.length} />
                  <Stat label="已完成" value={completed.length} />
                  <Stat label="尚未登記" value={incomplete.length} />
                  <Stat
                    label="完成率"
                    value={
                      selectedSubjects.length
                        ? `${Math.round(completed.length / selectedSubjects.length * 100)}%`
                        : "0%"
                    }
                  />
                </div>

                <div style={{
                  height: 9,
                  background: "#eee",
                  borderRadius: 20,
                  overflow: "hidden",
                  marginTop: 20,
                }}>
                  <div style={{
                    height: "100%",
                    width: selectedSubjects.length
                      ? `${completed.length / selectedSubjects.length * 100}%`
                      : "0%",
                    background: "#333",
                    transition: "width .2s",
                  }} />
                </div>

                <p style={styles.muted}>
                  已輸入成績及已核准免考，均計入完成。
                  尚未登記不代表逾期或疏漏。
                </p>
              </section>

              <section style={styles.panel}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 15,
                  alignItems: "center",
                  marginBottom: 18,
                }}>
                  <h2 style={{ margin: 0 }}>
                    尚未完成科目（{incomplete.length}）
                  </h2>

                  <input
                    style={{ ...styles.input, width: 260 }}
                    placeholder="搜尋學生或科目"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>

                <Table headings={["學生", "科目", "目前狀態"]}>
                  {visibleIncomplete.map((item) => (
                    <tr key={item.id}>
                      <Cell>
                        {item.student?.student_name_snapshot || "未知學生"}
                      </Cell>
                      <Cell>{SUBJECTS[item.subject] || item.subject}</Cell>
                      <Cell>
                        {item.status === "EXEMPT_PENDING"
                          ? "免考申請審核中"
                          : item.status === "EXEMPT_REJECTED"
                            ? "免考已退回／待登記"
                            : "尚未登記"}
                      </Cell>
                    </tr>
                  ))}
                </Table>

                {visibleIncomplete.length === 0 && (
                  <p style={{ textAlign: "center", color: "#888", padding: 20 }}>
                    {incomplete.length === 0
                      ? "這個班級目前沒有尚未完成的科目。"
                      : "沒有符合搜尋條件的資料。"}
                  </p>
                )}
              </section>
            </>
          )}
        </>
      ) : (
        <section style={styles.panel}>
          <h2 style={{ marginTop: 0 }}>模擬考免考申請</h2>
          <p style={styles.muted}>
            管理員可以核准、退回或撤銷已核准的免考申請。
            正式大考不開放免考申請。
          </p>

          <Table headings={[
            "申請時間", "考試", "班級", "學生",
            "科目", "申請原因", "狀態",
            "審核備註", ...(isAdmin ? ["主管操作"] : []),
          ]}>
            {enrichedRequests.map((item) => {
              const approved =
                item.status === "APPROVED" &&
                item.subject.status === "EXEMPT_APPROVED";

              const revoked =
                item.status === "APPROVED" &&
                item.subject.status !== "EXEMPT_APPROVED";

              const isMock = item.exam.exam_type === "MOCK";

              return (
                <tr key={item.id}>
                  <Cell>{dateText(item.requested_at)}</Cell>
                  <Cell>{examName(item.exam)}</Cell>
                  <Cell>{item.examClass.class_name_snapshot}</Cell>
                  <Cell>{item.student.student_name_snapshot}</Cell>
                  <Cell>{SUBJECTS[item.subject.subject] || item.subject.subject}</Cell>
                  <Cell>{item.reason || "—"}</Cell>
                  <Cell>
                    {revoked
                      ? "核准已撤銷"
                      : REQUEST_STATUS[item.status] || item.status}
                  </Cell>
                  <Cell>{item.review_note || "—"}</Cell>

                  {isAdmin && (
                    <Cell>
                      <div style={styles.row}>
                        {isMock && item.status === "PENDING" && (
                          <>
                            <button
                              style={styles.button}
                              disabled={busy}
                              onClick={() => review(item, "APPROVE")}
                            >
                              核准
                            </button>
                            <button
                              style={styles.button}
                              disabled={busy}
                              onClick={() => review(item, "REJECT")}
                            >
                              退回
                            </button>
                          </>
                        )}

                        {isMock && approved && (
                          <button
                            style={styles.button}
                            disabled={busy}
                            onClick={() => review(item, "REVOKE")}
                          >
                            撤銷核准
                          </button>
                        )}

                        {(!isMock || (item.status !== "PENDING" && !approved)) && "—"}
                      </div>
                    </Cell>
                  )}
                </tr>
              );
            })}
          </Table>

          {enrichedRequests.length === 0 && (
            <p style={{ textAlign: "center", padding: 25, color: "#888" }}>
              目前沒有免考申請紀錄。
            </p>
          )}
        </section>
      )}
    </div>
  );
}
