import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./SingleDayCoursePage.css";

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

function getStatusLabel(status) {
  if (status === "COMPLETED") {
    return "已完成";
  }

  if (status === "CANCELLED") {
    return "已取消";
  }

  return "未開始";
}

function SingleDayCoursePage() {
  const [courses, setCourses] = useState([]);
  const [isLoading, setIsLoading] =
    useState(true);

  useEffect(() => {
    loadCourses();
  }, []);

  async function loadCourses() {
    try {
      setIsLoading(true);

      const {
        data,
        error,
      } = await supabase
        .from("single_day_courses")
        .select(`
          id,
          course_name,
          course_date,
          start_time,
          end_time,
          teacher_id,
          partner_name,
          note,
          status,
          created_at,
          updated_at,
          teachers (
            id,
            chinese_name,
            english_name
          ),
          single_day_course_students (
            id,
            student_id
          )
        `)
        .order(
          "course_date",
          {
            ascending: false,
          }
        )
        .order(
          "start_time",
          {
            ascending: true,
          }
        );

      if (error) {
        throw error;
      }

      setCourses(
        data || []
      );
    } catch (error) {
      console.error(
        "讀取單日課程失敗：",
        error
      );

      window.alert(
        `讀取單日課程失敗：${error.message}`
      );

      setCourses([]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="singleDayCourse">
      <header className="singleDayCourse__header">
        <div>
          <p className="singleDayCourse__eyebrow">
            SINGLE-DAY COURSES
          </p>

          <h1>
            單日課程
          </h1>

          <p className="singleDayCourse__summary">
            管理一次性課程、活動、合作單位與參加學生。
          </p>
        </div>

        <button
          type="button"
          className="singleDayCourse__primaryButton"
        >
          ＋ 新增單日課程
        </button>
      </header>

      {isLoading ? (
        <div className="singleDayCourse__loading">
          正在讀取單日課程……
        </div>
      ) : courses.length === 0 ? (
        <section className="singleDayCourse__empty">
          <div>
            ONE DAY
          </div>

          <strong>
            尚未建立單日課程
          </strong>

          <p>
            下一步會加入課程建立、學生名單與合作單位設定。
          </p>
        </section>
      ) : (
        <section className="singleDayCourse__list">
          {courses.map((course) => {
            const teacher =
              course.teachers;

            const studentCount =
              course
                .single_day_course_students
                ?.length || 0;

            return (
              <article
                key={course.id}
                className="singleDayCourse__card"
              >
                <div className="singleDayCourse__cardTop">
                  <div>
                    <span>
                      {formatDate(
                        course.course_date
                      )}
                    </span>

                    <h2>
                      {course.course_name}
                    </h2>
                  </div>

                  <span className="singleDayCourse__status">
                    {getStatusLabel(
                      course.status
                    )}
                  </span>
                </div>

                <div className="singleDayCourse__meta">
                  <span>
                    {formatTime(
                      course.start_time
                    )}
                    {"－"}
                    {formatTime(
                      course.end_time
                    )}
                  </span>

                  <span>
                    授課老師：
                    {teacher?.chinese_name ||
                      teacher?.english_name ||
                      "未設定"}
                  </span>

                  <span>
                    參加學生：
                    {studentCount} 位
                  </span>
                </div>

                {course.partner_name && (
                  <div className="singleDayCourse__partner">
                    合作單位：
                    {course.partner_name}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

export default SingleDayCoursePage;