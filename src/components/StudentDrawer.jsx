function StudentDrawer({
  selectedStudent,
  form,
  setForm,
  onClose,
  onSave,
  onDelete,
}) {
  return (
    <div className="drawerBackdrop">
      <form className="drawer" onSubmit={onSave}>
        <div className="drawerHeader">
          <div>
            <p className="eyebrow">
              {selectedStudent ? "STUDENT PROFILE" : "NEW STUDENT"}
            </p>
            <h2>{selectedStudent ? "學生資料" : "新增學生"}</h2>
          </div>

          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <label>
          學號
          <input value={form.student_no} disabled />
        </label>

        <label>
          中文姓名
          <input
            required
            value={form.chinese_name}
            onChange={(e) =>
              setForm({ ...form, chinese_name: e.target.value })
            }
          />
        </label>

        <label>
          英文姓名
          <input
            value={form.english_name}
            onChange={(e) =>
              setForm({ ...form, english_name: e.target.value })
            }
          />
        </label>

        <label>
          主要家長稱謂
          <input
            required
            value={form.primary_parent_title}
            onChange={(e) =>
              setForm({ ...form, primary_parent_title: e.target.value })
            }
          />
        </label>

        <label>
          主要家長電話
          <input
            required
            value={form.primary_parent_phone}
            onChange={(e) =>
              setForm({ ...form, primary_parent_phone: e.target.value })
            }
          />
        </label>

        <label>
          年級
          <select
            value={form.current_grade}
            onChange={(e) =>
              setForm({ ...form, current_grade: e.target.value })
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

        <div className="drawerActions">
          {selectedStudent && (
            <button type="button" className="danger" onClick={onDelete}>
              刪除學生
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