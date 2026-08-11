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
  if (!timeString) return "未設定";

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

function EnglishClassDetailDrawer({
  classItem,
  onClose,
}) {
  if (!classItem) return null;

  const schedules =
    classItem.english_class_schedules || [];

  return (
    <div
      className="englishClassDetail__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside className="englishClassDetail">
        <header className="englishClassDetail__header">
          <div>
            <p>ENGLISH CLASS DETAIL</p>

            <h2>{classItem.class_name}</h2>

            <span>
              {[
                classItem.academic_year,
                classItem.term,
              ]
                .filter(Boolean)
                .join("・") || "未設定學期"}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
          >
            ×
          </button>
        </header>

        <div className="englishClassDetail__body">
          <section className="englishClassDetail__section">
            <div className="englishClassDetail__sectionHeading">
              <p>CLASS INFO</p>
              <h3>班級資訊</h3>
            </div>

            <div className="englishClassDetail__infoGrid">
              <div>
                <span>學年度</span>
                <strong>
                  {classItem.academic_year ||
                    "未設定"}
                </strong>
              </div>

              <div>
                <span>學期</span>
                <strong>
                  {classItem.term || "未設定"}
                </strong>
              </div>

              <div>
                <span>開始日期</span>
                <strong>
                  {formatDate(
                    classItem.start_date
                  )}
                </strong>
              </div>

              <div>
                <span>結束日期</span>
                <strong>
                  {formatDate(
                    classItem.end_date
                  )}
                </strong>
              </div>

              <div>
                <span>授課老師</span>
                <strong>
                  {classItem.teacher_name ||
                    "未設定"}
                </strong>
              </div>

              <div>
                <span>班級狀態</span>
                <strong>
                  {classItem.is_active
                    ? "啟用中"
                    : "已停用"}
                </strong>
              </div>
            </div>
          </section>

          <section className="englishClassDetail__section">
            <div className="englishClassDetail__sectionHeading">
              <p>WEEKLY SCHEDULE</p>
              <h3>每週上課時間</h3>
            </div>

            <div className="englishClassDetail__scheduleList">
              {schedules.length === 0 ? (
                <p>尚未設定上課時段。</p>
              ) : (
                schedules.map((schedule) => (
                  <div key={schedule.id}>
                    <strong>
                      {
                        WEEKDAY_LABELS[
                          schedule.weekday
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
                ))
              )}
            </div>
          </section>

          <section className="englishClassDetail__section">
            <div className="englishClassDetail__studentHeader">
              <div>
                <p>CURRENT STUDENTS</p>
                <h3>目前學生</h3>
                <span>目前 0 位學生</span>
              </div>

              <button
                type="button"
                className="englishClassDetail__addStudent"
                disabled
                title="下一步開放"
              >
                ＋ 加入學生
              </button>
            </div>

            <div className="englishClassDetail__empty">
              <div>＋</div>

              <strong>目前還沒有學生</strong>

              <p>
                下一步會從既有學生資料中批次加入。
              </p>
            </div>
          </section>

          {classItem.note && (
            <section className="englishClassDetail__section">
              <div className="englishClassDetail__sectionHeading">
                <p>NOTES</p>
                <h3>備註</h3>
              </div>

              <div className="englishClassDetail__note">
                {classItem.note}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

export default EnglishClassDetailDrawer;