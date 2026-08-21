import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import * as XLSX from "xlsx";

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

const GRADE_IMPORT_MAP = {
  幼兒園: "K",
  幼稚園: "K",
  K: "K",
  k: "K",
  一年級: "G1",
  小一: "G1",
  G1: "G1",
  g1: "G1",
  二年級: "G2",
  小二: "G2",
  G2: "G2",
  g2: "G2",
  三年級: "G3",
  小三: "G3",
  G3: "G3",
  g3: "G3",
  四年級: "G4",
  小四: "G4",
  G4: "G4",
  g4: "G4",
  五年級: "G5",
  小五: "G5",
  G5: "G5",
  g5: "G5",
  六年級: "G6",
  小六: "G6",
  G6: "G6",
  g6: "G6",
  畢業生: "GRADUATED",
  畢業: "GRADUATED",
  GRADUATED: "GRADUATED",
  graduated: "GRADUATED",
};

const EMPTY_FORM = {
  chinese_name: "",
  english_name: "",
  grade: "G1",
  school: "",
  parent_title: "",
  parent_phone: "",
  vegetarian_note: "",
  notes: "",
};

const IMPORT_HEADERS = [
  "中文姓名",
  "英文姓名",
  "年級",
  "聯絡電話",
  "素食備註",
];

function getGradeLabel(value) {
  return (
    GRADE_OPTIONS.find((item) => item.value === value)?.label ||
    value ||
    "—"
  );
}

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizePhone(value) {
  if (value === null || value === undefined) return "";

  if (typeof value === "number") {
    return String(Math.trunc(value));
  }

  return String(value).trim();
}

