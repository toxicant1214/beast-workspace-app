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

  const [draftScores, setDraftScores] =
    useState({});

  const [saveStates, setSaveStates] =
    useState({});

  const [
    exemptionRequests,
    setExemptionRequests,
  ] = useState({});

  const [
    exemptionModal,
    setExemptionModal,
  ] = useState(null);

  const [
    exemptionReason,
    setExemptionReason,
  ] = useState("");

  const [
    exemptionError,
    setExemptionError,
  ] = useState("");

  const [
    submittingExemption,
    setSubmittingExemption,
  ] = useState(false);

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
          setExemptionRequests({});
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


        const subjectIds =
          (subjectRows || []).map(
            (row) => row.id
          );


        let requestRows = [];


        if (subjectIds.length > 0) {
          const {
            data,
            error,
          } = await supabase
            .from(
              "score_exemption_requests"
            )
            .select(`
              id,
              exam_subject_id,
              reason,
              status,
              requested_by,
              requested_at,
              reviewed_by,
              reviewed_at,
              review_note,
              created_at,
              updated_at
            `)
            .in(
              "exam_subject_id",
              subjectIds
            )
            .order(
              "requested_at",
              {
                ascending: false,
              }
            );


          if (error) {
            throw error;
          }


          requestRows =
            data || [];
        }


        const requestsBySubject = {};


        for (
          const request
          of requestRows
        ) {
          if (
            !requestsBySubject[
              request.exam_subject_id
            ]
          ) {
            requestsBySubject[
              request.exam_subject_id
            ] = [];
          }


          requestsBySubject[
            request.exam_subject_id
          ].push(request);
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

        setExemptionRequests(
          requestsBySubject
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
      return false;
    }


    /*
     * 免考申請中或已核准時，
     * 不允許直接用成績覆蓋。
     */
    if (
      subjectRow.status ===
        "EXEMPT_PENDING" ||
      subjectRow.status ===
        "EXEMPT_APPROVED"
    ) {
      return false;
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

        return false;
      }


      nextScore = numberValue;
      nextStatus = "SCORED";
    }


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
      return true;
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


      return true;
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


      return false;
    }
  }


  function handleScoreChange(
    subjectRow,
    value
  ) {
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


    setSaveStates(
      (current) => ({
        ...current,
        [subjectRow.id]: "",
      })
    );
  }


  /*
   * Enter：
   *
   * 同一位學生逐科往右。
   * 最後一科完成後，
   * 才前往下一位學生第一科。
   */
  function focusNextScore(
    studentIndex,
    subject
  ) {
    const currentSubjectIndex =
      subjects.indexOf(subject);


    if (
      currentSubjectIndex >= 0 &&
      currentSubjectIndex <
        subjects.length - 1
    ) {
      const nextSubject =
        subjects[
          currentSubjectIndex + 1
        ];


      const nextSubjectRow =
        students[
          studentIndex
        ]?.subjects?.[
          nextSubject
        ];


      if (nextSubjectRow?.id) {
        window.setTimeout(() => {
          const nextInput =
            inputRefs.current[
              nextSubjectRow.id
            ];


          if (
            nextInput &&
            !nextInput.disabled
          ) {
            nextInput.focus();
            nextInput.select();
          }
        }, 0);


        return;
      }
    }


    const nextStudent =
      students[
        studentIndex + 1
      ];


    if (!nextStudent) {
      return;
    }


    const firstSubject =
      subjects[0];


    const nextSubjectRow =
      nextStudent.subjects?.[
        firstSubject
      ];


    if (!nextSubjectRow?.id) {
      return;
    }


    window.setTimeout(() => {
      const nextInput =
        inputRefs.current[
          nextSubjectRow.id
        ];


      if (
        nextInput &&
        !nextInput.disabled
      ) {
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


    const saved =
      await saveScore(
        subjectRow
      );


    if (!saved) {
      return;
    }


    focusNextScore(
      studentIndex,
      subject
    );
  }


  /*
   * 新增免考申請。
   */
  function openExemptionModal({
    student,
    subject,
    subjectRow,
  }) {
    setExemptionModal({
      mode: "create",
      student,
      subject,
      subjectRow,
      request: null,
    });

    setExemptionReason("");
    setExemptionError("");
  }


  /*
   * 修改尚未審核的免考申請。
   */
  function openEditExemptionModal({
    student,
    subject,
    subjectRow,
    request,
  }) {
    if (!request) {
      return;
    }


    setExemptionModal({
      mode: "edit",
      student,
      subject,
      subjectRow,
      request,
    });


    setExemptionReason(
      request.reason || ""
    );

    setExemptionError("");
  }


  function closeExemptionModal() {
    if (submittingExemption) {
      return;
    }

    setExemptionModal(null);
    setExemptionReason("");
    setExemptionError("");
  }


  /*
   * 新增免考申請。
   */
  async function submitExemption() {
    if (
      !exemptionModal?.subjectRow?.id
    ) {
      return;
    }


    const reason =
      exemptionReason.trim();


    if (!reason) {
      setExemptionError(
        "請填寫免考原因。"
      );

      return;
    }


    const subjectRow =
      exemptionModal.subjectRow;


    try {
      setSubmittingExemption(
        true
      );

      setExemptionError("");


      const existingRequests =
        exemptionRequests[
          subjectRow.id
        ] || [];


      const existingPending =
        existingRequests.find(
          (request) =>
            request.status ===
            "PENDING"
        );


      if (existingPending) {
        throw new Error(
          "這一科已經有免考申請正在審核。"
        );
      }


      const {
        data: authData,
      } =
        await supabase.auth.getUser();


      const userId =
        authData?.user?.id ||
        null;


      /*
       * 新增新的歷史申請。
       * 曾撤回或曾退回的舊申請不會被刪除。
       */
      const {
        data: requestData,
        error: requestError,
      } = await supabase
        .from(
          "score_exemption_requests"
        )
        .insert({
          exam_subject_id:
            subjectRow.id,

          reason,

          status: "PENDING",

          requested_by:
            userId,
        })
        .select(`
          id,
          exam_subject_id,
          reason,
          status,
          requested_by,
          requested_at,
          reviewed_by,
          reviewed_at,
          review_note,
          created_at,
          updated_at
        `)
        .single();


      if (requestError) {
        throw requestError;
      }


      const {
        error: subjectError,
      } = await supabase
        .from(
          "score_exam_subjects"
        )
        .update({
          score: null,

          status:
            "EXEMPT_PENDING",

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          subjectRow.id
        );


      if (subjectError) {
        /*
         * 第二步失敗時，
         * 把剛新增的申請刪掉，
         * 避免留下半套狀態。
         *
         * 這只針對「尚未正式建立成功」
         * 的新申請，不是使用者撤回。
         */
        await supabase
          .from(
            "score_exemption_requests"
          )
          .delete()
          .eq(
            "id",
            requestData.id
          );

        throw subjectError;
      }


      updateLocalSubject(
        subjectRow.id,
        null,
        "EXEMPT_PENDING"
      );


      setDraftScores(
        (current) => ({
          ...current,
          [subjectRow.id]: "",
        })
      );


      setExemptionRequests(
        (current) => ({
          ...current,

          [subjectRow.id]: [
            requestData,
            ...(
              current[
                subjectRow.id
              ] || []
            ),
          ],
        })
      );


      setExemptionModal(null);
      setExemptionReason("");
      setExemptionError("");
    } catch (error) {
      console.error(
        "送出免考申請失敗：",
        error
      );


      setExemptionError(
        error?.message ||
          "免考申請送出失敗。"
      );
    } finally {
      setSubmittingExemption(
        false
      );
    }
  }


  /*
   * 修改原本尚未審核的申請。
   *
   * 不新增第二筆，
   * 直接修改目前 PENDING 的申請。
   */
  async function updateExemption() {
    if (
      exemptionModal?.mode !==
        "edit" ||
      !exemptionModal?.request?.id
    ) {
      return;
    }


    const reason =
      exemptionReason.trim();


    if (!reason) {
      setExemptionError(
        "請填寫免考原因。"
      );

      return;
    }


    try {
      setSubmittingExemption(
        true
      );

      setExemptionError("");


      const request =
        exemptionModal.request;


      const {
        data,
        error,
      } = await supabase
        .from(
          "score_exemption_requests"
        )
        .update({
          reason,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          request.id
        )
        .eq(
          "status",
          "PENDING"
        )
        .select(`
          id,
          exam_subject_id,
          reason,
          status,
          requested_by,
          requested_at,
          reviewed_by,
          reviewed_at,
          review_note,
          created_at,
          updated_at
        `)
        .single();


      if (error) {
        throw error;
      }


      setExemptionRequests(
        (current) => ({
          ...current,

          [data.exam_subject_id]: (
            current[
              data.exam_subject_id
            ] || []
          ).map(
            (item) =>
              item.id === data.id
                ? data
                : item
          ),
        })
      );


      setExemptionModal(null);
      setExemptionReason("");
      setExemptionError("");
    } catch (error) {
      console.error(
        "修改免考申請失敗：",
        error
      );


      setExemptionError(
        error?.message ||
          "修改免考申請失敗。"
      );
    } finally {
      setSubmittingExemption(
        false
      );
    }
  }


  /*
   * 撤回申請。
   *
   * 注意：
   * 不 DELETE。
   *
   * 申請改成 WITHDRAWN，
   * 原始原因仍永久存在。
   */
  async function withdrawExemption({
    subjectRow,
    request,
  }) {
    if (
      !subjectRow?.id ||
      !request?.id
    ) {
      return;
    }


    const confirmed =
      window.confirm(
        "確定要撤回這筆免考申請嗎？\n\n撤回後這一科會恢復為待登記，原本的申請原因仍會保留在歷史紀錄中。"
      );


    if (!confirmed) {
      return;
    }


    try {
      /*
       * 先把申請標記成已撤回。
       */
      const {
        data: withdrawnRequest,
        error: requestError,
      } = await supabase
        .from(
          "score_exemption_requests"
        )
        .update({
          status: "WITHDRAWN",
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          request.id
        )
        .eq(
          "status",
          "PENDING"
        )
        .select(`
          id,
          exam_subject_id,
          reason,
          status,
          requested_by,
          requested_at,
          reviewed_by,
          reviewed_at,
          review_note,
          created_at,
          updated_at
        `)
        .single();


      if (requestError) {
        throw requestError;
      }


      /*
       * 科目恢復待登記。
       */
      const {
        error: subjectError,
      } = await supabase
        .from(
          "score_exam_subjects"
        )
        .update({
          score: null,
          status: "PENDING",
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          subjectRow.id
        );


      if (subjectError) {
        /*
         * 如果第二步失敗，
         * 嘗試把申請恢復為 PENDING。
         */
        await supabase
          .from(
            "score_exemption_requests"
          )
          .update({
            status: "PENDING",
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            request.id
          );

        throw subjectError;
      }


      updateLocalSubject(
        subjectRow.id,
        null,
        "PENDING"
      );


      setDraftScores(
        (current) => ({
          ...current,
          [subjectRow.id]: "",
        })
      );


      /*
       * 本機資料也保留這筆撤回紀錄。
       */
      setExemptionRequests(
        (current) => ({
          ...current,

          [subjectRow.id]: (
            current[
              subjectRow.id
            ] || []
          ).map(
            (item) =>
              item.id ===
              withdrawnRequest.id
                ? withdrawnRequest
                : item
          ),
        })
      );
    } catch (error) {
      console.error(
        "撤回免考申請失敗：",
        error
      );


      window.alert(
        error?.message ||
          "撤回免考申請失敗，請稍後再試。"
      );
    }
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


          /*
           * 只有：
           * SCORED
           * EXEMPT_APPROVED
           *
           * 才算完成。
           */
          if (
            row &&
            (
              row.status ===
                "SCORED" ||
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
    <>
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
              <div
                style={
                  styles.sectionTitle
                }
              >
                成績表
              </div>

              <div
                style={
                  styles.sectionHint
                }
              >
                直接輸入成績即自動儲存；無成績時可提出免考申請。
              </div>
            </div>
          </div>


          {loading && (
            <div
              style={styles.emptyState}
            >
              正在讀取成績表…
            </div>
          )}


          {!loading &&
            errorMessage && (
              <div
                style={
                  styles.errorState
                }
              >
                {errorMessage}
              </div>
            )}


          {!loading &&
            !errorMessage &&
            students.length === 0 && (
              <div
                style={
                  styles.emptyState
                }
              >
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
                <table
                  style={styles.table}
                >
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


                              const requests =
                                exemptionRequests[
                                  row.id
                                ] || [];


                              /*
                               * 因為資料依 requested_at
                               * DESC 載入，
                               * 第一筆就是最近一次申請。
                               */
                              const latestRequest =
                                requests[0] ||
                                null;


                              const isPending =
                                row.status ===
                                "EXEMPT_PENDING";


                              const isApproved =
                                row.status ===
                                "EXEMPT_APPROVED";


                              return (
                                <td
                                  key={
                                    subject
                                  }
                                  style={
                                    styles.td
                                  }
                                >
                                  {isPending ? (
                                    <div
                                      style={
                                        styles.exemptionBox
                                      }
                                    >
                                      <div
                                        style={
                                          styles.pendingBadge
                                        }
                                      >
                                        免考審核中
                                      </div>


                                      {latestRequest?.reason && (
                                        <div
                                          style={
                                            styles.reasonText
                                          }
                                          title={
                                            latestRequest.reason
                                          }
                                        >
                                          {
                                            latestRequest.reason
                                          }
                                        </div>
                                      )}


                                      {latestRequest?.status ===
                                        "PENDING" && (
                                        <div
                                          style={
                                            styles.requestActions
                                          }
                                        >
                                          <button
                                            type="button"
                                            onClick={() =>
                                              openEditExemptionModal({
                                                student,
                                                subject,
                                                subjectRow:
                                                  row,
                                                request:
                                                  latestRequest,
                                              })
                                            }
                                            style={
                                              styles.requestActionButton
                                            }
                                          >
                                            修改
                                          </button>

                                          <span
                                            style={
                                              styles.actionDivider
                                            }
                                          >
                                            |
                                          </span>

                                          <button
                                            type="button"
                                            onClick={() =>
                                              withdrawExemption({
                                                subjectRow:
                                                  row,
                                                request:
                                                  latestRequest,
                                              })
                                            }
                                            style={{
                                              ...styles.requestActionButton,
                                              ...styles.withdrawButton,
                                            }}
                                          >
                                            撤回
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ) : isApproved ? (
                                    <div
                                      style={
                                        styles.exemptionBox
                                      }
                                    >
                                      <div
                                        style={
                                          styles.approvedBadge
                                        }
                                      >
                                        免考
                                      </div>

                                      {latestRequest?.reason && (
                                        <div
                                          style={
                                            styles.reasonText
                                          }
                                          title={
                                            latestRequest.reason
                                          }
                                        >
                                          {
                                            latestRequest.reason
                                          }
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <>
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


                                      {row.status !==
                                        "SCORED" && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openExemptionModal({
                                              student,
                                              subject,
                                              subjectRow:
                                                row,
                                            })
                                          }
                                          style={
                                            styles.exemptionButton
                                          }
                                        >
                                          申請免考
                                        </button>
                                      )}
                                    </>
                                  )}
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


      {exemptionModal && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <div
              style={
                styles.modalHeader
              }
            >
              <div>
                <div
                  style={
                    styles.modalEyebrow
                  }
                >
                  {exemptionModal?.mode ===
                  "edit"
                    ? "修改免考申請"
                    : "免考申請"}
                </div>

                <div
                  style={
                    styles.modalTitle
                  }
                >
                  {
                    exemptionModal
                      .student
                      .student_name_snapshot
                  }
                  {"・"}
                  {
                    SUBJECT_LABELS[
                      exemptionModal
                        .subject
                    ]
                  }
                </div>
              </div>


              <button
                type="button"
                onClick={
                  closeExemptionModal
                }
                disabled={
                  submittingExemption
                }
                style={
                  styles.closeButton
                }
              >
                ×
              </button>
            </div>


            <div
              style={
                styles.modalHint
              }
            >
              {exemptionModal?.mode ===
              "edit"
                ? "此申請尚未審核，可以修改免考原因。主管完成審核後將不能再修改。"
                : "請填寫本次免考原因。送出後將進入主管審核，申請內容會保留於歷史紀錄。"}
            </div>


            <label
              style={
                styles.reasonField
              }
            >
              <span
                style={
                  styles.reasonLabel
                }
              >
                免考原因
              </span>

              <textarea
                value={
                  exemptionReason
                }
                onChange={(
                  event
                ) => {
                  setExemptionReason(
                    event.target.value
                  );

                  setExemptionError(
                    ""
                  );
                }}
                placeholder="請輸入免考原因…"
                rows={5}
                autoFocus
                style={
                  styles.textarea
                }
              />
            </label>


            {exemptionError && (
              <div
                style={
                  styles.modalError
                }
              >
                {exemptionError}
              </div>
            )}


            <div
              style={
                styles.modalActions
              }
            >
              <button
                type="button"
                onClick={
                  closeExemptionModal
                }
                disabled={
                  submittingExemption
                }
                style={
                  styles.cancelButton
                }
              >
                取消
              </button>


              <button
                type="button"
                onClick={
                  exemptionModal?.mode ===
                  "edit"
                    ? updateExemption
                    : submitExemption
                }
                disabled={
                  submittingExemption
                }
                style={{
                  ...styles.submitButton,

                  ...(submittingExemption
                    ? styles.submitButtonDisabled
                    : {}),
                }}
              >
                {submittingExemption
                  ? "處理中…"
                  : exemptionModal?.mode ===
                      "edit"
                    ? "儲存修改"
                    : "送出免考申請"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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

  exemptionButton: {
    marginTop: "2px",
    padding: "3px 8px",
    border: 0,
    background: "transparent",
    color: "#777",
    fontSize: "11px",
    fontWeight: "700",
    fontFamily: "inherit",
    cursor: "pointer",
    textDecoration: "underline",
    textUnderlineOffset: "3px",
  },

  exemptionBox: {
    minHeight: "58px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "5px",
  },

  pendingBadge: {
    display: "inline-flex",
    padding: "5px 8px",
    borderRadius: "999px",
    background: "#fff5dc",
    color: "#8a6820",
    fontSize: "11px",
    fontWeight: "800",
  },

  approvedBadge: {
    display: "inline-flex",
    padding: "5px 8px",
    borderRadius: "999px",
    background: "#eef7ef",
    color: "#48744e",
    fontSize: "11px",
    fontWeight: "800",
  },

  reasonText: {
    maxWidth: "145px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "10px",
    color: "#999",
  },

  requestActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    marginTop: "2px",
  },

  requestActionButton: {
    padding: 0,
    border: 0,
    background: "transparent",
    color: "#666",
    fontSize: "10px",
    fontWeight: "700",
    fontFamily: "inherit",
    cursor: "pointer",
  },

  actionDivider: {
    color: "#ccc",
    fontSize: "10px",
  },

  withdrawButton: {
    color: "#a45b5b",
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

  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    background:
      "rgba(0, 0, 0, 0.38)",
  },

  modal: {
    width: "100%",
    maxWidth: "500px",
    background: "#fff",
    borderRadius: "18px",
    padding: "24px",
    boxShadow:
      "0 20px 60px rgba(0, 0, 0, 0.18)",
  },

  modalHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "flex-start",
    gap: "20px",
  },

  modalEyebrow: {
    fontSize: "11px",
    fontWeight: "800",
    letterSpacing: "0.12em",
    color: "#999",
    marginBottom: "6px",
  },

  modalTitle: {
    fontSize: "21px",
    fontWeight: "800",
    color: "#222",
  },

  closeButton: {
    width: "34px",
    height: "34px",
    border: 0,
    borderRadius: "50%",
    background: "#f3f3f3",
    color: "#666",
    fontSize: "20px",
    lineHeight: 1,
    cursor: "pointer",
  },

  modalHint: {
    marginTop: "16px",
    padding: "12px 14px",
    borderRadius: "10px",
    background: "#f7f7f7",
    color: "#666",
    fontSize: "13px",
    lineHeight: 1.6,
  },

  reasonField: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    marginTop: "18px",
  },

  reasonLabel: {
    fontSize: "13px",
    fontWeight: "800",
    color: "#444",
  },

  textarea: {
    width: "100%",
    boxSizing: "border-box",
    resize: "vertical",
    minHeight: "120px",
    padding: "12px",
    border: "1px solid #ddd",
    borderRadius: "10px",
    fontFamily: "inherit",
    fontSize: "14px",
    lineHeight: 1.6,
    outline: "none",
  },

  modalError: {
    marginTop: "10px",
    padding: "10px 12px",
    borderRadius: "8px",
    background: "#fff5f5",
    color: "#a44545",
    fontSize: "12px",
  },

  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "20px",
  },

  cancelButton: {
    minHeight: "42px",
    padding: "0 16px",
    border: "1px solid #ddd",
    borderRadius: "9px",
    background: "#fff",
    color: "#555",
    fontFamily: "inherit",
    fontWeight: "700",
    cursor: "pointer",
  },

  submitButton: {
    minHeight: "42px",
    padding: "0 18px",
    border: 0,
    borderRadius: "9px",
    background: "#222",
    color: "#fff",
    fontFamily: "inherit",
    fontWeight: "800",
    cursor: "pointer",
  },

  submitButtonDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
};