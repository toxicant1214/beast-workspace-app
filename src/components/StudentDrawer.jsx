function StudentDrawer({
  selectedStudent,
  form,
  setForm,
  onClose,
  onSave,
  onDelete,
}) {
  const isOfficialStudent =
    Boolean(selectedStudent) &&
    selectedStudent.is_test === false;

  function updateField(field, value) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  return (
    <div className="drawerBackdrop">
      <form className="drawer" onSubmit={onSave}>
        <div className="drawerHeader">
          <div>
            <p className="eyebrow">
              {selectedStudent
                ? "STUDENT PROFILE"
                : "NEW STUDENT"}
            </p>

            <h2>
              {selectedStudent ? "編輯學生資料" : "新增學生"}
            </h2>
          </div>

          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="drawerSection">
          <p className="drawerSectionTitle">學生身分</p>

          <label>
            資料類型
            <select
              value={form.is_test ? "TEST" : "OFFICIAL"}
              onChange={(e) =>
                updateField(
                  "is_test",
                  e.target.value === "TEST"
                )
              }
              disabled={isOfficialStudent}
            >
              <option value="OFFICIAL">正式學生</option>
              <option value="TEST">測試學生</option>
            </select>
          </label>

          <label>
            學號
            <input
              value={
                form.student_no ||
                (form.is_test
                  ? "儲存後自動產生 TEST 編號"
                  : "儲存後自動產生 STU 編號")
              }
              disabled
            />
          </label>

          <label>
            學生狀態
            <select
              value={form.student_status}
              onChange={(e) =>
                updateField("student_status", e.target.value)
              }
            >
              <option value="ACTIVE">在學</option>
              <option value="PAUSED">暫停</option>
              <option value="WITHDRAWN">退班</option>
              <option value="GRADUATED">畢業</option>
            </select>
          </label>
        </div>

        <div className="drawerSection">
          <p className="drawerSectionTitle">基本資料</p>

          <label>
            中文姓名
            <input
              required
              value={form.chinese_name}
              onChange={(e) =>
                updateField("chinese_name", e.target.value)
              }
            />
          </label>

          <label>
            英文姓名
            <input
              value={form.english_name}
              onChange={(e) =>
                updateField("english_name", e.target.value)
              }
            />
          </label>

          <label>
            出生年月日
            <input
              type="date"
              value={form.birthday}
              onChange={(e) =>
                updateField("birthday", e.target.value)
              }
            />
          </label>

          <label>
            就讀學校
            <input
              value={form.school}
              onChange={(e) =>
                updateField("school", e.target.value)
              }
            />
          </label>

          <label>
            年級
            <select
              value={form.current_grade}
              onChange={(e) =>
                updateField("current_grade", e.target.value)
              }
            >
              <option value="">未設定</option>
              <option value="幼兒園">幼兒園</option>
              <option value="一年級">一年級</option>
              <option value="二年級">二年級</option>
              <option value="三年級">三年級</option>
              <option value="四年級">四年級</option>
              <option value="五年級">五年級</option>
              <option value="六年級">六年級</option>
              <option value="畢業生">畢業生</option>
            </select>
          </label>

          <label>
            入班日期
            <input
              type="date"
              value={form.enrollment_date}
              onChange={(e) =>
                updateField("enrollment_date", e.target.value)
              }
            />
          </label>
        </div>

        <div className="drawerSection">
          <p className="drawerSectionTitle">家長聯絡資料</p>

          <label>
            主要家長稱謂
            <input
              required
              value={form.primary_parent_title}
              onChange={(e) =>
                updateField(
                  "primary_parent_title",
                  e.target.value
                )
              }
            />
          </label>

          <label>
            主要家長電話
            <input
              required
              type="tel"
              value={form.primary_parent_phone}
              onChange={(e) =>
                updateField(
                  "primary_parent_phone",
                  e.target.value
                )
              }
            />
          </label>

          <label>
            第二家長稱謂
            <input
              value={form.secondary_parent_title}
              onChange={(e) =>
                updateField(
                  "secondary_parent_title",
                  e.target.value
                )
              }
            />
          </label>

          <label>
            第二家長電話
            <input
              type="tel"
              value={form.secondary_parent_phone}
              onChange={(e) =>
                updateField(
                  "secondary_parent_phone",
                  e.target.value
                )
              }
            />
          </label>
        </div>

        <div className="drawerSection">
          <p className="drawerSectionTitle">備註</p>

          <label>
            學生備註
            <textarea
              rows="5"
              value={form.note}
              placeholder="可記錄特殊需求、家長溝通事項或其他重要資訊..."
              onChange={(e) =>
                updateField("note", e.target.value)
              }
            />
          </label>
        </div>

        <div className="drawerActions">
          {selectedStudent?.is_test && (
            <button
              type="button"
              className="danger"
              onClick={onDelete}
            >
              刪除測試學生
            </button>
          )}

          <button type="button" onClick={onClose}>
            取消
          </button>

          <button type="submit" className="primary">
            {selectedStudent ? "儲存修改" : "儲存學生"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default StudentDrawer;