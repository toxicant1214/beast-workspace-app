function StudentProfile({ student, onBack, onEdit }) {
  const statusLabels = {
    ACTIVE: "在學",
    PAUSED: "暫停",
    WITHDRAWN: "退班",
    GRADUATED: "畢業",
  };

  function displayValue(value) {
    return value || "尚未設定";
  }

  return (
    <div className="studentProfile">
      <div className="studentProfile__navigation">
        <button
          type="button"
          className="studentProfile__back"
          onClick={onBack}
        >
          ← 返回學生列表
        </button>
      </div>

      <header className="studentProfile__header">
        <div>
          <div className="studentProfile__identity">
            <p className="eyebrow">STUDENT PROFILE</p>

            <div className="studentProfile__titleRow">
              <h1>{student.chinese_name}</h1>

              {student.is_test && (
                <span className="testBadge">測試資料</span>
              )}
            </div>

            <p className="studentProfile__subtitle">
              {student.student_no || "尚未建立學號"}
              {student.english_name
                ? `・${student.english_name}`
                : ""}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="primary"
          onClick={() => onEdit(student)}
        >
          編輯基本資料
        </button>
      </header>

      <div className="studentProfile__summary">
        <div className="studentProfile__summaryItem">
          <span>目前狀態</span>
          <strong>
            {statusLabels[student.student_status] ||
              student.student_status ||
              "未設定"}
          </strong>
        </div>

        <div className="studentProfile__summaryItem">
          <span>目前年級</span>
          <strong>{displayValue(student.current_grade)}</strong>
        </div>

        <div className="studentProfile__summaryItem">
          <span>入班日期</span>
          <strong>{displayValue(student.enrollment_date)}</strong>
        </div>

        <div className="studentProfile__summaryItem">
          <span>學校</span>
          <strong>{displayValue(student.school)}</strong>
        </div>
      </div>

      <div className="studentProfile__grid">
        <section className="studentProfile__card">
          <div className="studentProfile__sectionHeader">
            <div>
              <p className="eyebrow">BASIC INFORMATION</p>
              <h2>基本資料</h2>
            </div>
          </div>

          <div className="studentProfile__details">
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

        <section className="studentProfile__card">
          <div className="studentProfile__sectionHeader">
            <div>
              <p className="eyebrow">PARENT CONTACTS</p>
              <h2>家長資料</h2>
            </div>
          </div>

          <div className="studentProfile__details">
            <div>
              <span>主要聯絡人</span>
              <strong>
                {displayValue(student.primary_parent_title)}
              </strong>
            </div>

            <div>
              <span>主要聯絡電話</span>
              <strong>
                {displayValue(student.primary_parent_phone)}
              </strong>
            </div>

            <div>
              <span>第二聯絡人</span>
              <strong>
                {displayValue(student.secondary_parent_title)}
              </strong>
            </div>

            <div>
              <span>第二聯絡電話</span>
              <strong>
                {displayValue(student.secondary_parent_phone)}
              </strong>
            </div>
          </div>
        </section>

        <section className="studentProfile__card studentProfile__card--wide">
          <div className="studentProfile__sectionHeader">
            <div>
              <p className="eyebrow">ENROLLMENTS</p>
              <h2>目前修課與班級</h2>
            </div>
          </div>

          <div className="studentProfile__empty">
            <p>目前尚未建立修課資料。</p>
            <span>
              下一階段會接上安親、美語、邏輯、圍棋與其他班級紀錄。
            </span>
          </div>
        </section>

        <section className="studentProfile__card">
          <div className="studentProfile__sectionHeader">
            <div>
              <p className="eyebrow">TIMELINE</p>
              <h2>學生時間軸</h2>
            </div>
          </div>

          <div className="studentProfile__empty">
            <p>目前尚無時間軸紀錄。</p>
            <span>
              未來會顯示入班、升級、轉班、退課與狀態變更。
            </span>
          </div>
        </section>

        <section className="studentProfile__card">
          <div className="studentProfile__sectionHeader">
            <div>
              <p className="eyebrow">AUDIT LOG</p>
              <h2>異動紀錄</h2>
            </div>
          </div>

          <div className="studentProfile__empty">
            <p>目前尚無異動紀錄。</p>
            <span>
              未來會顯示修改前後內容、操作人員與修改時間。
            </span>
          </div>
        </section>

        <section className="studentProfile__card studentProfile__card--wide">
          <div className="studentProfile__sectionHeader">
            <div>
              <p className="eyebrow">NOTES</p>
              <h2>備註</h2>
            </div>
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