import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

function AddStudentsToClassDrawer({
  classItem,
  onClose,
  onAdded,
}) {
  const [students, setStudents] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [existingStudentIds, setExistingStudentIds] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadStudents();
  }, [classItem?.id]);

  async function loadStudents() {
    if (!classItem?.id) return;

    try {
      setIsLoading(true);

      const [
        { data: studentData, error: studentError },
        { data: classStudentData, error: classStudentError },
      ] = await Promise.all([
        supabase
          .from("students")
          .select(
            "id, student_no, chinese_name, english_name, school, current_grade"
          )
          .eq("record_scope", "NORMAL")
          .eq("student_status", "ACTIVE")
          .order("current_grade")
          .order("chinese_name"),

        supabase
          .from("class_students")
          .select("student_id")
          .eq("class_id", classItem.id)
          .eq("status", "ACTIVE"),
      ]);

      if (studentError) {
        throw studentError;
      }

      if (classStudentError) {
        throw classStudentError;
      }

      const currentIds = (classStudentData || []).map(
        (item) => item.student_id
      );

      setExistingStudentIds(currentIds);

      const availableStudents = (studentData || []).filter(
        (student) => !currentIds.includes(student.id)
      );

      setStudents(availableStudents);
    } catch (error) {
      console.error("讀取學生名單失敗：", error);

      window.alert(
        `讀取學生名單失敗：${error.message}`
      );
    } finally {
      setIsLoading(false);
    }
  }

  function toggleStudent(studentId) {
    if (isSaving) return;

    setSelectedIds((currentIds) => {
      if (currentIds.includes(studentId)) {
        return currentIds.filter(
          (id) => id !== studentId
        );
      }

      return [...currentIds, studentId];
    });
  }

  async function handleAddStudents() {
    if (
      !classItem?.id ||
      selectedIds.length === 0 ||
      isSaving
    ) {
      return;
    }

    const duplicatedIds = selectedIds.filter(
      (studentId) =>
        existingStudentIds.includes(studentId)
    );

    if (duplicatedIds.length > 0) {
      window.alert(
        "部分學生已經在這個班級中，請重新整理後再試。"
      );

      await loadStudents();
      setSelectedIds([]);
      return;
    }

    const joinedAt = new Date()
      .toISOString()
      .slice(0, 10);

    const insertData = selectedIds.map(
      (studentId) => ({
        class_id: classItem.id,
        student_id: studentId,
        joined_at: joinedAt,
        left_at: null,
        status: "ACTIVE",
        note: null,
      })
    );

    try {
      setIsSaving(true);

      const { error } = await supabase
        .from("class_students")
        .insert(insertData);

      if (error) {
        throw error;
      }

      window.alert(
        `已成功加入 ${selectedIds.length} 位學生至「${classItem.class_name}」。`
      );

      if (onAdded) {
        await onAdded();
      }

      onClose();
    } catch (error) {
      console.error("加入班級學生失敗：", error);

      window.alert(
        `加入學生失敗：${error.message}`
      );
    } finally {
      setIsSaving(false);
    }
  }

  const filteredStudents = useMemo(() => {
    const keyword = searchText
      .trim()
      .toLowerCase();

    if (!keyword) {
      return students;
    }

    return students.filter((student) => {
      return (
        student.chinese_name
          ?.toLowerCase()
          .includes(keyword) ||
        student.english_name
          ?.toLowerCase()
          .includes(keyword) ||
        student.student_no
          ?.toLowerCase()
          .includes(keyword) ||
        student.school
          ?.toLowerCase()
          .includes(keyword) ||
        student.current_grade
          ?.toLowerCase()
          .includes(keyword)
      );
    });
  }, [students, searchText]);

  return (
    <div
      className="classStudentDrawer__backdrop"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !isSaving
        ) {
          onClose();
        }
      }}
    >
      <aside className="classStudentDrawer">
        <header className="classStudentDrawer__header">
          <div>
            <p className="classDrawer__eyebrow">
              ADD STUDENTS
            </p>

            <h2>加入學生</h2>

            <p>
              加入至 {classItem?.class_name || "班級"}
            </p>
          </div>

          <button
            type="button"
            className="classStudentDrawer__close"
            onClick={onClose}
            aria-label="關閉"
            disabled={isSaving}
          >
            ×
          </button>
        </header>

        <div className="classStudentDrawer__body">
          <div className="classStudentDrawer__search">
            <span aria-hidden="true">⌕</span>

            <input
              type="search"
              value={searchText}
              placeholder="搜尋姓名、學號、學校或年級..."
              onChange={(event) =>
                setSearchText(event.target.value)
              }
              disabled={isSaving}
            />
          </div>

          <div className="classStudentDrawer__summary">
            <span>
              找到 {filteredStudents.length} 位學生
            </span>

            <strong>
              已選 {selectedIds.length} 位
            </strong>
          </div>

          {isLoading ? (
            <div className="classStudentDrawer__empty">
              正在讀取學生資料……
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="classStudentDrawer__empty">
              目前沒有可加入的學生。
            </div>
          ) : (
            <div className="classStudentDrawer__list">
              {filteredStudents.map((student) => {
                const selected =
                  selectedIds.includes(student.id);

                return (
                  <button
                    key={student.id}
                    type="button"
                    className={
                      selected
                        ? "classStudentDrawer__student classStudentDrawer__student--selected"
                        : "classStudentDrawer__student"
                    }
                    onClick={() =>
                      toggleStudent(student.id)
                    }
                    disabled={isSaving}
                  >
                    <span
                      className="classStudentDrawer__checkbox"
                      aria-hidden="true"
                    >
                      {selected ? "✓" : ""}
                    </span>

                    <span className="classStudentDrawer__studentInfo">
                      <strong>
                        {student.chinese_name}
                      </strong>

                      <small>
                        {[
                          student.current_grade,
                          student.school,
                          student.english_name,
                        ]
                          .filter(Boolean)
                          .join(" ・ ")}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <footer className="classStudentDrawer__footer">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
          >
            取消
          </button>

          <button
            type="button"
            className="classStudentDrawer__confirm"
            disabled={
              selectedIds.length === 0 ||
              isSaving
            }
            onClick={handleAddStudents}
          >
            {isSaving
              ? "加入中……"
              : `加入 ${selectedIds.length} 位學生`}
          </button>
        </footer>
      </aside>
    </div>
  );
}

export default AddStudentsToClassDrawer;