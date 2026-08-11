function formatTime(timeString) {
  if (!timeString) return "";

  return timeString.slice(0, 5);
}

function getSourceName(item) {
  if (item.makeup_type === "ENGLISH") {
    return (
      item.english_classes?.class_name ||
      "美語補課"
    );
  }

  const courseName =
    item.course_classes?.courses?.course_name;

  const className =
    item.course_classes?.class_name;

  return (
    [courseName, className]
      .filter(Boolean)
      .join("・") ||
    "才藝補課"
  );
}

function getStatusLabel(status) {
  if (status === "COMPLETED") {
    return "已完成";
  }

  if (status === "CANCELLED") {
    return "已取消";
  }

  return "待補課";
}

function MakeupDayDrawer({
  dateLabel,
  items,
  onClose,
  onOpenMakeup,
}) {
  return (
    <div
      className="makeupDay__backdrop"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <aside className="makeupDay">
        <header className="makeupDay__header">
          <div>
            <p>DAILY MAKEUPS</p>

            <h2>{dateLabel}</h2>

            <span>
              共 {items.length} 筆補課
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

        <div className="makeupDay__body">
          {items.length === 0 ? (
            <div className="makeupDay__empty">
              這一天沒有補課安排。
            </div>
          ) : (
            <div className="makeupDay__list">
              {items.map((item) => {
                const student =
                  item.students;

                const hasRescheduled =
                  Number(
                    item.reschedule_count || 0
                  ) > 0;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className="makeupDay__item"
                    onClick={() =>
                      onOpenMakeup(item)
                    }
                  >
                    <div className="makeupDay__time">
                      {hasRescheduled && (
                        <span>↻</span>
                      )}

                      <strong>
                        {formatTime(
                          item.start_time
                        )}
                      </strong>
                    </div>

                    <div className="makeupDay__info">
                      <strong>
                        {student?.chinese_name ||
                          "未命名學生"}
                      </strong>

                      <span>
                        {getSourceName(item)}
                      </span>

                      <small>
                        通知老師：
                        {item.teachers
                          ?.chinese_name ||
                          "未設定"}
                      </small>
                    </div>

                    <span className="makeupDay__status">
                      {getStatusLabel(
                        item.status
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export default MakeupDayDrawer;