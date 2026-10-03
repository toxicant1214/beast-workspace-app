import {
  useEffect,
  useMemo,
  useRef,
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


export default function ScoreClassEntryPage({
  examClassId,
  examInfo,
  classInfo,
  onBack,
}) {
  const [students, setStudents] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  /*
   * 輸入中的值獨立保存。
   * key = examSubjectId
   */
  const [draftScores, setDraftScores] =
    useState({});

  /*
   * saving / saved / error
   */
  const [saveStates, setSaveStates] =
    useState({});

  const inputRefs = useRef({});


  const subjects = useMemo(() => {
    if (
      examInfo?.examType === "OFFICIAL"
    ) {
      return OFFICIAL_SUBJECTS;
    }

    return MOCK_SUBJECTS;
  }, [examInfo?.examType]);


  useEffect(() => {
    let cancelled = false;


    async function loadScoreData() {
      if (!examClassId) {
        return;
      }

      try {
        setLoading(true);
        setErrorMessage("");


        const {
          data: studentRows,
          error: studentError,
        } = await supabase
          .from("score_exam_students")
          .select(`
            id,
            student_id,
            student_name_snapshot,
            grade_snapshot,
            class_name_snapshot,
            is_active,
            created_at
          `)
          .eq(
            "exam_class_id",
            examClassId
          )
          .eq("is_active", true)
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
          setDraftScores({});
          return;
        }


        const examStudentIds =
          safeStudentRows.map(
            (student) => student.id
          );


        const {
          data: subjectRows,
          error: subjectError,
        } = await supabase
          .from("score_exam_subjects")
          .select(`
            id,
            exam_student_id,
            subject,
            score,
            status,
            created_at,
            updated_at
          `)
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


        const subjectsByStudent = {};
        const initialDrafts = {};


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


          initialDrafts[
            subjectRow.id
          ] =
            subjectRow.score === null ||
            subjectRow.score === undefined
              ? ""
              : String(
                  subjectRow.score
                );
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

        setDraftScores(
          initialDrafts
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
  }, [examClassId]);


  /*
   * 更新本機 students。
   * 儲存成功後立即反映完成數。
   */
  function updateLocalSubject(
    subjectId,
    nextScore,
    nextStatus
  ) {
    setStudents(
      (currentStudents) =>
        currentStudents.map(
          (student) => ({
            ...student,

            subjects:
              Object.fromEntries(
                Object.entries(
                  student.subjects || {}
                ).map(
                  ([
                    subjectKey,
                    subjectRow,
                  ]) => {
                    if (
                      subjectRow.id !==
                      subjectId
                    ) {
                      return [
                        subjectKey,
                        subjectRow,
                      ];
                    }

                    return [
                      subjectKey,
                      {
                        ...subjectRow,
                        score: nextScore,
                        status:
                          nextStatus,
                      },
                    ];
                  }
                )
              ),
          })
        )
    );
  }


  async function saveScore(
    subjectRow
  ) {
    if (!subjectRow?.id) {
      return;
    }


    const rawValue =
      String(
        draftScores[
          subjectRow.id
        ] ?? ""
      ).trim();


    let nextScore = null;
    let nextStatus = "PENDING";


    if (rawValue !== "") {
      const numberValue =
        Number(rawValue);


      if (
        !Number.isFinite(
          numberValue
        ) ||
        numberValue < 0 ||
        numberValue > 100
      ) {
        setSaveStates(
          (current) => ({
            ...current,
            [subjectRow.id]:
              "error",
          })
        );

        return;
      }


      nextScore = numberValue;
      nextStatus = "SCORED";
    }


    /*
     * 沒有變更就不打 Supabase。
     */
    const currentScore =
      subjectRow.score === null ||
      subjectRow.score === undefined
        ? null
        : Number(
            subjectRow.score
          );


    if (
      currentScore === nextScore &&
      subjectRow.status ===
        nextStatus
    ) {
      setSaveStates(
        (current) => ({
          ...current,
          [subjectRow.id]:
            "saved",
        })
      );

      return;
    }


    try {
      setSaveStates(
        (current) => ({
          ...current,
          [subjectRow.id]:
            "saving",
        })
      );


      const {
        error,
      } = await supabase
        .from(
          "score_exam_subjects"
        )
        .update({
          score: nextScore,
          status: nextStatus,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          subjectRow.id
        );


      if (error) {
        throw error;
      }


      updateLocalSubject(
        subjectRow.id,
        nextScore,
        nextStatus
      );


      setSaveStates(
        (current) => ({
          ...current,
          [subjectRow.id]:
            "saved",
        })
      );


      /*
       * 「已儲存」提示只短暫存在。
       */
      window.setTimeout(() => {
        setSaveStates(
          (current) => {
            if (
              current[
                subjectRow.id
              ] !== "saved"
            ) {
              return current;
            }

            return {
              ...current,
              [subjectRow.id]:
                "",
            };
          }
        );
      }, 1200);
    } catch (error) {
      console.error(
        "儲存成績失敗：",
        error
      );


      setSaveStates(
        (current) => ({
          ...current,
          [subjectRow.id]:
            "error",
        })
      );
    }
  }


  function handleScoreChange(
    subjectRow,
    value
  ) {
    /*
     * 只接受：
     * 空白、整數、小數。
     *
     * 最終 0～100 會在 save 時驗證。
     */
    if (
      value !== "" &&
      !/^\d{0,3}(\.\d{0,2})?$/.test(
        value
      )
    ) {
      return;
    }


    setDraftScores(
      (current) => ({
        ...current,
        [subjectRow.id]:
          value,
      })
    );


    /*
     * 使用者重新修改時，
     * 清掉上一個錯誤提示。
     */
    setSaveStates(
      (current) => ({
        ...current,
        [subjectRow.id]: "",
      })
    );
  }


  function focusNextStudent(
    studentIndex,
    subject
  ) {
    const nextStudent =
      students[
        studentIndex + 1
      ];


    if (!nextStudent) {
      return;
    }


    const nextSubjectRow =
      nextStudent.subjects?.[
        subject
      ];


    if (!nextSubjectRow?.id) {
      return;
    }


    window.setTimeout(() => {
      const nextInput =
        inputRefs.current[
          nextSubjectRow.id
        ];

      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      }
    }, 0);
  }


  async function handleKeyDown(
    event,
    subjectRow,
    studentIndex,
    subject
  ) {
    if (event.key !== "Enter") {
      return;
    }


    event.preventDefault();

    await saveScore(
      subjectRow
    );

    focusNextStudent(
      studentIndex,
      subject
    );
  }


  const completion =
    useMemo(() => {
      let total = 0;
      let completed = 0;


      for (
        const student
        of students
      ) {
        for (
          const subject
          of subjects
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
              直接輸入成績，離開欄位即自動儲存；按 Enter 可往下一位學生。
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
                    (
                      student,
                      studentIndex
                    ) => (
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


                            if (!row) {
                              return (
                                <td
                                  key={
                                    subject
                                  }
                                  style={
                                    styles.td
                                  }
                                >
                                  —
                                </td>
                              );
                            }


                            const saveState =
                              saveStates[
                                row.id
                              ] || "";


                            return (
                              <td
                                key={
                                  subject
                                }
                                style={
                                  styles.td
                                }
                              >
                                <div
                                  style={
                                    styles.inputWrap
                                  }
                                >
                                  <input
                                    ref={(
                                      element
                                    ) => {
                                      if (
                                        element
                                      ) {
                                        inputRefs.current[
                                          row.id
                                        ] =
                                          element;
                                      }
                                    }}
                                    type="text"
                                    inputMode="decimal"
                                    value={
                                      draftScores[
                                        row.id
                                      ] ?? ""
                                    }
                                    placeholder="—"
                                    onChange={(
                                      event
                                    ) =>
                                      handleScoreChange(
                                        row,
                                        event
                                          .target
                                          .value
                                      )
                                    }
                                    onBlur={() =>
                                      saveScore(
                                        row
                                      )
                                    }
                                    onKeyDown={(
                                      event
                                    ) =>
                                      handleKeyDown(
                                        event,
                                        row,
                                        studentIndex,
                                        subject
                                      )
                                    }
                                    style={{
                                      ...styles.scoreInput,

                                      ...(saveState ===
                                      "error"
                                        ? styles.scoreInputError
                                        : {}),
                                    }}
                                  />
                                </div>


                                <div
                                  style={{
                                    ...styles.saveState,

                                    ...(saveState ===
                                    "error"
                                      ? styles.saveStateError
                                      : {}),
                                  }}
                                >
                                  {saveState ===
                                    "saving" &&
                                    "儲存中…"}


                                  {saveState ===
                                    "saved" &&
                                    "已儲存"}


                                  {saveState ===
                                    "error" &&
                                    "請輸入 0–100"}
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
    padding: "10px 14px",
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

  inputWrap: {
    display: "flex",
    justifyContent: "center",
  },

  scoreInput: {
    width: "82px",
    height: "38px",
    boxSizing: "border-box",
    border: "1px solid #ddd",
    borderRadius: "8px",
    background: "#fff",
    textAlign: "center",
    fontFamily: "inherit",
    fontSize: "16px",
    fontWeight: "700",
    color: "#222",
    outline: "none",
  },

  scoreInputError: {
    border:
      "1px solid #c85b5b",
    background: "#fff7f7",
  },

  saveState: {
    height: "15px",
    marginTop: "3px",
    fontSize: "10px",
    color: "#999",
  },

  saveStateError: {
    color: "#b54b4b",
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