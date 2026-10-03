import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../lib/supabase";


const SUBJECT_LABELS = {
  CHINESE: "國語",
  MATH: "數學",
  ENGLISH: "英文",
  SOCIAL: "社會",
  SCIENCE: "自然",
};


const MOCK_SUBJECTS = [
  "CHINESE",
  "MATH",
  "SOCIAL",
  "SCIENCE",
];


const OFFICIAL_SUBJECTS = [
  "CHINESE",
  "MATH",
  "ENGLISH",
  "SOCIAL",
  "SCIENCE",
];


function getStatusLabel(status) {
  switch (status) {
    case "SCORED":
      return "已登記";

    case "ABSENT":
      return "缺考";

    case "EXEMPT_PENDING":
      return "免考審核中";

    case "EXEMPT_APPROVED":
      return "免考";

    case "EXEMPT_REJECTED":
      return "免考未通過";

    case "PENDING":
    default:
      return "待登記";
  }
}


export default function ScoreClassEntryPage({
  examClassId,
  examInfo,
  classInfo,
  onBack,
}) {
  const [
    students,
    setStudents,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");


  const subjects =
    useMemo(() => {
      if (
        examInfo?.examType ===
        "OFFICIAL"
      ) {
        return OFFICIAL_SUBJECTS;
      }

      return MOCK_SUBJECTS;
    }, [
      examInfo?.examType,
    ]);


  useEffect(() => {
    let cancelled = false;


    async function loadScoreData() {
      if (!examClassId) {
        return;
      }


      try {
        setLoading(true);
        setErrorMessage("");


        /*
         * 先讀取這次考試建立當下的
         * 學生快照。
         *
         * 這裡不是重新讀取目前班級學生，
         * 所以未來學生轉班、退班，
         * 都不會改寫這場考試的歷史名單。
         */
        const {
          data: studentRows,
          error: studentError,
        } =
          await supabase
            .from(
              "score_exam_students"
            )
            .select(
              `
              id,
              student_id,
              student_name_snapshot,
              grade_snapshot,
              class_name_snapshot,
              is_active,
              created_at
              `
            )
            .eq(
              "exam_class_id",
              examClassId
            )
            .eq(
              "is_active",
              true
            )
            .order(
              "student_name_snapshot",
              {
                ascending: true,
              }
            );


        if (studentError) {
          throw studentError;
        }


        if (cancelled) {
          return;
        }


        const safeStudentRows =
          studentRows || [];


        if (
          safeStudentRows.length === 0
        ) {
          setStudents([]);
          return;
        }


        const examStudentIds =
          safeStudentRows.map(
            (student) =>
              student.id
          );


        /*
         * 再讀取每位學生的各科資料。
         */
        const {
          data: subjectRows,
          error: subjectError,
        } =
          await supabase
            .from(
              "score_exam_subjects"
            )
            .select(
              `
              id,
              exam_student_id,
              subject,
              score,
              status,
              created_at,
              updated_at
              `
            )
            .in(
              "exam_student_id",
              examStudentIds
            );


        if (subjectError) {
          throw subjectError;
        }


        if (cancelled) {
          return;
        }


        const subjectsByStudent =
          {};


        for (
          const subjectRow
          of subjectRows || []
        ) {
          if (
            !subjectsByStudent[
              subjectRow.exam_student_id
            ]
          ) {
            subjectsByStudent[
              subjectRow.exam_student_id
            ] = {};
          }


          subjectsByStudent[
            subjectRow.exam_student_id
          ][subjectRow.subject] =
            subjectRow;
        }


        const combinedStudents =
          safeStudentRows.map(
            (student) => ({
              ...student,

              subjects:
                subjectsByStudent[
                  student.id
                ] || {},
            })
          );


        setStudents(
          combinedStudents
        );
      } catch (error) {
        console.error(
          "讀取班級成績表失敗：",
          error
        );


        if (!cancelled) {
          setStudents([]);

          setErrorMessage(
            error?.message ||
              "無法讀取班級成績資料。"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }


    loadScoreData();


    return () => {
      cancelled = true;
    };
  }, [
    examClassId,
  ]);


  const completion =
    useMemo(() => {
      let total = 0;
      let completed = 0;


      for (
        const student of students
      ) {
        for (
          const subject of subjects
        ) {
          total += 1;

          const row =
            student.subjects?.[
              subject
            ];


          if (
            row &&
            (
              row.status ===
                "SCORED" ||
              row.status ===
                "ABSENT" ||
              row.status ===
                "EXEMPT_APPROVED"
            )
          ) {
            completed += 1;
          }
        }
      }


      return {
        total,
        completed,
        pending:
          total - completed,
      };
    }, [
      students,
      subjects,
    ]);


  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <div style={styles.eyebrow}>
            BEAST WORKSPACE
          </div>

          <h1 style={styles.title}>
            {classInfo?.class_name ||
              "班級"}
            {" 成績登記"}
          </h1>

          <div style={styles.examInfo}>
            <span>
              {examInfo?.academicYear}
              {" 學年度"}
            </span>

            <span style={styles.dot}>
              ·
            </span>

            <span>
              {examInfo?.term}
            </span>

            <span style={styles.dot}>
              ·
            </span>

            <span>
              {examInfo?.examPeriod}
            </span>

            <span style={styles.dot}>
              ·
            </span>

            <strong>
              {examInfo?.examLabel}
            </strong>
          </div>
        </div>


        <button
          type="button"
          onClick={onBack}
          style={styles.backButton}
        >
          ← 返回選擇班級
        </button>
      </div>


      <div style={styles.statGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>
            學生
          </div>

          <div style={styles.statValue}>
            {students.length}
          </div>
        </div>


        <div style={styles.statCard}>
          <div style={styles.statLabel}>
            應登記
          </div>

          <div style={styles.statValue}>
            {completion.total}
          </div>
        </div>


        <div style={styles.statCard}>
          <div style={styles.statLabel}>
            已完成
          </div>

          <div style={styles.statValue}>
            {completion.completed}
          </div>
        </div>


        <div style={styles.statCard}>
          <div style={styles.statLabel}>
            待完成
          </div>

          <div style={styles.statValue}>
            {completion.pending}
          </div>
        </div>
      </div>


      <section style={styles.panel}>
        <div style={styles.sectionHeader}>
          <div>
            <div style={styles.sectionTitle}>
              成績表
            </div>

            <div style={styles.sectionHint}>
              {examInfo?.examType ===
              "OFFICIAL"
                ? "正式大考：國語、數學、英文、社會、自然"
                : "模擬考：國語、數學、社會、自然"}
            </div>
          </div>
        </div>


        {loading && (
          <div style={styles.emptyState}>
            正在讀取成績表…
          </div>
        )}


        {!loading &&
          errorMessage && (
            <div style={styles.errorState}>
              {errorMessage}
            </div>
          )}


        {!loading &&
          !errorMessage &&
          students.length === 0 && (
            <div style={styles.emptyState}>
              這個班級目前沒有考試學生資料。
            </div>
          )}


        {!loading &&
          !errorMessage &&
          students.length > 0 && (
            <div
              style={
                styles.tableWrapper
              }
            >
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th
                      style={{
                        ...styles.th,
                        ...styles.nameColumn,
                      }}
                    >
                      學生
                    </th>

                    {subjects.map(
                      (subject) => (
                        <th
                          key={
                            subject
                          }
                          style={
                            styles.th
                          }
                        >
                          {
                            SUBJECT_LABELS[
                              subject
                            ]
                          }
                        </th>
                      )
                    )}
                  </tr>
                </thead>


                <tbody>
                  {students.map(
                    (student) => (
                      <tr
                        key={
                          student.id
                        }
                      >
                        <td
                          style={{
                            ...styles.td,
                            ...styles.studentCell,
                          }}
                        >
                          <div
                            style={
                              styles.studentName
                            }
                          >
                            {
                              student.student_name_snapshot
                            }
                          </div>

                          <div
                            style={
                              styles.studentMeta
                            }
                          >
                            {student.grade_snapshot ||
                              ""}
                          </div>
                        </td>


                        {subjects.map(
                          (
                            subject
                          ) => {
                            const row =
                              student
                                .subjects?.[
                                subject
                              ];


                            const status =
                              row?.status ||
                              "PENDING";


                            return (
                              <td
                                key={
                                  subject
                                }
                                style={
                                  styles.td
                                }
                              >
                                {status ===
                                "SCORED" ? (
                                  <div
                                    style={
                                      styles.score
                                    }
                                  >
                                    {
                                      row.score
                                    }
                                  </div>
                                ) : (
                                  <div
                                    style={
                                      styles.pendingScore
                                    }
                                  >
                                    —
                                  </div>
                                )}

                                <div
                                  style={
                                    styles.statusText
                                  }
                                >
                                  {
                                    getStatusLabel(
                                      status
                                    )
                                  }
                                </div>
                              </td>
                            );
                          }
                        )}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
      </section>
    </div>
  );
}


const styles = {
  page: {
    padding: "32px",
    maxWidth: "1300px",
    margin: "0 auto",
  },

  topRow: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "flex-start",
    gap: "20px",
    marginBottom: "24px",
  },

  eyebrow: {
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "0.14em",
    color: "#888",
    marginBottom: "8px",
  },

  title: {
    margin: 0,
    fontSize: "30px",
    fontWeight: "800",
    color: "#222",
  },

  examInfo: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "7px",
    marginTop: "10px",
    color: "#666",
    fontSize: "14px",
  },

  dot: {
    color: "#bbb",
  },

  backButton: {
    border: "1px solid #ddd",
    background: "#fff",
    borderRadius: "10px",
    padding: "10px 14px",
    cursor: "pointer",
    fontFamily: "inherit",
    color: "#555",
  },

  statGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4, minmax(0, 1fr))",
    gap: "12px",
    marginBottom: "18px",
  },

  statCard: {
    padding: "18px",
    background: "#fff",
    border: "1px solid #e8e8e8",
    borderRadius: "14px",
  },

  statLabel: {
    fontSize: "12px",
    fontWeight: "700",
    color: "#888",
  },

  statValue: {
    marginTop: "5px",
    fontSize: "25px",
    fontWeight: "800",
    color: "#222",
  },

  panel: {
    background: "#fff",
    border: "1px solid #e8e8e8",
    borderRadius: "18px",
    padding: "24px",
    boxShadow:
      "0 3px 14px rgba(0, 0, 0, 0.035)",
  },

  sectionHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent:
      "space-between",
    gap: "16px",
    marginBottom: "18px",
  },

  sectionTitle: {
    fontSize: "18px",
    fontWeight: "800",
    color: "#222",
  },

  sectionHint: {
    marginTop: "6px",
    fontSize: "13px",
    color: "#888",
  },

  tableWrapper: {
    width: "100%",
    overflowX: "auto",
    border:
      "1px solid #e8e8e8",
    borderRadius: "12px",
  },

  table: {
    width: "100%",
    minWidth: "760px",
    borderCollapse: "collapse",
  },

  th: {
    padding: "12px 14px",
    background: "#f7f7f7",
    borderBottom:
      "1px solid #e5e5e5",
    borderRight:
      "1px solid #ececec",
    fontSize: "13px",
    fontWeight: "800",
    color: "#555",
    textAlign: "center",
  },

  nameColumn: {
    width: "180px",
    textAlign: "left",
  },

  td: {
    padding: "13px 14px",
    borderBottom:
      "1px solid #eeeeee",
    borderRight:
      "1px solid #eeeeee",
    textAlign: "center",
    verticalAlign: "middle",
  },

  studentCell: {
    textAlign: "left",
  },

  studentName: {
    fontSize: "15px",
    fontWeight: "800",
    color: "#222",
  },

  studentMeta: {
    marginTop: "3px",
    fontSize: "11px",
    color: "#aaa",
  },

  score: {
    fontSize: "17px",
    fontWeight: "800",
    color: "#222",
  },

  pendingScore: {
    fontSize: "17px",
    fontWeight: "700",
    color: "#bbb",
  },

  statusText: {
    marginTop: "4px",
    fontSize: "10px",
    color: "#999",
  },

  emptyState: {
    padding: "40px 16px",
    textAlign: "center",
    color: "#888",
    background: "#fafafa",
    borderRadius: "12px",
  },

  errorState: {
    padding: "16px",
    color: "#9c3b3b",
    background: "#fff5f5",
    borderRadius: "10px",
  },
};