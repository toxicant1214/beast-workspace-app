import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

const COLUMN_MAP = {
  "中文姓名": "chinese_name",
  "英文姓名": "english_name",
  "身分證字號": "national_id",
  "生日": "birthday",
  "性別": "gender",
  "學校": "school",
  "目前年級": "current_grade",
  "入班日期": "enrollment_date",
  "家長一稱謂": "primary_parent_title",
  "家長一電話": "primary_parent_phone",
  "家長二稱謂": "secondary_parent_title",
  "家長二電話": "secondary_parent_phone",
  "備註": "note",
};

const REQUIRED_FIELDS = [
  {
    key: "chinese_name",
    label: "中文姓名",
  },
  {
    key: "school",
    label: "學校",
  },
  {
    key: "current_grade",
    label: "目前年級",
  },
  {
    key: "primary_parent_title",
    label: "家長一稱謂",
  },
  {
    key: "primary_parent_phone",
    label: "家長一電話",
  },
];

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeNationalId(value) {
  return normalizeText(value)
    .replace(/\s/g, "")
    .toUpperCase();
}

function normalizePhone(value) {
  return normalizeText(value);
}

function normalizePhoneForComparison(value) {
  return normalizeText(value).replace(/[^\d]/g, "");
}

function excelDateToString(value) {
  if (!value) return "";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  const text = normalizeText(value);

  if (!text) return "";

  const normalizedText = text
    .replace(/[年月]/g, "-")
    .replace(/日/g, "")
    .replace(/\//g, "-")
    .replace(/\./g, "-");

  const match = normalizedText.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/
  );

  if (!match) return text;

  const [, year, month, day] = match;

  return `${year}-${String(month).padStart(
    2,
    "0"
  )}-${String(day).padStart(2, "0")}`;
}

function normalizeGender(value) {
  const text = normalizeText(value);

  if (!text) return "";

  if (["男", "男性", "M", "MALE"].includes(text.toUpperCase())) {
    return "男";
  }

  if (["女", "女性", "F", "FEMALE"].includes(text.toUpperCase())) {
    return "女";
  }

  return text;
}

function mapExcelRow(row, rowIndex) {
  const mappedRow = {
    row_number: rowIndex + 2,
    chinese_name: "",
    english_name: "",
    national_id: "",
    birthday: "",
    gender: "",
    school: "",
    current_grade: "",
    enrollment_date: "",
    primary_parent_title: "",
    primary_parent_phone: "",
    secondary_parent_title: "",
    secondary_parent_phone: "",
    note: "",
  };

  Object.entries(row).forEach(([columnName, value]) => {
    const normalizedColumnName = normalizeText(columnName)
      .replace(/^★\s*/, "")
      .replace(/\s+/g, "");

    const matchedColumn = Object.keys(COLUMN_MAP).find(
      (key) => key.replace(/\s+/g, "") === normalizedColumnName
    );

    if (!matchedColumn) return;

    const field = COLUMN_MAP[matchedColumn];
    mappedRow[field] = value;
  });

  return {
    ...mappedRow,
    chinese_name: normalizeText(mappedRow.chinese_name),
    english_name: normalizeText(mappedRow.english_name),
    national_id: normalizeNationalId(mappedRow.national_id),
    birthday: excelDateToString(mappedRow.birthday),
    gender: normalizeGender(mappedRow.gender),
    school: normalizeText(mappedRow.school),
    current_grade: normalizeText(mappedRow.current_grade),
    enrollment_date: excelDateToString(
      mappedRow.enrollment_date
    ),
    primary_parent_title: normalizeText(
      mappedRow.primary_parent_title
    ),
    primary_parent_phone: normalizePhone(
      mappedRow.primary_parent_phone
    ),
    secondary_parent_title: normalizeText(
      mappedRow.secondary_parent_title
    ),
    secondary_parent_phone: normalizePhone(
      mappedRow.secondary_parent_phone
    ),
    note: normalizeText(mappedRow.note),
  };
}

