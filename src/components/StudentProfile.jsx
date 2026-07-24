import "./StudentProfile.css";

function StudentProfile({ student, onBack, onEdit }) {
  const statusLabels = {
    ACTIVE: "在學",
    PAUSED: "暫停",
    WITHDRAWN: "退班",
    GRADUATED: "畢業",
  };

  const gradeLabel = student.current_grade || "年級未設定";
  const statusLabel =
    statusLabels[student.student_status] ||
    student.student_status ||
    "狀態未設定";

  function displayValue(value) {
    return value || "尚未設定";
  }

  return (
    <div className="studentProfile">
      <button
        type="button"
        className="studentProfile__back"
        onClick={onBack}
      >
        ← 返回學生列表
      </button>

      <header className="studentProfile__hero">
        <div className="studentProfile__heroMain">
          <p className="studentProfile__eyebrow">STUDENT PROFILE</p>

          <div className="studentProfile__nameRow">
            <h1>{student.chinese_name}</h1>

            {student.is_test && (
              <span className="studentProfile__testBadge">測試資料</span>
            )}
          </div>

          <p className="studentProfile__studentNo">
            {student.student_no || "尚未建立學號"}
            {student.english_name ? `・${student.english_name}` : ""}
          </p>

          <div className="studentProfile__chips">
            <span className="studentProfile__chip studentProfile__chip--status">
              {statusLabel}
            </span>

            <span className="studentProfile__chip">{gradeLabel}</span>

            <span className="studentProfile__chip">
              {student.is_test ? "測試學生" : "正式學生"}
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
          <strong>{displayValue(student.enrollment_date)}</strong>
        </div>

        <div>
          <span>就讀學校</span>
          <strong>{displayValue(student.school)}</strong>
        </div>

        <div>
          <span>出生年月日</span>
          <strong>{displayValue(student.birthday)}</strong>
        </div>

        <div>
          <span>主要聯絡人</span>
          <strong>{displayValue(student.primary_parent_title)}</strong>
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
              <strong>{displayValue(student.chinese_name)}</strong>
            </div>

            <div>
              <span>英文姓名</span>
              <strong>{displayValue(student.english_name)}</strong>
            </div>

            <div>
              <span>出生年月日</span>
              <strong>{displayValue(student.birthday)}</strong>
            </div>

            <div>
              <span>就讀學校</span>
              <strong>{displayValue(student.school)}</strong>
            </div>

            <div>
              <span>目前年級</span>
              <strong>{displayValue(student.current_grade)}</strong>
            </div>

            <div>
              <span>入班日期</span>
              <strong>{displayValue(student.enrollment_date)}</strong>
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
              <strong>{displayValue(student.primary_parent_title)}</strong>
            </div>

            <div>
              <span>主要聯絡電話</span>
              <strong>{displayValue(student.primary_parent_phone)}</strong>
            </div>

            <div>
              <span>第二聯絡人</span>
              <strong>{displayValue(student.secondary_parent_title)}</strong>
            </div>

            <div>
              <span>第二聯絡電話</span>
              <strong>{displayValue(student.secondary_parent_phone)}</strong>
            </div>
          </div>
        </section>

        <section className="studentProfile__panel studentProfile__panel--wide">
          <div className="studentProfile__sectionHeading">
            <p>ENROLLMENTS</p>
            <h2>目前修課與班級</h2>
          </div>

          <div className="studentProfile__emptyState">
            <div className="studentProfile__emptyIcon">＋</div>
            <strong>目前尚未建立修課資料</strong>
            <span>
              下一階段會接上安親、美語、邏輯、圍棋及其他班級紀錄。
            </span>
          </div>
        </section>

        <section className="studentProfile__panel">
          <div className="studentProfile__sectionHeading">
            <p>TIMELINE</p>
            <h2>學生時間軸</h2>
          </div>

          <div className="studentProfile__timeline">
            <div className="studentProfile__timelineItem">
              <span className="studentProfile__timelineDot" />
              <div>
                <strong>建立學生資料</strong>
                <p>
                  {student.enrollment_date
                    ? `入班日期：${student.enrollment_date}`
                    : "尚未設定入班日期"}
                </p>
              </div>
            </div>

            <div className="studentProfile__timelineItem studentProfile__timelineItem--muted">
              <span className="studentProfile__timelineDot" />
              <div>
                <strong>等待更多紀錄</strong>
                <p>未來會顯示升級、轉班、退課與狀態變更。</p>
              </div>
            </div>
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
                <strong>學生資料已建立</strong>
                <p>目前尚未有其他修改紀錄。</p>
              </div>

              <span>
                {student.created_at
                  ? new Date(student.created_at).toLocaleDateString("zh-TW")
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
            {student.note || "目前沒有備註。"}
          </div>
        </section>
      </div>
    </div>
  );
}

export default StudentProfile;