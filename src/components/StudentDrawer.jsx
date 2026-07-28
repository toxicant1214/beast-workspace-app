function StudentDrawer({
  selectedStudent,
  form,
  setForm,
  onClose,
  onSave,
  onDelete,
  isSaving = false,
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

  function handleNationalIdChange(value) {
    const normalizedValue = value
      .replace(/\s/g, "")
      .toUpperCase()
      .slice(0, 10);

    updateField("national_id", normalizedValue);
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

          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="關閉"
          >
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
              disabled={isOfficialStudent || isSaving}
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

          {selectedStudent && (
            <label>
              學生狀態
              <select
                value={form.student_status}
                onChange={(e) =>
                  updateField(
                    "student_status",
                    e.target.value
                  )
                }
                disabled={isSaving}
              >
                <option value="ACTIVE">在學</option>
                <option value="PAUSED">暫停</option>
                <option value="WITHDRAWN">退班</option>
                <option value="GRADUATED">畢業</option>
              </select>
            </label>
          )}
        </div>

        <div className="drawerSection">
          <p className="drawerSectionTitle">基本資料</p>

          <label>
            <span>
              中文姓名
              <strong className="requiredMark">必填</strong>
            </span>

            <input
              required
              value={form.chinese_name}
              onChange={(e) =>
                updateField("chinese_name", e.target.value)
              }
              disabled={isSaving}
            />
          </label>

          <label>
            英文姓名
            <input
              value={form.english_name}
              onChange={(e) =>
                updateField("english_name", e.target.value)
              }
              disabled={isSaving}
            />
          </label>

          <label>
            身分證字號
            <input
              value={form.national_id}
              maxLength={10}
              placeholder="例如：A123456789"
              autoComplete="off"
              onChange={(e) =>
                handleNationalIdChange(e.target.value)
              }
              disabled={isSaving}
            />
          </label>

          <label>
            性別
            <select
              value={form.gender}
              onChange={(e) =>
                updateField("gender", e.target.value)
              }
              disabled={isSaving}
            >
              <option value="">未設定</option>
              <option value="男">男</option>
              <option value="女">女</option>
              <option value="其他">其他</option>
            </select>
          </label>

          <label>
            出生年月日
            <input
              type="date"
              value={form.birthday}
              onChange={(e) =>
                updateField("birthday", e.target.value)
              }
              disabled={isSaving}
            />
          </label>

          <label>
            <span>
              就讀學校
              <strong className="requiredMark">必填</strong>
            </span>

            <input
              required
              value={form.school}
              onChange={(e) =>
                updateField("school", e.target.value)
              }
              disabled={isSaving}
            />
          </label>

          <label>
            <span>
              年級
              <strong className="requiredMark">必填</strong>
            </span>

            <select
              required
              value={form.current_grade}
              onChange={(e) =>
                updateField(
                  "current_grade",
                  e.target.value
                )
              }
              disabled={isSaving}
            >
              <option value="">請選擇年級</option>
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
                updateField(
                  "enrollment_date",
                  e.target.value
                )
              }
              disabled={isSaving}
            />
          </label>
        </div>

        <div className="drawerSection">
          <p className="drawerSectionTitle">家長聯絡資料</p>

          <label>
            <span>
              主要家長稱謂
              <strong className="requiredMark">必填</strong>
            </span>

            <input
              required
              value={form.primary_parent_title}
              placeholder="例如：媽媽、爸爸、阿嬤"
              onChange={(e) =>
                updateField(
                  "primary_parent_title",
                  e.target.value
                )
              }
              disabled={isSaving}
            />
          </label>

          <label>
            <span>
              主要家長電話
              <strong className="requiredMark">必填</strong>
            </span>

            <input
              required
              type="tel"
              value={form.primary_parent_phone}
              placeholder="例如：0912345678"
              onChange={(e) =>
                updateField(
                  "primary_parent_phone",
                  e.target.value
                )
              }
              disabled={isSaving}
            />
          </label>

          <label>
            第二家長稱謂
            <input
              value={form.secondary_parent_title}
              placeholder="選填"
              onChange={(e) =>
                updateField(
                  "secondary_parent_title",
                  e.target.value
                )
              }
              disabled={isSaving}
            />
          </label>

          <label>
            第二家長電話
            <input
              type="tel"
              value={form.secondary_parent_phone}
              placeholder="選填"
              onChange={(e) =>
                updateField(
                  "secondary_parent_phone",
                  e.target.value
                )
              }
              disabled={isSaving}
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
              disabled={isSaving}
            />
          </label>
        </div>

        <div className="drawerActions">
          {selectedStudent && (
            <button
              type="button"
              className="danger"
              onClick={onDelete}
              disabled={isSaving}
            >
              {selectedStudent.is_test
                ? "永久刪除測試學生"
                : "永久刪除學生"}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
          >
            取消
          </button>

          <button
            type="submit"
            className="primary"
            disabled={isSaving}
          >
            {isSaving
              ? "處理中..."
              : selectedStudent
                ? "儲存修改"
                : "儲存學生"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default StudentDrawer;