function CampStudentsPanel({ camp, onBack }) {
  const fileInputRef = useRef(null);

  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importFileName, setImportFileName] = useState("");
  const [isImporting, setIsImporting] = useState(false);

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
          english_name,
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

  const validImportRows = useMemo(
    () => importRows.filter((row) => row.errors.length === 0),
    [importRows]
  );

  const invalidImportRows = useMemo(
    () => importRows.filter((row) => row.errors.length > 0),
    [importRows]
  );

  function openCreateForm() {
    setEditingStudent(null);
    setFormData(EMPTY_FORM);
    setErrorMessage("");
    setSuccessMessage("");
    setIsFormOpen(true);
  }

  function openEditForm(student) {
    setEditingStudent(student);
    setFormData({
      chinese_name: student.chinese_name || "",
      english_name: student.english_name || "",
      grade: student.grade || "G1",
      school: student.school || "",
      parent_title: student.parent_title || "",
      parent_phone: student.parent_phone || "",
      vegetarian_note: student.vegetarian_note || "",
      notes: student.notes || "",
    });
    setErrorMessage("");
    setSuccessMessage("");
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
      setErrorMessage("請輸入學生中文姓名。");
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      const payload = {
        camp_id: camp.id,
        chinese_name: formData.chinese_name.trim(),
        english_name: formData.english_name.trim() || null,
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
      setSuccessMessage(editingStudent ? "學生資料已更新。" : "學生已新增。");
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
      setErrorMessage("");
      setSuccessMessage("");

      const { error } = await supabase
        .from("camp_students")
        .delete()
        .eq("id", student.id)
        .eq("camp_id", camp.id);

      if (error) throw error;

      setStudents((current) =>
        current.filter((item) => item.id !== student.id)
      );
      setSuccessMessage(`已刪除「${student.chinese_name}」。`);
    } catch (error) {
      console.error("刪除營隊學生失敗：", error);
      setErrorMessage(`刪除失敗：${error.message}`);
    }
  }

  function downloadTemplate() {
    const rows = [
      IMPORT_HEADERS,
      ["王小明", "Ming", "一年級", "0912345678", ""],
      ["陳小美", "Amy", "三年級", "0922333444", "蛋奶素"],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(rows);

    worksheet["!cols"] = [
      { wch: 16 },
      { wch: 16 },
      { wch: 12 },
      { wch: 18 },
      { wch: 18 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "學生匯入範本");
    XLSX.writeFile(workbook, `${camp.name || "營隊"}_學生匯入範本.xlsx`);
  }

  function openImportPicker() {
    setErrorMessage("");
    setSuccessMessage("");
    fileInputRef.current?.click();
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    try {
      setErrorMessage("");
      setSuccessMessage("");

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error("Excel 內沒有可讀取的工作表。");
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, {
        defval: "",
        raw: false,
      });

      if (rawRows.length === 0) {
        throw new Error("Excel 內沒有學生資料。");
      }

      const parsedRows = rawRows.map((raw, index) => {
        const chineseName = normalizeText(raw["中文姓名"]);
        const englishName = normalizeText(raw["英文姓名"]);
        const gradeText = normalizeText(raw["年級"]);
        const grade = GRADE_IMPORT_MAP[gradeText] || "";
        const phone = normalizePhone(raw["聯絡電話"]);
        const vegetarianNote = normalizeText(raw["素食備註"]);
        const errors = [];

        if (!chineseName) {
          errors.push("缺少中文姓名");
        }

        if (!gradeText) {
          errors.push("缺少年級");
        } else if (!grade) {
          errors.push(`無法辨識年級「${gradeText}」`);
        }

        return {
          rowNumber: index + 2,
          chinese_name: chineseName,
          english_name: englishName,
          grade,
          gradeText,
          parent_phone: phone,
          vegetarian_note: vegetarianNote,
          errors,
        };
      });

      setImportRows(parsedRows);
      setImportFileName(file.name);
      setIsImportOpen(true);
    } catch (error) {
      console.error("讀取 Excel 失敗：", error);
      setErrorMessage(`讀取 Excel 失敗：${error.message}`);
    }
  }

  async function confirmImport() {
    if (validImportRows.length === 0) {
      setErrorMessage("目前沒有可匯入的學生資料。");
      return;
    }

    if (invalidImportRows.length > 0) {
      setErrorMessage("請先修正 Excel 中標示錯誤的資料列，再重新上傳。");
      return;
    }

    try {
      setIsImporting(true);
      setErrorMessage("");
      setSuccessMessage("");

      const now = new Date().toISOString();

      const payload = validImportRows.map((row) => ({
        camp_id: camp.id,
        chinese_name: row.chinese_name,
        english_name: row.english_name || null,
        grade: row.grade,
        parent_phone: row.parent_phone || null,
        vegetarian_note: row.vegetarian_note || null,
        updated_at: now,
      }));

      const { data, error } = await supabase
        .from("camp_students")
        .insert(payload)
        .select();

      if (error) throw error;

      setStudents((current) => [...current, ...(data ?? [])]);
      setIsImportOpen(false);
      setImportRows([]);
      setImportFileName("");
      setSuccessMessage(`已成功匯入 ${data?.length ?? payload.length} 位學生。`);
    } catch (error) {
      console.error("批次匯入學生失敗：", error);
      setErrorMessage(`匯入失敗：${error.message}`);
    } finally {
      setIsImporting(false);
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

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            className="campSecondaryButton"
            onClick={downloadTemplate}
          >
            ↓ 下載匯入範本
          </button>

          <button
            type="button"
            className="campSecondaryButton"
            onClick={openImportPicker}
          >
            ↑ 批次匯入 Excel
          </button>

          <button
            type="button"
            className="campPrimaryButton"
            onClick={openCreateForm}
          >
            ＋ 新增學生
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportFile}
            style={{ display: "none" }}
          />
        </div>
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

      {successMessage && (
        <div className="campMessage campMessage--success">
          {successMessage}
        </div>
      )}

      <div className="campStudentsTableWrap">
        <table className="campStudentsTable">
          <thead>
            <tr>
              <th>中文姓名</th>
              <th>英文姓名</th>
              <th>年級</th>
              <th>學校</th>
              <th>家長稱謂</th>
              <th>聯絡電話</th>
              <th>素食備註</th>
              <th className="campStudentsTable__actions">操作</th>
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="8" className="campStudentsTable__empty">
                  正在讀取學生資料……
                </td>
              </tr>
            ) : sortedStudents.length === 0 ? (
              <tr>
                <td colSpan="8" className="campStudentsTable__empty">
                  目前尚未加入學生。
                </td>
              </tr>
            ) : (
              sortedStudents.map((student) => (
                <tr key={student.id}>
                  <td className="campStudentsTable__name">
                    {student.chinese_name}
                  </td>
                  <td>{student.english_name || "—"}</td>
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
                <span>中文姓名 *</span>
                <input
                  type="text"
                  name="chinese_name"
                  value={formData.chinese_name}
                  onChange={handleChange}
                  autoFocus
                />
              </label>

              <label className="campForm__field">
                <span>英文姓名</span>
                <input
                  type="text"
                  name="english_name"
                  value={formData.english_name}
                  onChange={handleChange}
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
                  <span>聯絡電話</span>
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

      {isImportOpen && (
        <div
          className="campModalBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isImporting) {
              setIsImportOpen(false);
            }
          }}
        >
          <div
            className="campModal"
            role="dialog"
            aria-modal="true"
            style={{ width: "min(1000px, calc(100vw - 40px))" }}
          >
            <div className="campModal__header">
              <div>
                <p className="campEyebrow">IMPORT STUDENTS</p>
                <h2>確認 Excel 匯入資料</h2>
                <p style={{ margin: "6px 0 0", opacity: 0.65 }}>
                  {importFileName}
                </p>
              </div>

              <button
                type="button"
                className="campModal__close"
                onClick={() => setIsImportOpen(false)}
                disabled={isImporting}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "0 24px 24px" }}>
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                  marginBottom: "16px",
                }}
              >
                <span>共 {importRows.length} 筆</span>
                <strong>可匯入 {validImportRows.length} 筆</strong>
                {invalidImportRows.length > 0 && (
                  <strong style={{ color: "#a24f45" }}>
                    錯誤 {invalidImportRows.length} 筆
                  </strong>
                )}
              </div>

              <div
                className="campStudentsTableWrap"
                style={{ maxHeight: "55vh", overflow: "auto" }}
              >
                <table className="campStudentsTable">
                  <thead>
                    <tr>
                      <th>Excel列</th>
                      <th>中文姓名</th>
                      <th>英文姓名</th>
                      <th>年級</th>
                      <th>聯絡電話</th>
                      <th>素食備註</th>
                      <th>檢查</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{row.chinese_name || "—"}</td>
                        <td>{row.english_name || "—"}</td>
                        <td>
                          {row.grade ? getGradeLabel(row.grade) : row.gradeText || "—"}
                        </td>
                        <td>{row.parent_phone || "—"}</td>
                        <td>{row.vegetarian_note || "—"}</td>
                        <td>
                          {row.errors.length === 0
                            ? "✓"
                            : row.errors.join("、")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {invalidImportRows.length > 0 && (
                <div
                  className="campMessage campMessage--error"
                  style={{ marginTop: "16px" }}
                >
                  有錯誤資料時不會匯入。請修正 Excel 後重新上傳。
                </div>
              )}

              <div className="campModal__actions" style={{ marginTop: "18px" }}>
                <button
                  type="button"
                  className="campSecondaryButton"
                  onClick={() => setIsImportOpen(false)}
                  disabled={isImporting}
                >
                  取消
                </button>

                <button
                  type="button"
                  className="campPrimaryButton"
                  onClick={confirmImport}
                  disabled={
                    isImporting ||
                    validImportRows.length === 0 ||
                    invalidImportRows.length > 0
                  }
                >
                  {isImporting
                    ? "匯入中…"
                    : `確認匯入 ${validImportRows.length} 位學生`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CampStudentsPanel;