import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import AddStudentsToClassDrawer from "./AddStudentsToClassDrawer";

function formatDate(dateString) {
  if (!dateString) return "未設定";
  const [year, month, day] = dateString.split("-");
  if (!year || !month || !day) return dateString;
  return `${year}/${month}/${day}`;
}

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ClassDetailDrawer({ classItem, onClose, onEdit }) {
  const [isAddStudentsOpen, setIsAddStudentsOpen] = useState(false);
  const [classStudents, setClassStudents] = useState([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    if (classItem?.id) loadClassStudents();
  }, [classItem?.id]);

  if (!classItem) return null;

  async function loadClassStudents() {
    try {
      setIsLoadingStudents(true);
      const { data, error } = await supabase
        .from("class_students")
        .select(`
          id,
          student_id,
          joined_at,
          status,
          students (
            id,
            student_no,
            chinese_name,
            english_name,
            school,
            current_grade
          )
        `)
        .eq("class_id", classItem.id)
        .eq("status", "ACTIVE")
        .order("joined_at", { ascending: true });

      if (error) throw error;
      setClassStudents(data || []);
    } catch (error) {
      console.error("讀取班級學生失敗：", error);
      window.alert(`讀取班級學生失敗：${error.message}`);
      setClassStudents([]);
    } finally {
      setIsLoadingStudents(false);
    }
  }

  function openAddStudents() {
    setActiveMenuId(null);
    setIsAddStudentsOpen(true);
  }

  function closeAddStudents() {
    setIsAddStudentsOpen(false);
  }

  async function handleStudentsAdded() {
    await loadClassStudents();
  }

  function toggleStudentMenu(itemId) {
    setActiveMenuId((currentId) =>
      currentId === itemId ? null : itemId
    );
  }

  async function removeMistakenStudent(item) {
    const studentName = item.students?.chinese_name || "這位學生";
    const confirmed = window.confirm(
      `確定要將「${studentName}」從「${classItem.class_name}」移除嗎？\n\n此操作視為誤加，將永久刪除這筆班級紀錄，不會出現在學生學習歷程中。`
    );
    if (!confirmed) return;

    try {
      setProcessingId(item.id);
      setActiveMenuId(null);

      const { error } = await supabase
        .from("class_students")
        .delete()
        .eq("id", item.id);

      if (error) throw error;

      await loadClassStudents();
      window.alert(`已移除「${studentName}」，不會保留班級歷程。`);
    } catch (error) {
      console.error("移除誤加學生失敗：", error);
      window.alert(`移除失敗：${error.message}`);
    } finally {
      setProcessingId(null);
    }
  }

  async function leaveClass(item) {
    const studentName = item.students?.chinese_name || "這位學生";
    const today = getTodayString();
    const inputDate = window.prompt(
      `請輸入「${studentName}」退出「${classItem.class_name}」的日期：\n格式：YYYY-MM-DD`,
      today
    );

    if (inputDate === null) return;

    const leftAt = inputDate.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(leftAt)) {
      window.alert("日期格式錯誤，請使用 YYYY-MM-DD。");
      return;
    }

    if (item.joined_at && leftAt < item.joined_at) {
      window.alert("退出日期不可早於加入班級日期。");
      return;
    }

    const confirmed = window.confirm(
      `確定要讓「${studentName}」於 ${leftAt} 退出「${classItem.class_name}」嗎？\n\n這筆紀錄會保留，之後會顯示在學生的班級歷程中。`
    );

    if (!confirmed) return;

    try {
      setProcessingId(item.id);
      setActiveMenuId(null);

      const { error } = await supabase
        .from("class_students")
        .update({
          status: "LEFT",
          left_at: leftAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (error) throw error;

      await loadClassStudents();
      window.alert(`已將「${studentName}」設為退出班級，歷程已保留。`);
    } catch (error) {
      console.error("學生退出班級失敗：", error);
      window.alert(`退出班級失敗：${error.message}`);
    } finally {
      setProcessingId(null);
    }
  }

  async function transferClass(item) {
    const studentName = item.students?.chinese_name || "這位學生";

    try {
      setProcessingId(item.id);
      setActiveMenuId(null);

      const { data: targetClasses, error: classError } = await supabase
        .from("classes")
        .select("id, class_name, academic_year, term")
        .eq("course_type", "AFTER_SCHOOL")
        .eq("is_active", true)
        .neq("id", classItem.id)
        .order("class_name");

      if (classError) throw classError;

      if (!targetClasses || targetClasses.length === 0) {
        window.alert("目前沒有其他可轉入的啟用班級。");
        return;
      }

      const optionText = targetClasses
        .map(
          (targetClass, index) =>
            `${index + 1}. ${targetClass.class_name}` +
            `${targetClass.academic_year ? `｜${targetClass.academic_year}` : ""}` +
            `${targetClass.term ? `・${targetClass.term}` : ""}`
        )
        .join("\n");

      const selectedInput = window.prompt(
        `請輸入要將「${studentName}」轉入的班級編號：\n\n${optionText}`
      );

      if (selectedInput === null) return;

      const selectedIndex = Number(selectedInput.trim()) - 1;

      if (
        !Number.isInteger(selectedIndex) ||
        selectedIndex < 0 ||
        selectedIndex >= targetClasses.length
      ) {
        window.alert("班級編號無效，已取消轉班。");
        return;
      }

      const targetClass = targetClasses[selectedIndex];
      const today = getTodayString();

      const dateInput = window.prompt(
        `請輸入「${studentName}」轉入「${targetClass.class_name}」的日期：\n格式：YYYY-MM-DD`,
        today
      );

      if (dateInput === null) return;

      const transferDate = dateInput.trim();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) {
        window.alert("日期格式錯誤，請使用 YYYY-MM-DD。");
        return;
      }

      if (item.joined_at && transferDate < item.joined_at) {
        window.alert("轉班日期不可早於原班級加入日期。");
        return;
      }

      const confirmed = window.confirm(
        `確定要將「${studentName}」於 ${transferDate} 從「${classItem.class_name}」轉至「${targetClass.class_name}」嗎？\n\n原班級會保留退出歷程，新班級會建立新的加入紀錄。`
      );

      if (!confirmed) return;

      const nowIso = new Date().toISOString();

      const { error: leaveError } = await supabase
        .from("class_students")
        .update({
          status: "LEFT",
          left_at: transferDate,
          updated_at: nowIso,
        })
        .eq("id", item.id);

      if (leaveError) throw leaveError;

      const { error: insertError } = await supabase
        .from("class_students")
        .insert([
          {
            class_id: targetClass.id,
            student_id: item.student_id,
            joined_at: transferDate,
            left_at: null,
            status: "ACTIVE",
            note: null,
          },
        ]);

      if (insertError) {
        const { error: rollbackError } = await supabase
          .from("class_students")
          .update({
            status: "ACTIVE",
            left_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        if (rollbackError) {
          console.error("轉班失敗後還原原班級狀態失敗：", rollbackError);
          window.alert(
            `轉班未完成，而且原班級狀態還原失敗。\n請立即到 Supabase 檢查「${studentName}」的 class_students 紀錄。\n\n原始錯誤：${insertError.message}`
          );
          return;
        }

        throw insertError;
      }

      await loadClassStudents();
      window.alert(
        `已將「${studentName}」從「${classItem.class_name}」轉至「${targetClass.class_name}」。`
      );
    } catch (error) {
      console.error("學生轉班失敗：", error);
      window.alert(`轉班失敗：${error.message}`);
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <>
      <div
        className="classDetailDrawer__backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <aside className="classDetailDrawer">
          <header className="classDetailDrawer__header">
            <div>
              <p className="classDrawer__eyebrow">CLASS DETAIL</p>
              <h2>{classItem.class_name}</h2>
              <p>
                {classItem.academic_year || "未設定學年度"}
                {classItem.term ? ` ・ ${classItem.term}` : ""}
              </p>
            </div>

            <button
              type="button"
              className="classDetailDrawer__close"
              onClick={onClose}
              aria-label="關閉"
            >
              ×
            </button>
          </header>

          <div className="classDetailDrawer__body">
            <section className="classDetailDrawer__section">
              <div className="classDetailDrawer__sectionTitle">
                <div>
                  <span>CLASS INFO</span>
                  <h3>班級資訊</h3>
                </div>

                <button type="button" onClick={() => onEdit(classItem)}>
                  編輯
                </button>
              </div>

              <div className="classDetailDrawer__infoGrid">
                <div>
                  <span>學年度</span>
                  <strong>{classItem.academic_year || "未設定"}</strong>
                </div>

                <div>
                  <span>學期</span>
                  <strong>{classItem.term || "未設定"}</strong>
                </div>

                <div>
                  <span>開始日期</span>
                  <strong>{formatDate(classItem.start_date)}</strong>
                </div>

                <div>
                  <span>結束日期</span>
                  <strong>{formatDate(classItem.end_date)}</strong>
                </div>
              </div>

              <div className="classDetailDrawer__statusRow">
                <span>班級狀態</span>

                <strong
                  className={
                    classItem.is_active
                      ? "classTable__status classTable__status--active"
                      : "classTable__status classTable__status--inactive"
                  }
                >
                  {classItem.is_active ? "啟用中" : "已停用"}
                </strong>
              </div>

              {classItem.note && (
                <div className="classDetailDrawer__note">
                  <span>備註</span>
                  <p>{classItem.note}</p>
                </div>
              )}
            </section>

            <section className="classDetailDrawer__section">
              <div className="classDetailDrawer__studentHeader">
                <div>
                  <span>CURRENT STUDENTS</span>
                  <h3>目前學生</h3>
                  <p>目前 {classStudents.length} 位學生</p>
                </div>

                <button
                  type="button"
                  className="classDetailDrawer__addStudent"
                  onClick={openAddStudents}
                >
                  ＋ 加入學生
                </button>
              </div>

              {isLoadingStudents ? (
                <div className="classDetailDrawer__empty">
                  <strong>正在讀取學生資料……</strong>
                </div>
              ) : classStudents.length === 0 ? (
                <div className="classDetailDrawer__empty">
                  <div>＋</div>
                  <strong>目前還沒有學生</strong>
                  <p>可從既有學生資料中批次加入。</p>
                </div>
              ) : (
                <div className="classDetailDrawer__studentList">
                  {classStudents.map((item) => {
                    const student = item.students;
                    if (!student) return null;

                    const isProcessing = processingId === item.id;

                    return (
                      <div
                        key={item.id}
                        className="classDetailDrawer__studentItem"
                      >
                        <div className="classDetailDrawer__studentMain">
                          <strong>{student.chinese_name}</strong>
                          <span>
                            {[
                              student.current_grade,
                              student.school,
                              student.english_name,
                            ]
                              .filter(Boolean)
                              .join(" ・ ")}
                          </span>
                        </div>

                        <div className="classDetailDrawer__studentRight">
                          <small>
                            加入於 {formatDate(item.joined_at)}
                          </small>

                          <div className="classDetailDrawer__studentMenuWrap">
                            <button
                              type="button"
                              className="classDetailDrawer__studentMenuButton"
                              onClick={() => toggleStudentMenu(item.id)}
                              disabled={isProcessing}
                              aria-label="學生班級操作"
                            >
                              ⋯
                            </button>

                            {activeMenuId === item.id && (
                              <div className="classDetailDrawer__studentMenu">
                                <button
                                  type="button"
                                  onClick={() => leaveClass(item)}
                                >
                                  退出班級
                                </button>

                                <button
                                  type="button"
                                  onClick={() => transferClass(item)}
                                >
                                  轉至其他班級
                                </button>

                                <button
                                  type="button"
                                  className="classDetailDrawer__studentMenuDanger"
                                  onClick={() => removeMistakenStudent(item)}
                                >
                                  刪除誤加紀錄
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </aside>
      </div>

      {isAddStudentsOpen && (
        <AddStudentsToClassDrawer
          classItem={classItem}
          onClose={closeAddStudents}
          onAdded={handleStudentsAdded}
        />
      )}
    </>
  );
}

export default ClassDetailDrawer;