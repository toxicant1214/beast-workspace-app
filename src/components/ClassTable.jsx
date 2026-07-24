const COURSE_TYPE_LABELS = {
  AFTER_SCHOOL: "安親",
  ENGLISH: "美語",
  LOGIC: "邏輯",
  GO: "圍棋",
  READING: "閱讀",
  WRITING: "作文",
  CAMP: "營隊",
  OTHER: "其他",
};

function displayValue(value) {
  return value || "未設定";
}

function formatDate(dateString) {
  if (!dateString) return "未設定";

  const [year, month, day] = dateString.split("-");

  if (!year || !month || !day) {
    return dateString;
  }

  return `${year}/${month}/${day}`;
}

function ClassTable({
  classes,
  isLoading,
  onEdit,
  onToggleStatus,
}) {
  if (isLoading) {
    return (
      <div className="classTable__empty">
        正在讀取班級資料……
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div className="classTable__empty">
        <div className="classTable__emptyIcon">＋</div>
        <strong>目前沒有符合條件的班級</strong>
        <p>可以新增第一個班級，或調整搜尋及篩選條件。</p>
      </div>
    );
  }

  return (
    <div className="classTable__wrapper">
      <table className="classTable">
        <thead>
          <tr>
            <th>班級名稱</th>
            <th>課程類型</th>
            <th>學年度／學期</th>
            <th>課程期間</th>
            <th>狀態</th>
            <th aria-label="操作" />
          </tr>
        </thead>

        <tbody>
          {classes.map((classItem) => (
            <tr key={classItem.id}>
              <td>
                <button
                  type="button"
                  className="classTable__className"
                  onClick={() => onEdit(classItem)}
                >
                  {classItem.class_name}
                </button>

                {classItem.note && (
                  <p className="classTable__note">
                    {classItem.note}
                  </p>
                )}
              </td>

              <td>
                <span
                  className={`classTable__typeBadge classTable__typeBadge--${classItem.course_type?.toLowerCase()}`}
                >
                  {COURSE_TYPE_LABELS[
                    classItem.course_type
                  ] || classItem.course_type}
                </span>
              </td>

              <td>
                <div className="classTable__stackedText">
                  <strong>
                    {displayValue(
                      classItem.academic_year
                    )}
                  </strong>
                  <span>
                    {displayValue(classItem.term)}
                  </span>
                </div>
              </td>

              <td>
                <div className="classTable__dateRange">
                  <span>
                    {formatDate(classItem.start_date)}
                  </span>

                  <small>至</small>

                  <span>
                    {formatDate(classItem.end_date)}
                  </span>
                </div>
              </td>

              <td>
                <span
                  className={
                    classItem.is_active
                      ? "classTable__status classTable__status--active"
                      : "classTable__status classTable__status--inactive"
                  }
                >
                  {classItem.is_active
                    ? "啟用中"
                    : "已停用"}
                </span>
              </td>

              <td>
                <div className="classTable__actions">
                  <button
                    type="button"
                    onClick={() => onEdit(classItem)}
                  >
                    編輯
                  </button>

                  <button
                    type="button"
                    className={
                      classItem.is_active
                        ? "classTable__statusButton classTable__statusButton--disable"
                        : "classTable__statusButton classTable__statusButton--enable"
                    }
                    onClick={() =>
                      onToggleStatus(classItem)
                    }
                  >
                    {classItem.is_active
                      ? "停用"
                      : "啟用"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ClassTable;