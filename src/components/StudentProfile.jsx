import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import "./StudentProfile.css";

function formatDate(dateString) {
  if (!dateString) return "尚未設定";

  const [year, month, day] = dateString.split("-");

  if (!year || !month || !day) {
    return dateString;
  }

  return `${year}/${month}/${day}`;
}

function formatTime(timeString) {
  if (!timeString) return "";

  return timeString.slice(0, 5);
}

const WEEKDAY_LABELS = {
  1: "星期一",
  2: "星期二",
  3: "星期三",
  4: "星期四",
  5: "星期五",
  6: "星期六",
  7: "星期日",
};

function StudentProfile({ student, onBack, onEdit }) {
  const [classHistory, setClassHistory] = useState([]);
  const [isLoadingClasses, setIsLoadingClasses] =
    useState(true);

  const [
    englishClassRecords,
    setEnglishClassRecords,
  ] = useState([]);

  const [
    isLoadingEnglishClasses,
    setIsLoadingEnglishClasses,
  ] = useState(true);

  const [
    talentClassRecords,
    setTalentClassRecords,
  ] = useState([]);

  const [
    isLoadingTalentClasses,
    setIsLoadingTalentClasses,
  ] = useState(true);

  const statusLabels = {
    ACTIVE: "在學",
    PAUSED: "暫停",
    WITHDRAWN: "退班",
    GRADUATED: "畢業",
  };

  const gradeLabel =
    student.current_grade || "年級未設定";

  const statusLabel =
    statusLabels[student.student_status] ||
    student.student_status ||
    "狀態未設定";

  useEffect(() => {
    if (student?.id) {
      loadClassHistory();
      loadEnglishClasses();
      loadTalentClasses();
    }
  }, [student?.id]);

  async function loadClassHistory() {
    try {
      setIsLoadingClasses(true);

      const { data, error } = await supabase
        .from("class_students")
        .select(`
          id,
          joined_at,
          left_at,
          status,
          classes (
            id,
            class_name,
            academic_year,
            term,
            start_date,
            end_date,
            is_active
          )
        `)
        .eq("student_id", student.id)
        .order("joined_at", {
          ascending: false,
        });

      if (error) {
        throw error;
      }

      setClassHistory(data || []);
    } catch (error) {
      console.error(
        "讀取學生班級歷程失敗：",
        error
      );

      window.alert(
        `讀取學生班級歷程失敗：${error.message}`
      );

      setClassHistory([]);
    } finally {
      setIsLoadingClasses(false);
    }
  }

  async function loadEnglishClasses() {
    try {
      setIsLoadingEnglishClasses(true);

      const { data, error } = await supabase
        .from("english_class_students")
        .select(`
          id,
          joined_at,
          left_at,
          status,
          english_classes (
            id,
            class_name,
            academic_year,
            term,
            start_date,
            end_date,
            teacher_name,
            is_active,
            english_class_schedules (
              id,
              weekday,
              start_time,
              end_time,
              sort_order
            )
          )
        `)
        .eq("student_id", student.id)
        .order("joined_at", {
          ascending: false,
        });

      if (error) {
        throw error;
      }

      const normalizedData = (data || []).map(
        (item) => ({
          ...item,

          english_classes:
            item.english_classes
              ? {
                  ...item.english_classes,

                  english_class_schedules:
                    item.english_classes
                      .english_class_schedules
                      ?.slice()
                      .sort(
                        (a, b) =>
                          (a.sort_order ?? 0) -
                          (b.sort_order ?? 0)
                      ) || [],
                }
              : null,
        })
      );

      setEnglishClassRecords(normalizedData);
    } catch (error) {
      console.error(
        "讀取學生美語班資料失敗：",
        error
      );

      window.alert(
        `讀取學生美語班資料失敗：${error.message}`
      );

      setEnglishClassRecords([]);
    } finally {
      setIsLoadingEnglishClasses(false);
    }
  }

  async function loadTalentClasses() {
    try {
      setIsLoadingTalentClasses(true);

      const { data, error } = await supabase
        .from("course_class_students")
        .select(`
          id,
          joined_at,
          left_at,
          is_active,
          note,
          course_classes (
            id,
            course_id,
            class_name,
            weekday,
            start_time,
            end_time,
            first_lesson_date,
            total_sessions,
            is_active,
            courses (
              id,
              course_name,
              is_active
            )
          )
        `)
        .eq("student_id", student.id)
        .order("joined_at", {
          ascending: false,
        });

      if (error) {
        throw error;
      }

      setTalentClassRecords(data || []);
    } catch (error) {
      console.error(
        "讀取學生才藝班資料失敗：",
        error
      );

      window.alert(
        `讀取學生才藝班資料失敗：${error.message}`
      );

      setTalentClassRecords([]);
    } finally {
      setIsLoadingTalentClasses(false);
    }
  }

  function displayValue(value) {
    return value || "尚未設定";
  }

  const currentClassRecords = useMemo(
    () =>
      classHistory.filter(
        (item) => item.status === "ACTIVE"
      ),
    [classHistory]
  );

  const pastClassRecords = useMemo(
    () =>
      classHistory.filter(
        (item) => item.status !== "ACTIVE"
      ),
    [classHistory]
  );

  const currentEnglishClassRecords = useMemo(
    () =>
      englishClassRecords.filter(
        (item) => item.status === "ACTIVE"
      ),
    [englishClassRecords]
  );

  const currentTalentClassRecords = useMemo(
    () =>
      talentClassRecords.filter(
        (item) => item.is_active
      ),
    [talentClassRecords]
  );

  const timelineItems = useMemo(() => {
    const items = [];

    if (student.enrollment_date) {
      items.push({
        date: student.enrollment_date,
        title: "加入倍思",
        description:
          "建立學生資料並開始就讀。",
        type: "STUDENT",
      });
    }

    classHistory.forEach((item) => {
      const classItem = item.classes;

      if (!classItem) return;

      if (item.joined_at) {
        items.push({
          date: item.joined_at,
          title: `加入 ${classItem.class_name}`,
          description: [
            classItem.academic_year,
            classItem.term,
          ]
            .filter(Boolean)
            .join("・"),
          type: "CLASS_JOIN",
        });
      }

      if (
        item.status !== "ACTIVE" &&
        item.left_at
      ) {
        items.push({
          date: item.left_at,
          title: `退出 ${classItem.class_name}`,
          description: [
            classItem.academic_year,
            classItem.term,
          ]
            .filter(Boolean)
            .join("・"),
          type: "CLASS_LEFT",
        });
      }
    });

    englishClassRecords.forEach((item) => {
      const englishClass = item.english_classes;

      if (!englishClass) return;

      if (item.joined_at) {
        items.push({
          date: item.joined_at,
          title: `加入美語班 ${englishClass.class_name}`,
          description: [
            englishClass.academic_year,
            englishClass.term,
          ]
            .filter(Boolean)
            .join("・"),
          type: "ENGLISH_JOIN",
        });
      }

      if (
        item.status !== "ACTIVE" &&
        item.left_at
      ) {
        items.push({
          date: item.left_at,
          title: `退出美語班 ${englishClass.class_name}`,
          description: [
            englishClass.academic_year,
            englishClass.term,
          ]
            .filter(Boolean)
            .join("・"),
          type: "ENGLISH_LEFT",
        });
      }
    });

    talentClassRecords.forEach((item) => {
      const talentClass = item.course_classes;

      if (!talentClass) return;

      const courseName =
        talentClass.courses?.course_name ||
        "才藝課程";

      const classDescription = [
        talentClass.class_name,
        WEEKDAY_LABELS[talentClass.weekday],
        talentClass.start_time &&
        talentClass.end_time
          ? `${formatTime(
              talentClass.start_time
            )}－${formatTime(
              talentClass.end_time
            )}`
          : null,
      ]
        .filter(Boolean)
        .join("・");

      if (item.joined_at) {
        items.push({
          date: item.joined_at,
          title: `加入才藝課程 ${courseName}`,
          description: classDescription,
          type: "TALENT_JOIN",
        });
      }

      if (
        !item.is_active &&
        item.left_at
      ) {
        items.push({
          date: item.left_at,
          title: `退出才藝課程 ${courseName}`,
          description: classDescription,
          type: "TALENT_LEFT",
        });
      }
    });

    return items.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;

      return b.date.localeCompare(a.date);
    });
  }, [
    student.enrollment_date,
    classHistory,
    englishClassRecords,
    talentClassRecords,
  ]);

  const isLoadingEnrollments =
    isLoadingClasses ||
    isLoadingEnglishClasses ||
    isLoadingTalentClasses;

  const hasCurrentEnrollments =
    currentClassRecords.length > 0 ||
    currentEnglishClassRecords.length > 0 ||
    currentTalentClassRecords.length > 0;

  return (
    <div className="studentProfile">
      <button
        type="button"
        className="studentProfile__backButton"
        onClick={onBack}
      >
        ← 返回學生列表
      </button>

      <header className="studentProfile__hero">
        <div className="studentProfile__heroMain">
          <p className="studentProfile__eyebrow">
            STUDENT PROFILE
          </p>

          <div className="studentProfile__nameRow">
            <h1>{student.chinese_name}</h1>

            {student.is_test && (
              <span className="studentProfile__testBadge">
                測試資料
              </span>
            )}
          </div>

          <p className="studentProfile__studentNo">
            {student.student_no ||
              "尚未建立學號"}

            {student.english_name
              ? `・${student.english_name}`
              : ""}
          </p>

          <div className="studentProfile__chips">
            <span className="studentProfile__chip studentProfile__chip--status">
              {statusLabel}
            </span>

            <span className="studentProfile__chip">
              {gradeLabel}
            </span>

            <span className="studentProfile__chip">
              {student.is_test
                ? "測試學生"
                : "正式學生"}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="studentProfile__editButton"
          onClick={() => onEdit(student)}
        >
          編輯資料
        </button>
      </header>

      <div className="studentProfile__overview">
        <div>
          <span>入班日期</span>

          <strong>
            {formatDate(
              student.enrollment_date
            )}
          </strong>
        </div>

        <div>
          <span>就讀學校</span>

          <strong>
            {displayValue(student.school)}
          </strong>
        </div>

        <div>
          <span>出生年月日</span>

          <strong>
            {formatDate(student.birthday)}
          </strong>
        </div>

        <div>
          <span>主要聯絡人</span>

          <strong>
            {displayValue(
              student.primary_parent_title
            )}
          </strong>
        </div>
      </div>

      <div className="studentProfile__grid">
        <section className="studentProfile__panel">
          <div className="studentProfile__sectionHeading">
            <p>BASIC INFORMATION</p>
            <h2>基本資料</h2>
          </div>

          <div className="studentProfile__detailList">
            <div>
              <span>中文姓名</span>

              <strong>
                {displayValue(
                  student.chinese_name
                )}
              </strong>
            </div>

            <div>
              <span>英文姓名</span>

              <strong>
                {displayValue(
                  student.english_name
                )}
              </strong>
            </div>

            <div>
              <span>出生年月日</span>

              <strong>
                {formatDate(
                  student.birthday
                )}
              </strong>
            </div>

            <div>
              <span>就讀學校</span>

              <strong>
                {displayValue(
                  student.school
                )}
              </strong>
            </div>

            <div>
              <span>目前年級</span>

              <strong>
                {displayValue(
                  student.current_grade
                )}
              </strong>
            </div>

            <div>
              <span>入班日期</span>

              <strong>
                {formatDate(
                  student.enrollment_date
                )}
              </strong>
            </div>
          </div>
        </section>

        <section className="studentProfile__panel">
          <div className="studentProfile__sectionHeading">
            <p>PARENT CONTACTS</p>
            <h2>家長資料</h2>
          </div>

          <div className="studentProfile__detailList">
            <div>
              <span>主要聯絡人</span>

              <strong>
                {displayValue(
                  student.primary_parent_title
                )}
              </strong>
            </div>

            <div>
              <span>主要聯絡電話</span>

              <strong>
                {displayValue(
                  student.primary_parent_phone
                )}
              </strong>
            </div>

            <div>
              <span>第二聯絡人</span>

              <strong>
                {displayValue(
                  student.secondary_parent_title
                )}
              </strong>
            </div>

            <div>
              <span>第二聯絡電話</span>

              <strong>
                {displayValue(
                  student.secondary_parent_phone
                )}
              </strong>
            </div>
          </div>
        </section>

        <section className="studentProfile__panel studentProfile__panel--wide">
          <div className="studentProfile__sectionHeading">
            <p>ENROLLMENTS</p>
            <h2>目前班級與課程</h2>
          </div>

          {isLoadingEnrollments ? (
            <div className="studentProfile__emptyState">
              <strong>
                正在讀取班級資料……
              </strong>
            </div>
          ) : !hasCurrentEnrollments ? (
            <div className="studentProfile__emptyState">
              <div className="studentProfile__emptyIcon">
                ＋
              </div>

              <strong>
                目前尚未加入班級
              </strong>

              <span>
                可從安親班、美語班或才藝班管理將學生加入班級與課程。
              </span>
            </div>
          ) : (
            <div className="studentProfile__enrollmentList">
              {currentClassRecords.map(
                (item) => {
                  const classItem =
                    item.classes;

                  if (!classItem) {
                    return null;
                  }

                  return (
                    <div
                      key={`after-school-${item.id}`}
                      className="studentProfile__enrollmentItem"
                    >
                      <div>
                        <span>
                          安親班級
                        </span>

                        <strong>
                          {
                            classItem.class_name
                          }
                        </strong>

                        <span>
                          {[
                            classItem.academic_year,
                            classItem.term,
                          ]
                            .filter(Boolean)
                            .join("・")}
                        </span>
                      </div>

                      <small>
                        {formatDate(
                          item.joined_at
                        )}
                        {" ～ "}
                        至今
                      </small>
                    </div>
                  );
                }
              )}

              {currentEnglishClassRecords.map(
                (item) => {
                  const englishClass =
                    item.english_classes;

                  if (!englishClass) {
                    return null;
                  }

                  const scheduleText =
                    (
                      englishClass
                        .english_class_schedules ||
                      []
                    )
                      .map(
                        (schedule) =>
                          `${
                            WEEKDAY_LABELS[
                              schedule.weekday
                            ] || ""
                          } ${formatTime(
                            schedule.start_time
                          )}－${formatTime(
                            schedule.end_time
                          )}`
                      )
                      .filter(Boolean)
                      .join(" ・ ");

                  return (
                    <div
                      key={`english-${item.id}`}
                      className="studentProfile__enrollmentItem"
                    >
                      <div>
                        <span>
                          美語班級
                        </span>

                        <strong>
                          {
                            englishClass.class_name
                          }
                        </strong>

                        <span>
                          {[
                            englishClass.academic_year,
                            englishClass.term,
                            englishClass.teacher_name
                              ? `授課老師 ${englishClass.teacher_name}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join("・")}
                        </span>

                        {scheduleText && (
                          <span>
                            {scheduleText}
                          </span>
                        )}
                      </div>

                      <small>
                        {formatDate(
                          item.joined_at
                        )}
                        {" ～ "}
                        至今
                      </small>
                    </div>
                  );
                }
              )}

              {currentTalentClassRecords.map(
                (item) => {
                  const talentClass =
                    item.course_classes;

                  if (!talentClass) {
                    return null;
                  }

                  const courseName =
                    talentClass.courses
                      ?.course_name ||
                    "才藝課程";

                  const scheduleText = [
                    WEEKDAY_LABELS[
                      talentClass.weekday
                    ],
                    talentClass.start_time &&
                    talentClass.end_time
                      ? `${formatTime(
                          talentClass.start_time
                        )}－${formatTime(
                          talentClass.end_time
                        )}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <div
                      key={`talent-${item.id}`}
                      className="studentProfile__enrollmentItem"
                    >
                      <div>
                        <span>
                          才藝課程
                        </span>

                        <strong>
                          {courseName}
                        </strong>

                        <span>
                          {talentClass.class_name}
                        </span>

                        {scheduleText && (
                          <span>
                            {scheduleText}
                          </span>
                        )}
                      </div>

                      <small>
                        {formatDate(
                          item.joined_at
                        )}
                        {" ～ "}
                        至今
                      </small>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </section>

        <section className="studentProfile__panel studentProfile__panel--wide">
          <div className="studentProfile__sectionHeading">
            <p>CLASS HISTORY</p>
            <h2>班級歷程</h2>
          </div>

          {isLoadingClasses ? (
            <div className="studentProfile__emptyState">
              <strong>
                正在讀取班級歷程……
              </strong>
            </div>
          ) : pastClassRecords.length ===
            0 ? (
            <div className="studentProfile__emptyState">
              <strong>
                目前沒有歷史班級紀錄
              </strong>

              <span>
                正式退出或轉班後，歷史紀錄會保留在這裡。
              </span>
            </div>
          ) : (
            <div className="studentProfile__enrollmentList">
              {pastClassRecords.map(
                (item) => {
                  const classItem =
                    item.classes;

                  if (!classItem) {
                    return null;
                  }

                  return (
                    <div
                      key={item.id}
                      className="studentProfile__enrollmentItem"
                    >
                      <div>
                        <strong>
                          {
                            classItem.class_name
                          }
                        </strong>

                        <span>
                          {[
                            classItem.academic_year,
                            classItem.term,
                          ]
                            .filter(Boolean)
                            .join("・")}
                        </span>
                      </div>

                      <small>
                        {formatDate(
                          item.joined_at
                        )}
                        {" ～ "}
                        {formatDate(
                          item.left_at
                        )}
                      </small>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </section>

        <section className="studentProfile__panel">
          <div className="studentProfile__sectionHeading">
            <p>TIMELINE</p>
            <h2>學生時間軸</h2>
          </div>

          <div className="studentProfile__timeline">
            {timelineItems.length === 0 ? (
              <div className="studentProfile__timelineItem studentProfile__timelineItem--muted">
                <span className="studentProfile__timelineDot" />

                <div>
                  <strong>
                    等待更多紀錄
                  </strong>

                  <p>
                    未來會顯示班級、課程與狀態變更。
                  </p>
                </div>
              </div>
            ) : (
              timelineItems.map(
                (item, index) => (
                  <div
                    key={`${item.type}-${item.date}-${index}`}
                    className="studentProfile__timelineItem"
                  >
                    <span className="studentProfile__timelineDot" />

                    <div>
                      <strong>
                        {item.title}
                      </strong>

                      <p>
                        {formatDate(
                          item.date
                        )}

                        {item.description
                          ? `・${item.description}`
                          : ""}
                      </p>
                    </div>
                  </div>
                )
              )
            )}
          </div>
        </section>

        <section className="studentProfile__panel">
          <div className="studentProfile__sectionHeading">
            <p>AUDIT LOG</p>
            <h2>異動紀錄</h2>
          </div>

          <div className="studentProfile__auditList">
            <div className="studentProfile__auditItem">
              <div>
                <strong>
                  學生資料已建立
                </strong>

                <p>
                  系統資料建立時間。
                </p>
              </div>

              <span>
                {student.created_at
                  ? new Date(
                      student.created_at
                    ).toLocaleDateString(
                      "zh-TW"
                    )
                  : "尚未記錄"}
              </span>
            </div>
          </div>
        </section>

        <section className="studentProfile__panel studentProfile__panel--wide">
          <div className="studentProfile__sectionHeading">
            <p>NOTES</p>
            <h2>備註</h2>
          </div>

          <div className="studentProfile__note">
            {student.note ||
              "目前沒有備註。"}
          </div>
        </section>
      </div>
    </div>
  );
}

export default StudentProfile;