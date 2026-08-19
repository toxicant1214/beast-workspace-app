import { useEffect, useMemo, useState } from "react";
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

function getGradeLabel(value) {
  return (
    GRADE_OPTIONS.find((item) => item.value === value)?.label ||
    value ||
    "—"
  );
}

function CampPeriodStudentsModal({
  camp,
  period,
  isOpen,
  onClose,
  onSaved,
}) {
  const [students, setStudents] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isOpen || !period) return;
    loadData();
  }, [isOpen, period?.id]);

  async function loadData() {
    try {
      setIsLoading(true);
      setErrorMessage("");
      setSearchTerm("");

      const [studentsResult, selectedResult] = await Promise.all([
        supabase
          .from("camp_students")
          .select("id, chinese_name, grade, school")
          .eq("camp_id", camp.id),

        supabase
          .from("camp_period_students")
          .select("student_id")
          .eq("camp_id", camp.id)
          .eq("period_id", period.id),
      ]);

      if (studentsResult.error) throw studentsResult.error;
      if (selectedResult.error) throw selectedResult.error;

      setStudents(studentsResult.data ?? []);
      setSelectedIds(
        new Set(
          (selectedResult.data ?? []).map((row) => row.student_id)
        )
      );
    } catch (error) {
      console.error("讀取梯次學生失敗：", error);
      setErrorMessage(`讀取學生失敗：${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  const sortedStudents = useMemo(() => {
    let result = [...students].sort((a, b) => {
      const gradeDiff =
        (GRADE_ORDER[a.grade] ?? 999) -
        (GRADE_ORDER[b.grade] ?? 999);

      if (gradeDiff !== 0) return gradeDiff;

      return String(a.chinese_name || "").localeCompare(
        String(b.chinese_name || ""),
        "zh-Hant"
      );
    });

    const keyword = searchTerm.trim().toLowerCase();

    if (keyword) {
      result = result.filter((student) => {
        return (
          String(student.chinese_name || "")
            .toLowerCase()
            .includes(keyword) ||
          String(student.school || "")
            .toLowerCase()
            .includes(keyword) ||
          getGradeLabel(student.grade)
            .toLowerCase()
            .includes(keyword)
        );
      });
    }

    return result;
  }, [students, searchTerm]);

  function toggleStudent(studentId) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }

      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      sortedStudents.forEach((student) => next.add(student.id));
      return next;
    });
  }

  function clearAll() {
    setSelectedIds(new Set());
  }

  async function handleSave() {
    try {
      setIsSaving(true);
      setErrorMessage("");

      const { error: deleteError } = await supabase
        .from("camp_period_students")
        .delete()
        .eq("camp_id", camp.id)
        .eq("period_id", period.id);

      if (deleteError) throw deleteError;

      const ids = Array.from(selectedIds);

      if (ids.length > 0) {
        const rows = ids.map((studentId) => ({
          camp_id: camp.id,
          period_id: period.id,
          student_id: studentId,
        }));

        const { error: insertError } = await supabase
          .from("camp_period_students")
          .insert(rows);

        if (insertError) throw insertError;
      }

      onSaved(ids.length);
      onClose();
    } catch (error) {
      console.error("儲存梯次學生失敗：", error);
      setErrorMessage(`儲存失敗：${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen || !period) return null;

  return (
    <div className="campModalBackdrop">
      <div className="campModal campModal--wide">
        <div className="campModal__header">
          <div>
            <p className="campEyebrow">PERIOD STUDENTS</p>
            <h2>{period.name}｜選擇學生</h2>
            <p className="campPeriodStudentsModal__sub">
              從學生總名單勾選此梯次參加者。
            </p>
          </div>

          <button
            type="button"
            className="campModal__close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="campPeriodStudentsModal__toolbar">
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="搜尋姓名、年級或學校"
          />

          <div>
            <button
              type="button"
              className="campSecondaryButton campSecondaryButton--small"
              onClick={selectAllVisible}
            >
              全選目前名單
            </button>

            <button
              type="button"
              className="campSecondaryButton campSecondaryButton--small"
              onClick={clearAll}
            >
              清除全部
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="campMessage campMessage--error">
            {errorMessage}
          </div>
        )}

        <div className="campPeriodStudentsModal__list">
          {isLoading ? (
            <div className="campPeriodStudentsModal__empty">
              正在讀取學生……
            </div>
          ) : sortedStudents.length === 0 ? (
            <div className="campPeriodStudentsModal__empty">
              目前沒有符合條件的學生。
            </div>
          ) : (
            sortedStudents.map((student) => (
              <label
                key={student.id}
                className={[
                  "campPeriodStudentRow",
                  selectedIds.has(student.id)
                    ? "is-selected"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(student.id)}
                  onChange={() => toggleStudent(student.id)}
                />

                <span className="campPeriodStudentRow__grade">
                  {getGradeLabel(student.grade)}
                </span>

                <strong>{student.chinese_name}</strong>

                <span className="campPeriodStudentRow__school">
                  {student.school || "—"}
                </span>
              </label>
            ))
          )}
        </div>

        <div className="campPeriodStudentsModal__footer">
          <strong>已選 {selectedIds.size} 人</strong>

          <div>
            <button
              type="button"
              className="campSecondaryButton"
              onClick={onClose}
              disabled={isSaving}
            >
              取消
            </button>

            <button
              type="button"
              className="campPrimaryButton"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "儲存中…" : "儲存名單"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CampPeriodStudentsModal;