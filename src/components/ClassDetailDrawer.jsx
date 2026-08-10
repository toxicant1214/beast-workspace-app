function formatDate(dateString) {
  if (!dateString) return "未設定";

  const [year, month, day] = dateString.split("-");

  if (!year || !month || !day) {
    return dateString;
  }

  return `${year}/${month}/${day}`;
}

function ClassDetailDrawer({
  classItem,
  onClose,
  onEdit,
}) {
  if (!classItem) return null;

  return (
    <div
      className="classDetailDrawer__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside className="classDetailDrawer">
        <header className="classDetailDrawer__header">
          <div>
            <p className="classDrawer__eyebrow">
              CLASS DETAIL
            </p>

            <h2>{classItem.class_name}</h2>

            <p>
              {classItem.academic_year || "未設定學年度"}
              {classItem.term
                ? ` ・ ${classItem.term}`
                : ""}
            </p>
          </div>

          <button
            type="button"
            className="classDetailDrawer__close"
            onClick={onClose}
            aria-label="關閉"
          >
            ×
          </button>
        </header>

        <div className="classDetailDrawer__body">
          <section className="classDetailDrawer__section">
            <div className="classDetailDrawer__sectionTitle">
              <div>
                <span>CLASS INFO</span>
                <h3>班級資訊</h3>
              </div>

              <button
                type="button"
                onClick={() => onEdit(classItem)}
              >
                編輯
              </button>
            </div>

            <div className="classDetailDrawer__infoGrid">
              <div>
                <span>學年度</span>
                <strong>
                  {classItem.academic_year || "未設定"}
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
                  {formatDate(classItem.start_date)}
                </strong>
              </div>

              <div>
                <span>結束日期</span>
                <strong>
                  {formatDate(classItem.end_date)}
                </strong>
              </div>
            </div>

            <div className="classDetailDrawer__statusRow">
              <span>班級狀態</span>

              <strong
                className={
                  classItem.is_active
                    ? "classTable__status classTable__status--active"
                    : "classTable__status classTable__status--inactive"
                }
              >
                {classItem.is_active
                  ? "啟用中"
                  : "已停用"}
              </strong>
            </div>

            {classItem.note && (
              <div className="classDetailDrawer__note">
                <span>備註</span>
                <p>{classItem.note}</p>
              </div>
            )}
          </section>

          <section className="classDetailDrawer__section">
            <div className="classDetailDrawer__studentHeader">
              <div>
                <span>CURRENT STUDENTS</span>
                <h3>目前學生</h3>
                <p>目前 0 位學生</p>
              </div>

              <button
                type="button"
                className="classDetailDrawer__addStudent"
                disabled
                title="下一步開放"
              >
                ＋ 加入學生
              </button>
            </div>

            <div className="classDetailDrawer__empty">
              <div>＋</div>
              <strong>目前還沒有學生</strong>
              <p>
                下一步會從既有學生資料中批次加入。
              </p>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

export default ClassDetailDrawer;