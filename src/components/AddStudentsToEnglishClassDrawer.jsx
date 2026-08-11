import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

function AddStudentsToEnglishClassDrawer({
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
    if (classItem?.id) {
      loadStudents();
    }
  }, [classItem?.id]);

  async function loadStudents() {
    try {
      setIsLoading(true);

      const [
        studentsResult,
        existingResult,
      ] = await Promise.all([
        supabase
          .from("students")
          .select(
            `
              id,
              student_no,
              chinese_name,
              english_name,
              school,
              current_grade
            `
          )
          .eq("record_scope", "NORMAL")
          .eq("student_status", "ACTIVE")
          .order("current_grade")
          .order("chinese_name"),

        supabase
          .from("english_class_students")
          .select("student_id")
          .eq("english_class_id", classItem.id)
          .eq("status", "ACTIVE"),
      ]);

      if (studentsResult.error) {
        throw studentsResult.error;
      }

      if (existingResult.error) {
        throw existingResult.error;
      }

      setStudents(studentsResult.data || []);

      setExistingStudentIds(
        (existingResult.data || []).map(
          (item) => item.student_id
        )
      );
    } catch (error) {
      console.error(
        "讀取美語班學生選單失敗：",
        error
      );

      window.alert(
        `讀取學生資料失敗：${error.message}`
      );
    } finally {
      setIsLoading(false);
    }
  }

  function toggleStudent(studentId) {
    if (existingStudentIds.includes(studentId)) {
      return;
    }

    setSelectedIds((currentIds) => {
      if (currentIds.includes(studentId)) {
        return currentIds.filter(
          (id) => id !== studentId
        );
      }

      return [...currentIds, studentId];
    });
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

  async function addStudents() {
    if (selectedIds.length === 0) {
      return;
    }

    const today = new Date()
      .toISOString()
      .slice(0, 10);

    const inputDate = window.prompt(
      `請確認加入「${classItem.class_name}」的日期：\n格式：YYYY-MM-DD`,
      classItem.start_date || today
    );

    if (inputDate === null) {
      return;
    }

    const joinedAt = inputDate.trim();

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(joinedAt)
    ) {
      window.alert(
        "日期格式錯誤，請使用 YYYY-MM-DD。"
      );

      return;
    }

    try {
      setIsSaving(true);

      const payload = selectedIds.map(
        (studentId) => ({
          english_class_id: classItem.id,
          student_id: studentId,
          joined_at: joinedAt,
          left_at: null,
          status: "ACTIVE",
          note: null,
          updated_at: new Date().toISOString(),
        })
      );

      const { error } = await supabase
        .from("english_class_students")
        .insert(payload);

      if (error) {
        throw error;
      }

      if (onAdded) {
        await onAdded();
      }

      onClose();

      window.alert(
        `已加入 ${selectedIds.length} 位學生至「${classItem.class_name}」。`
      );
    } catch (error) {
      console.error(
        "加入美語班學生失敗：",
        error
      );

      window.alert(
        `加入學生失敗：${error.message}`
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="englishStudentDrawer__backdrop"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !isSaving
        ) {
          onClose();
        }
      }}
    >
      <aside className="englishStudentDrawer">
        <header className="englishStudentDrawer__header">
          <div>
            <p>ADD STUDENTS</p>

            <h2>加入學生</h2>

            <span>
              加入至 {classItem?.class_name}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="關閉"
          >
            ×
          </button>
        </header>

        <div className="englishStudentDrawer__body">
          <div className="englishStudentDrawer__search">
            <span aria-hidden="true">
              ⌕
            </span>

            <input
              type="search"
              value={searchText}
              placeholder="搜尋姓名、學號、學校或年級..."
              onChange={(event) =>
                setSearchText(
                  event.target.value
                )
              }
            />
          </div>

          <div className="englishStudentDrawer__summary">
            <span>
              找到 {filteredStudents.length} 位學生
            </span>

            <strong>
              已選 {selectedIds.length} 位
            </strong>
          </div>

          {isLoading ? (
            <div className="englishStudentDrawer__empty">
              正在讀取學生資料……
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="englishStudentDrawer__empty">
              找不到符合條件的學生。
            </div>
          ) : (
            <div className="englishStudentDrawer__list">
              {filteredStudents.map(
                (student) => {
                  const selected =
                    selectedIds.includes(
                      student.id
                    );

                  const alreadyJoined =
                    existingStudentIds.includes(
                      student.id
                    );

                  return (
                    <button
                      key={student.id}
                      type="button"
                      disabled={alreadyJoined}
                      className={
                        alreadyJoined
                          ? "englishStudentDrawer__student englishStudentDrawer__student--disabled"
                          : selected
                            ? "englishStudentDrawer__student englishStudentDrawer__student--selected"
                            : "englishStudentDrawer__student"
                      }
                      onClick={() =>
                        toggleStudent(
                          student.id
                        )
                      }
                    >
                      <span
                        className="englishStudentDrawer__checkbox"
                        aria-hidden="true"
                      >
                        {alreadyJoined
                          ? "✓"
                          : selected
                            ? "✓"
                            : ""}
                      </span>

                      <span className="englishStudentDrawer__studentInfo">
                        <strong>
                          {
                            student.chinese_name
                          }
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

                      {alreadyJoined && (
                        <small className="englishStudentDrawer__already">
                          已在此班
                        </small>
                      )}
                    </button>
                  );
                }
              )}
            </div>
          )}
        </div>

        <footer className="englishStudentDrawer__footer">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
          >
            取消
          </button>

          <button
            type="button"
            className="englishStudentDrawer__confirm"
            disabled={
              selectedIds.length === 0 ||
              isSaving
            }
            onClick={addStudents}
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

export default AddStudentsToEnglishClassDrawer;