import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import EnglishClassDrawer from "../components/EnglishClassDrawer";
import EnglishClassDetailDrawer from "../components/EnglishClassDetailDrawer";
import "./EnglishClassPage.css";

const EMPTY_FORM = {
  class_name: "",
  academic_year: "",
  term: "",
  start_date: "",
  end_date: "",
  teacher_name: "",
  is_active: true,
  note: "",
};

const EMPTY_SCHEDULE = {
  weekday: "1",
  start_time: "",
  end_time: "",
};

const WEEKDAY_LABELS = {
  1: "星期一",
  2: "星期二",
  3: "星期三",
  4: "星期四",
  5: "星期五",
  6: "星期六",
  7: "星期日",
};

function formatDate(dateString) {
  if (!dateString) return "未設定";

  const [year, month, day] =
    dateString.split("-");

  if (!year || !month || !day) {
    return dateString;
  }

  return `${year}/${month}/${day}`;
}

function formatTime(timeString) {
  if (!timeString) return "";

  return timeString.slice(0, 5);
}

function EnglishClassPage() {
  const [englishClasses, setEnglishClasses] =
    useState([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isDrawerOpen, setIsDrawerOpen] =
    useState(false);

  const [detailClass, setDetailClass] =
    useState(null);

  const [form, setForm] =
    useState({ ...EMPTY_FORM });

  const [schedules, setSchedules] =
    useState([
      { ...EMPTY_SCHEDULE },
    ]);

  const [isSaving, setIsSaving] =
    useState(false);

  useEffect(() => {
    loadEnglishClasses();
  }, []);

  async function loadEnglishClasses() {
    try {
      setIsLoading(true);

      const { data, error } = await supabase
        .from("english_classes")
        .select(`
          id,
          class_name,
          academic_year,
          term,
          start_date,
          end_date,
          teacher_name,
          is_active,
          note,
          created_at,
          updated_at,
          english_class_schedules (
            id,
            weekday,
            start_time,
            end_time,
            sort_order
          )
        `)
        .order("is_active", {
          ascending: false,
        })
        .order("created_at", {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      const normalizedData =
        (data || []).map((item) => ({
          ...item,

          english_class_schedules:
            item.english_class_schedules
              ?.slice()
              .sort(
                (a, b) =>
                  (a.sort_order ?? 0) -
                  (b.sort_order ?? 0)
              ) || [],
        }));

      setEnglishClasses(
        normalizedData
      );
    } catch (error) {
      console.error(
        "讀取美語班失敗：",
        error
      );

      window.alert(
        `讀取美語班失敗：${error.message}`
      );

      setEnglishClasses([]);
    } finally {
      setIsLoading(false);
    }
  }

  function openNewDrawer() {
    setDetailClass(null);

    setForm({
      ...EMPTY_FORM,
    });

    setSchedules([
      { ...EMPTY_SCHEDULE },
    ]);

    setIsDrawerOpen(true);
  }

  function closeDrawer() {
    if (isSaving) return;

    setIsDrawerOpen(false);

    setForm({
      ...EMPTY_FORM,
    });

    setSchedules([
      { ...EMPTY_SCHEDULE },
    ]);
  }

  function openClassDetail(classItem) {
    setDetailClass(classItem);
  }

  function closeClassDetail() {
    setDetailClass(null);
  }

  async function saveEnglishClass(
    event
  ) {
    event.preventDefault();

    const className =
      form.class_name.trim();

    if (!className) {
      window.alert(
        "請輸入班級名稱。"
      );

      return;
    }

    if (
      form.start_date &&
      form.end_date &&
      form.end_date <
        form.start_date
    ) {
      window.alert(
        "結束日期不可早於開始日期。"
      );

      return;
    }

    const duplicatedClass =
      englishClasses.find(
        (item) =>
          item.class_name
            ?.trim()
            .toLowerCase() ===
            className.toLowerCase() &&
          (item.academic_year || "")
            .trim()
            .toLowerCase() ===
            form.academic_year
              .trim()
              .toLowerCase() &&
          (item.term || "")
            .trim()
            .toLowerCase() ===
            form.term
              .trim()
              .toLowerCase()
      );

    if (duplicatedClass) {
      window.alert(
        `同一學年度與學期已經有「${duplicatedClass.class_name}」這個美語班。`
      );

      return;
    }

    const normalizedSchedules =
      schedules.map(
        (schedule, index) => ({
          weekday:
            Number(
              schedule.weekday
            ),

          start_time:
            schedule.start_time,

          end_time:
            schedule.end_time,

          sort_order: index,
        })
      );

    const invalidSchedule =
      normalizedSchedules.find(
        (schedule) =>
          !schedule.start_time ||
          !schedule.end_time ||
          schedule.end_time <=
            schedule.start_time
      );

    if (invalidSchedule) {
      window.alert(
        "請確認每個上課時段都有開始與結束時間，且結束時間必須晚於開始時間。"
      );

      return;
    }

    try {
      setIsSaving(true);

      const classPayload = {
        class_name: className,

        academic_year:
          form.academic_year
            .trim() || null,

        term:
          form.term.trim() ||
          null,

        start_date:
          form.start_date ||
          null,

        end_date:
          form.end_date ||
          null,

        teacher_name:
          form.teacher_name
            .trim() || null,

        is_active:
          form.is_active,

        note:
          form.note.trim() ||
          null,

        updated_at:
          new Date().toISOString(),
      };

      const {
        data: insertedClass,
        error: classError,
      } = await supabase
        .from("english_classes")
        .insert([classPayload])
        .select(
          "id, class_name"
        )
        .single();

      if (classError) {
        throw classError;
      }

      const schedulePayload =
        normalizedSchedules.map(
          (schedule) => ({
            english_class_id:
              insertedClass.id,

            weekday:
              schedule.weekday,

            start_time:
              schedule.start_time,

            end_time:
              schedule.end_time,

            sort_order:
              schedule.sort_order,
          })
        );

      const {
        error: scheduleError,
      } = await supabase
        .from(
          "english_class_schedules"
        )
        .insert(schedulePayload);

      if (scheduleError) {
        const {
          error: rollbackError,
        } = await supabase
          .from("english_classes")
          .delete()
          .eq(
            "id",
            insertedClass.id
          );

        if (rollbackError) {
          console.error(
            "時段建立失敗後刪除美語班也失敗：",
            rollbackError
          );

          window.alert(
            "美語班建立不完整，請到 Supabase 檢查 english_classes 與 english_class_schedules。"
          );

          return;
        }

        throw scheduleError;
      }

      setIsDrawerOpen(false);

      setForm({
        ...EMPTY_FORM,
      });

      setSchedules([
        { ...EMPTY_SCHEDULE },
      ]);

      await loadEnglishClasses();

      window.alert(
        `已建立美語班「${insertedClass.class_name}」。`
      );
    } catch (error) {
      console.error(
        "建立美語班失敗：",
        error
      );

      window.alert(
        `建立美語班失敗：${error.message}`
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="englishClassPage">
      <header className="englishClassPage__header">
        <div>
          <p className="englishClassPage__eyebrow">
            ENGLISH CLASSES
          </p>

          <h1>美語班</h1>

          <p className="englishClassPage__summary">
            管理美語班級、授課老師、學期資訊與每週上課時段。
          </p>
        </div>

        <button
          type="button"
          className="englishClassPage__primaryButton"
          onClick={openNewDrawer}
        >
          ＋ 新增美語班
        </button>
      </header>

      {isLoading ? (
        <section className="englishClassPage__empty">
          <strong>
            正在讀取美語班資料……
          </strong>
        </section>
      ) : englishClasses.length ===
        0 ? (
        <section className="englishClassPage__empty">
          <div>ABC</div>

          <strong>
            尚未建立美語班
          </strong>

          <p>
            點右上角「＋新增美語班」，建立第一個班級與每週上課時段。
          </p>
        </section>
      ) : (
        <section className="englishClassPage__grid">
          {englishClasses.map(
            (englishClass) => (
              <article
                key={
                  englishClass.id
                }
                className={
                  englishClass.is_active
                    ? "englishClassCard englishClassCard--clickable"
                    : "englishClassCard englishClassCard--inactive englishClassCard--clickable"
                }
                onClick={() =>
                  openClassDetail(
                    englishClass
                  )
                }
              >
                <div className="englishClassCard__top">
                  <div>
                    <h2>
                      {
                        englishClass.class_name
                      }
                    </h2>
                  </div>

                  <strong
                    className={
                      englishClass.is_active
                        ? "englishClassCard__status englishClassCard__status--active"
                        : "englishClassCard__status englishClassCard__status--inactive"
                    }
                  >
                    {englishClass.is_active
                      ? "啟用中"
                      : "已停用"}
                  </strong>
                </div>

                <div className="englishClassCard__meta">
                  <span>
                    {[
                      englishClass.academic_year,
                      englishClass.term,
                    ]
                      .filter(Boolean)
                      .join("・") ||
                      "未設定學期"}
                  </span>

                  <small>
                    {formatDate(
                      englishClass.start_date
                    )}
                    {" ～ "}
                    {formatDate(
                      englishClass.end_date
                    )}
                  </small>
                </div>

                {englishClass.teacher_name && (
                  <div className="englishClassCard__teacher">
                    授課老師：
                    <strong>
                      {
                        englishClass.teacher_name
                      }
                    </strong>
                  </div>
                )}

                <div className="englishClassCard__scheduleList">
                  {englishClass
                    .english_class_schedules
                    .length === 0 ? (
                    <p>
                      尚未設定上課時段
                    </p>
                  ) : (
                    englishClass.english_class_schedules.map(
                      (
                        schedule
                      ) => (
                        <div
                          key={
                            schedule.id
                          }
                        >
                          <strong>
                            {
                              WEEKDAY_LABELS[
                                schedule
                                  .weekday
                              ]
                            }
                          </strong>

                          <span>
                            {formatTime(
                              schedule.start_time
                            )}
                            {"－"}
                            {formatTime(
                              schedule.end_time
                            )}
                          </span>
                        </div>
                      )
                    )
                  )}
                </div>

                {englishClass.note && (
                  <p className="englishClassCard__note">
                    {
                      englishClass.note
                    }
                  </p>
                )}
              </article>
            )
          )}
        </section>
      )}

      {isDrawerOpen && (
        <EnglishClassDrawer
          form={form}
          setForm={setForm}
          schedules={schedules}
          setSchedules={
            setSchedules
          }
          onClose={closeDrawer}
          onSave={
            saveEnglishClass
          }
          isSaving={isSaving}
        />
      )}

      {detailClass && (
        <EnglishClassDetailDrawer
          classItem={
            detailClass
          }
          onClose={
            closeClassDetail
          }
        />
      )}
    </div>
  );
}

export default EnglishClassPage;