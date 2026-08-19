import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../../lib/supabase";

const GRADE_OPTIONS = [
  { value: "K", label: "幼兒園" },
  { value: "G1", label: "一年級" },
  { value: "G2", label: "二年級" },
  { value: "G3", label: "三年級" },
  { value: "G4", label: "四年級" },
  { value: "G5", label: "五年級" },
  { value: "G6", label: "六年級" },
  { value: "GRADUATED", label: "畢業生" },
];

const GRADE_ORDER = GRADE_OPTIONS.reduce(
  (result, item, index) => ({
    ...result,
    [item.value]: index,
  }),
  {}
);

const EMPTY_FORM = {
  chinese_name: "",
  grade: "G1",
  school: "",
  parent_title: "",
  parent_phone: "",
  vegetarian_note: "",
  notes: "",
};

function getGradeLabel(value) {
  return (
    GRADE_OPTIONS.find((item) => item.value === value)?.label ||
    value ||
    "—"
  );
}

function CampStudentsPanel({ camp, onBack }) {
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadStudents();
  }, [camp.id]);

  async function loadStudents() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("camp_students")
        .select(`
          id,
          camp_id,
          chinese_name,
          grade,
          school,
          parent_title,
          parent_phone,
          vegetarian_note,
          notes,
          created_at,
          updated_at
        `)
        .eq("camp_id", camp.id);

      if (error) throw error;
      setStudents(data ?? []);
    } catch (error) {
      console.error("讀取營隊學生失敗：", error);
      setErrorMessage(`讀取學生失敗：${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      const gradeDiff =
        (GRADE_ORDER[a.grade] ?? 999) -
        (GRADE_ORDER[b.grade] ?? 999);

      if (gradeDiff !== 0) return gradeDiff;

      return String(a.chinese_name || "").localeCompare(
        String(b.chinese_name || ""),
        "zh-Hant"
      );
    });
  }, [students]);

  function openCreateForm() {
    setEditingStudent(null);
    setFormData(EMPTY_FORM);
    setErrorMessage("");
    setIsFormOpen(true);
  }

  function openEditForm(student) {
    setEditingStudent(student);
    setFormData({
      chinese_name: student.chinese_name || "",
      grade: student.grade || "G1",
      school: student.school || "",
      parent_title: student.parent_title || "",
      parent_phone: student.parent_phone || "",
      vegetarian_note: student.vegetarian_note || "",
      notes: student.notes || "",
    });
    setErrorMessage("");
    setIsFormOpen(true);
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!formData.chinese_name.trim()) {
      setErrorMessage("請輸入學生姓名。");
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage("");

      const payload = {
        camp_id: camp.id,
        chinese_name: formData.chinese_name.trim(),
        grade: formData.grade,
        school: formData.school.trim() || null,
        parent_title: formData.parent_title.trim() || null,
        parent_phone: formData.parent_phone.trim() || null,
        vegetarian_note: formData.vegetarian_note.trim() || null,
        notes: formData.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (editingStudent) {
        const { data, error } = await supabase
          .from("camp_students")
          .update(payload)
          .eq("id", editingStudent.id)
          .eq("camp_id", camp.id)
          .select()
          .single();

        if (error) throw error;

        setStudents((current) =>
          current.map((student) =>
            student.id === data.id ? data : student
          )
        );
      } else {
        const { data, error } = await supabase
          .from("camp_students")
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        setStudents((current) => [...current, data]);
      }

      setIsFormOpen(false);
      setEditingStudent(null);
      setFormData(EMPTY_FORM);
    } catch (error) {
      console.error("儲存營隊學生失敗：", error);
      setErrorMessage(`儲存失敗：${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(student) {
    const confirmed = window.confirm(
      `確定要刪除「${student.chinese_name}」嗎？\n\n這只會刪除本期營隊內的學生資料。`
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("camp_students")
        .delete()
        .eq("id", student.id)
        .eq("camp_id", camp.id);

      if (error) throw error;

      setStudents((current) =>
        current.filter((item) => item.id !== student.id)
      );
    } catch (error) {
      console.error("刪除營隊學生失敗：", error);
      setErrorMessage(`刪除失敗：${error.message}`);
    }
  }

  return (
    <div className="campStudentsPanel">
      <div className="campStudentsPanel__header">
        <div>
          <button
            type="button"
            className="campBackButton"
            onClick={onBack}
          >
            ← 返回營隊資料夾
          </button>

          <p className="campEyebrow">CAMP STUDENTS</p>
          <h2>學生與每日報名</h2>
          <p>{camp.name}</p>
        </div>

        <button
          type="button"
          className="campPrimaryButton"
          onClick={openCreateForm}
        >
          ＋ 新增學生
        </button>
      </div>

      <div className="campStudentsPanel__summary">
        <span>本期學生</span>
        <strong>{students.length} 人</strong>
      </div>

      {errorMessage && (
        <div className="campMessage campMessage--error">
          {errorMessage}
        </div>
      )}

      <div className="campStudentsTableWrap">
        <table className="campStudentsTable">
          <thead>
            <tr>
              <th>姓名</th>
              <th>年級</th>
              <th>學校</th>
              <th>家長稱謂</th>
              <th>家長聯絡電話</th>
              <th>素食備註</th>
              <th className="campStudentsTable__actions">操作</th>
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="7" className="campStudentsTable__empty">
                  正在讀取學生資料……
                </td>
              </tr>
            ) : sortedStudents.length === 0 ? (
              <tr>
                <td colSpan="7" className="campStudentsTable__empty">
                  目前尚未加入學生。
                </td>
              </tr>
            ) : (
              sortedStudents.map((student) => (
                <tr key={student.id}>
                  <td className="campStudentsTable__name">
                    {student.chinese_name}
                  </td>
                  <td>{getGradeLabel(student.grade)}</td>
                  <td>{student.school || "—"}</td>
                  <td>{student.parent_title || "—"}</td>
                  <td>{student.parent_phone || "—"}</td>
                  <td>{student.vegetarian_note || "—"}</td>
                  <td className="campStudentsTable__actions">
                    <button
                      type="button"
                      onClick={() => openEditForm(student)}
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      className="is-danger"
                      onClick={() => handleDelete(student)}
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isFormOpen && (
        <div
          className="campModalBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsFormOpen(false);
            }
          }}
        >
          <div className="campModal" role="dialog" aria-modal="true">
            <div className="campModal__header">
              <div>
                <p className="campEyebrow">CAMP STUDENT</p>
                <h2>{editingStudent ? "編輯學生" : "新增學生"}</h2>
              </div>

              <button
                type="button"
                className="campModal__close"
                onClick={() => setIsFormOpen(false)}
              >
                ×
              </button>
            </div>

            <form className="campForm" onSubmit={handleSubmit}>
              <label className="campForm__field">
                <span>姓名 *</span>
                <input
                  type="text"
                  name="chinese_name"
                  value={formData.chinese_name}
                  onChange={handleChange}
                  autoFocus
                />
              </label>

              <label className="campForm__field">
                <span>年級 *</span>
                <select
                  name="grade"
                  value={formData.grade}
                  onChange={handleChange}
                >
                  {GRADE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="campForm__field">
                <span>學校</span>
                <input
                  type="text"
                  name="school"
                  value={formData.school}
                  onChange={handleChange}
                />
              </label>

              <div className="campForm__dateGrid">
                <label className="campForm__field">
                  <span>家長稱謂</span>
                  <input
                    type="text"
                    name="parent_title"
                    value={formData.parent_title}
                    onChange={handleChange}
                    placeholder="例如：媽媽"
                  />
                </label>

                <label className="campForm__field">
                  <span>家長聯絡電話</span>
                  <input
                    type="text"
                    name="parent_phone"
                    value={formData.parent_phone}
                    onChange={handleChange}
                  />
                </label>
              </div>

              <label className="campForm__field">
                <span>素食備註</span>
                <input
                  type="text"
                  name="vegetarian_note"
                  value={formData.vegetarian_note}
                  onChange={handleChange}
                  placeholder="例如：全素、蛋奶素；非素食可留空"
                />
              </label>

              <label className="campForm__field">
                <span>其他備註</span>
                <textarea
                  name="notes"
                  rows="3"
                  value={formData.notes}
                  onChange={handleChange}
                />
              </label>

              {errorMessage && (
                <div className="campMessage campMessage--error">
                  {errorMessage}
                </div>
              )}

              <div className="campModal__actions">
                <button
                  type="button"
                  className="campSecondaryButton"
                  onClick={() => setIsFormOpen(false)}
                  disabled={isSaving}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="campPrimaryButton"
                  disabled={isSaving}
                >
                  {isSaving ? "儲存中…" : "儲存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CampStudentsPanel;