function ImportStudentsDialog({
  open,
  onClose,
  onImported,
}) {
  const fileInputRef = useRef(null);

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importAsTest, setImportAsTest] = useState(true);
  const [recordScope, setRecordScope] = useState("NORMAL");

  const analyzedRows = useMemo(() => {
    const nationalIdCount = new Map();

    rows.forEach((row) => {
      if (!row.national_id) return;

      nationalIdCount.set(
        row.national_id,
        (nationalIdCount.get(row.national_id) || 0) + 1
      );
    });

    return rows.map((row) => {
      const errors = [];
      const warnings = [];

      REQUIRED_FIELDS.forEach((field) => {
        if (!normalizeText(row[field.key])) {
          errors.push(`缺少${field.label}`);
        }
      });

      if (
        row.national_id &&
        nationalIdCount.get(row.national_id) > 1
      ) {
        errors.push("Excel 內身分證字號重複");
      }

      if (
        row.primary_parent_phone &&
        normalizePhoneForComparison(
          row.primary_parent_phone
        ).length < 9
      ) {
        warnings.push("主要家長電話格式可能不完整");
      }

      return {
        ...row,
        errors,
        warnings,
        status:
          errors.length > 0
            ? "ERROR"
            : warnings.length > 0
              ? "WARNING"
              : "READY",
      };
    });
  }, [rows]);

  const summary = useMemo(() => {
    return analyzedRows.reduce(
      (result, row) => {
        result.total += 1;

        if (row.status === "ERROR") {
          result.error += 1;
        } else if (row.status === "WARNING") {
          result.warning += 1;
          result.ready += 1;
        } else {
          result.ready += 1;
        }

        return result;
      },
      {
        total: 0,
        ready: 0,
        warning: 0,
        error: 0,
      }
    );
  }, [analyzedRows]);

  if (!open) return null;

  function resetImport() {
    setFileName("");
    setRows([]);
    setErrorMessage("");
    setIsReading(false);
    setIsImporting(false);
    setImportAsTest(true);
    setRecordScope("NORMAL");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleClose() {
    if (isReading || isImporting) return;

    resetImport();
    onClose();
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    const fileExtension = file.name
      .split(".")
      .pop()
      ?.toLowerCase();

    if (!["xlsx", "xls"].includes(fileExtension)) {
      setErrorMessage(
        "請選擇 Excel 檔案（.xlsx 或 .xls）。"
      );
      setFileName("");
      setRows([]);
      return;
    }

    try {
      setIsReading(true);
      setErrorMessage("");
      setFileName(file.name);

      const arrayBuffer = await file.arrayBuffer();

      const workbook = XLSX.read(arrayBuffer, {
        type: "array",
        cellDates: true,
      });

      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error("Excel 中沒有可讀取的工作表。");
      }

      const worksheet = workbook.Sheets[firstSheetName];

      const excelRows = XLSX.utils.sheet_to_json(
        worksheet,
        {
          defval: "",
          raw: true,
        }
      );

      if (excelRows.length === 0) {
        throw new Error("Excel 中沒有學生資料。");
      }

      const mappedRows = excelRows
        .map((row, index) => mapExcelRow(row, index))
        .filter((row) =>
          Object.entries(row).some(
            ([key, value]) =>
              key !== "row_number" &&
              normalizeText(value) !== ""
          )
        );

      if (mappedRows.length === 0) {
        throw new Error(
          "找不到可匯入的學生資料，請確認欄位名稱是否使用系統範本。"
        );
      }

      setRows(mappedRows);
    } catch (error) {
      console.error("讀取 Excel 失敗：", error);

      setRows([]);
      setErrorMessage(
        error.message ||
          "Excel 讀取失敗，請確認檔案格式。"
      );
    } finally {
      setIsReading(false);
    }
  }

  async function checkDatabaseDuplicates() {
    const nationalIds = analyzedRows
      .map((row) => row.national_id)
      .filter(Boolean);

    if (nationalIds.length === 0) {
      return new Set();
    }

    const { data, error } = await supabase
      .from("students")
      .select("national_id")
      .in("national_id", nationalIds);

    if (error) {
      throw new Error(
        `檢查既有學生失敗：${error.message}`
      );
    }

    return new Set(
      (data || [])
        .map((student) =>
          normalizeNationalId(student.national_id)
        )
        .filter(Boolean)
    );
  }

  async function handleImport() {
    if (summary.error > 0) {
      alert(
        `目前有 ${summary.error} 筆錯誤資料，請先修正 Excel 後重新選擇檔案。`
      );
      return;
    }

    if (analyzedRows.length === 0) {
      alert("目前沒有可匯入的資料。");
      return;
    }

    if (!importAsTest) {
      const confirmed = window.confirm(
        "你目前選擇匯入為正式資料。正式學生不可直接永久刪除，確定要繼續嗎？"
      );

      if (!confirmed) return;
    }

    try {
      setIsImporting(true);
      setErrorMessage("");

      const existingNationalIds =
        await checkDatabaseDuplicates();

      const duplicatedRows = analyzedRows.filter(
        (row) =>
          row.national_id &&
          existingNationalIds.has(row.national_id)
      );

      if (duplicatedRows.length > 0) {
        const duplicatedNames = duplicatedRows
          .slice(0, 5)
          .map(
            (row) =>
              `第 ${row.row_number} 列 ${row.chinese_name}`
          )
          .join("、");

        throw new Error(
          `有 ${duplicatedRows.length} 筆身分證字號已存在於系統：${duplicatedNames}${
            duplicatedRows.length > 5 ? "……" : ""
          }`
        );
      }

      const insertData = analyzedRows.map((row) => ({
        is_test: importAsTest,
        record_scope: recordScope,
        pickup_enabled: true,
        chinese_name: row.chinese_name,
        english_name: row.english_name || null,
        national_id: row.national_id || null,
        birthday: row.birthday || null,
        gender: row.gender || null,
        school: row.school,
        current_grade: row.current_grade,
        enrollment_date: row.enrollment_date || null,
        primary_parent_title:
          row.primary_parent_title,
        primary_parent_phone:
          row.primary_parent_phone,
        secondary_parent_title:
          row.secondary_parent_title || null,
        secondary_parent_phone:
          row.secondary_parent_phone || null,
        student_status: "ACTIVE",
        note: row.note || null,
      }));

      const { error } = await supabase
        .from("students")
        .insert(insertData);

      if (error) {
        throw error;
      }

      const dataTypeLabel = importAsTest ? "測試資料" : "正式資料";
      const scopeLabel =
        recordScope === "PICKUP_ONLY"
          ? "接送專用學生"
          : "一般學生";

      alert(
        `匯入完成：成功新增 ${insertData.length} 位${scopeLabel}（${dataTypeLabel}）。`
      );

      resetImport();
      await onImported();
    } catch (error) {
      console.error("學生匯入失敗：", error);

      if (error.code === "23505") {
        setErrorMessage(
          "匯入失敗：資料中有重複的身分證字號，或與系統既有資料重複。"
        );
      } else {
        setErrorMessage(
          error.message ||
            "學生匯入失敗，請稍後再試。"
        );
      }
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="drawerBackdrop">
      <div className="drawer importStudentsDialog">
        <div className="drawerHeader">
          <div>
            <p className="eyebrow">IMPORT STUDENTS</p>
            <h2>Excel 匯入學生</h2>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="關閉"
            disabled={isReading || isImporting}
          >
            ×
          </button>
        </div>

        <div className="drawerSection">
          <p className="drawerSectionTitle">
            匯入資料類型
          </p>

          <div className="importTypeOptions">
            <label
              className={
                importAsTest ? "importTypeCard active" : "importTypeCard"
              }
            >
              <input
                type="radio"
                name="importType"
                checked={importAsTest}
                onChange={() => setImportAsTest(true)}
                disabled={isImporting}
              />

              <span>
                <strong>測試資料</strong>
                <small>
                  目前建議，可在測試完成後刪除
                </small>
              </span>
            </label>

            <label
              className={
                !importAsTest ? "importTypeCard active" : "importTypeCard"
              }
            >
              <input
                type="radio"
                name="importType"
                checked={!importAsTest}
                onChange={() => setImportAsTest(false)}
                disabled={isImporting}
              />

              <span>
                <strong>正式資料</strong>
                <small>
                  正式學生不可直接永久刪除
                </small>
              </span>
            </label>
          </div>
        </div>

        <div className="drawerSection">
          <p className="drawerSectionTitle">
            學生用途
          </p>

          <div className="importTypeOptions">
            <label
              className={
                recordScope === "NORMAL"
                  ? "importTypeCard active"
                  : "importTypeCard"
              }
            >
              <input
                type="radio"
                name="recordScope"
                checked={recordScope === "NORMAL"}
                onChange={() => setRecordScope("NORMAL")}
                disabled={isImporting}
              />

              <span>
                <strong>一般學生</strong>
                <small>平時顯示於學生資料中心，預設需要接送</small>
              </span>
            </label>

            <label
              className={
                recordScope === "PICKUP_ONLY"
                  ? "importTypeCard active"
                  : "importTypeCard"
              }
            >
              <input
                type="radio"
                name="recordScope"
                checked={recordScope === "PICKUP_ONLY"}
                onChange={() => setRecordScope("PICKUP_ONLY")}
                disabled={isImporting}
              />

              <span>
                <strong>接送專用學生</strong>
                <small>平時隱藏，可從「接送專用」篩選與接送管理查看</small>
              </span>
            </label>
          </div>
        </div>

        <div className="drawerSection">
          <p className="drawerSectionTitle">
            選擇學生名單
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            hidden
          />

          <button
            type="button"
            className="excelUploadBox"
            onClick={openFilePicker}
            disabled={isReading || isImporting}
          >
            <span className="excelUploadIcon">▤</span>

            <strong>
              {isReading
                ? "正在讀取 Excel..."
                : fileName || "點擊選擇 Excel"}
            </strong>

            <small>
              支援 .xlsx 與 .xls 檔案
            </small>
          </button>

          {errorMessage && (
            <div className="importErrorMessage">
              {errorMessage}
            </div>
          )}
        </div>

        {analyzedRows.length > 0 && (
          <>
            <div className="drawerSection">
              <p className="drawerSectionTitle">
                匯入摘要
              </p>

              <div className="importSummaryGrid">
                <div>
                  <span>總筆數</span>
                  <strong>{summary.total}</strong>
                </div>

                <div>
                  <span>可匯入</span>
                  <strong>{summary.ready}</strong>
                </div>

                <div>
                  <span>提醒</span>
                  <strong>{summary.warning}</strong>
                </div>

                <div>
                  <span>錯誤</span>
                  <strong>{summary.error}</strong>
                </div>
              </div>
            </div>

            <div className="drawerSection">
              <p className="drawerSectionTitle">
                資料預覽
              </p>

              <div className="importPreviewTableWrap">
                <table className="importPreviewTable">
                  <thead>
                    <tr>
                      <th>列</th>
                      <th>狀態</th>
                      <th>中文姓名</th>
                      <th>學校</th>
                      <th>年級</th>
                      <th>家長電話</th>
                      <th>檢查結果</th>
                    </tr>
                  </thead>

                  <tbody>
                    {analyzedRows.map((row) => (
                      <tr key={row.row_number}>
                        <td>{row.row_number}</td>

                        <td>
                          {row.status === "ERROR"
                            ? "錯誤"
                            : row.status === "WARNING"
                              ? "提醒"
                              : "可匯入"}
                        </td>

                        <td>{row.chinese_name || "—"}</td>
                        <td>{row.school || "—"}</td>
                        <td>{row.current_grade || "—"}</td>

                        <td>
                          {row.primary_parent_phone || "—"}
                        </td>

                        <td>
                          {row.errors.length > 0
                            ? row.errors.join("、")
                            : row.warnings.length > 0
                              ? row.warnings.join("、")
                              : "資料完整"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <div className="drawerActions">
          {rows.length > 0 && (
            <button
              type="button"
              onClick={resetImport}
              disabled={isReading || isImporting}
            >
              重新選擇
            </button>
          )}

          <button
            type="button"
            onClick={handleClose}
            disabled={isReading || isImporting}
          >
            取消
          </button>

          {rows.length > 0 && (
            <button
              type="button"
              className="primary"
              onClick={handleImport}
              disabled={
                isReading ||
                isImporting ||
                summary.error > 0
              }
            >
              {isImporting
                ? "匯入中..."
                : `匯入 ${summary.ready} 位${
                    recordScope === "PICKUP_ONLY"
                      ? "接送專用學生"
                      : "一般學生"
                  }`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ImportStudentsDialog;