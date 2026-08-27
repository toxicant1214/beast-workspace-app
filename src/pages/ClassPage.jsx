import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import ClassTable from "../components/ClassTable";
import ClassDrawer from "../components/ClassDrawer";
import ClassDetailDrawer from "../components/ClassDetailDrawer";
import "../components/ClassPage.css";

const EMPTY_FORM = {
  class_name: "",
  academic_year: "",
  term: "",
  start_date: "",
  end_date: "",
  is_active: true,
  note: "",
};

function getTodayString() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function ClassPage({ currentTeacher }) {
  const isViewer = currentTeacher?.role === "viewer";
  const [classes, setClasses] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [detailClass, setDetailClass] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadClasses();
  }, []);

  async function loadClasses() {
    try {
      setIsLoading(true);

      const { data, error } = await supabase
        .from("classes")
        .select("*")
        .eq("course_type", "AFTER_SCHOOL")
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      setClasses(data || []);
    } catch (error) {
      console.error("讀取班級資料失敗：", error);

      window.alert(
        `讀取班級資料失敗：${error.message}`
      );

      setClasses([]);
    } finally {
      setIsLoading(false);
    }
  }

  function openClassDetail(classItem) {
    setDetailClass(classItem);
  }

  function closeClassDetail() {
    setDetailClass(null);
  }

  function openNewClassDrawer() {
    setDetailClass(null);
    setSelectedClass(null);
    setForm({ ...EMPTY_FORM });
    setIsDrawerOpen(true);
  }

  function openEditClassDrawer(classItem) {
    setDetailClass(null);
    setSelectedClass(classItem);

    setForm({
      class_name: classItem.class_name || "",
      academic_year: classItem.academic_year || "",
      term: classItem.term || "",
      start_date: classItem.start_date || "",
      end_date: classItem.end_date || "",
      is_active: classItem.is_active ?? true,
      note: classItem.note || "",
    });

    setIsDrawerOpen(true);
  }

  function closeDrawer() {
    if (isSaving) {
      return;
    }

    setIsDrawerOpen(false);
    setSelectedClass(null);
    setForm({ ...EMPTY_FORM });
  }

  async function saveClass(event) {
    event.preventDefault();

    const className = form.class_name.trim();

    if (!className) {
      window.alert("請輸入班級名稱。");
      return;
    }

    if (
      form.start_date &&
      form.end_date &&
      form.end_date < form.start_date
    ) {
      window.alert(
        "結束日期不可早於開始日期。"
      );

      return;
    }

    const duplicatedClass = classes.find(
      (classItem) => {
        const isCurrentClass =
          selectedClass &&
          classItem.id === selectedClass.id;

        return (
          !isCurrentClass &&
          classItem.class_name
            .trim()
            .toLowerCase() ===
            className.toLowerCase() &&
          (classItem.academic_year || "")
            .trim()
            .toLowerCase() ===
            form.academic_year
              .trim()
              .toLowerCase() &&
          (classItem.term || "")
            .trim()
            .toLowerCase() ===
            form.term.trim().toLowerCase()
        );
      }
    );

    if (duplicatedClass) {
      window.alert(
        `同一學年度與學期已經有「${duplicatedClass.class_name}」這個班級。`
      );

      return;
    }

    const payload = {
      class_name: className,
      course_type: "AFTER_SCHOOL",
      academic_year:
        form.academic_year.trim() || null,
      term: form.term.trim() || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      is_active: form.is_active,
      note: form.note.trim() || null,
      updated_at: new Date().toISOString(),
    };

    try {
      setIsSaving(true);

      if (selectedClass) {
        const { error } = await supabase
          .from("classes")
          .update(payload)
          .eq("id", selectedClass.id);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase
          .from("classes")
          .insert([payload]);

        if (error) {
          throw error;
        }
      }

      setIsDrawerOpen(false);
      setSelectedClass(null);
      setForm({ ...EMPTY_FORM });

      await loadClasses();
    } catch (error) {
      console.error("儲存班級失敗：", error);

      window.alert(
        `儲存班級失敗：${error.message}`
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivateClass(classItem) {
    try {
      const { data: activeStudents, error } =
        await supabase
          .from("class_students")
          .select("id, student_id, joined_at")
          .eq("class_id", classItem.id)
          .eq("status", "ACTIVE");

      if (error) {
        throw error;
      }

      const studentCount =
        activeStudents?.length || 0;

      const defaultEndDate =
        classItem.end_date || getTodayString();

      const inputDate = window.prompt(
        `「${classItem.class_name}」目前有 ${studentCount} 位學生。\n\n停用班級會視為這個班級正式結束，所有目前學生都會在同一天退出班級並保留歷程。\n\n請確認班級結束日期：\n格式：YYYY-MM-DD`,
        defaultEndDate
      );

      if (inputDate === null) {
        return;
      }

      const endDate = inputDate.trim();

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
      ) {
        window.alert(
          "日期格式錯誤，請使用 YYYY-MM-DD。"
        );

        return;
      }

      if (
        classItem.start_date &&
        endDate < classItem.start_date
      ) {
        window.alert(
          "班級結束日期不可早於班級開始日期。"
        );

        return;
      }

      const invalidStudent =
        activeStudents?.find(
          (item) =>
            item.joined_at &&
            endDate < item.joined_at
        );

      if (invalidStudent) {
        window.alert(
          "班級結束日期早於其中一位學生的加入日期，請重新確認日期。"
        );

        return;
      }

      const confirmed = window.confirm(
        `確定停用「${classItem.class_name}」嗎？\n\n結束日期：${endDate}\n目前學生：${studentCount} 位\n\n完成後：\n・班級會移到已停用\n・目前學生會全部退出此班級\n・每位學生的班級歷程都會保留`
      );

      if (!confirmed) {
        return;
      }

      const nowIso = new Date().toISOString();

      if (studentCount > 0) {
        const { error: studentUpdateError } =
          await supabase
            .from("class_students")
            .update({
              status: "LEFT",
              left_at: endDate,
              updated_at: nowIso,
            })
            .eq("class_id", classItem.id)
            .eq("status", "ACTIVE");

        if (studentUpdateError) {
          throw studentUpdateError;
        }
      }

      const { error: classUpdateError } =
        await supabase
          .from("classes")
          .update({
            is_active: false,
            end_date: endDate,
            updated_at: nowIso,
          })
          .eq("id", classItem.id);

      if (classUpdateError) {
        /*
         * 如果班級停用失敗，但前面學生已經被退出，
         * 盡量自動把學生還原回 ACTIVE。
         */
        if (studentCount > 0) {
          const activeIds =
            activeStudents.map(
              (item) => item.id
            );

          const { error: rollbackError } =
            await supabase
              .from("class_students")
              .update({
                status: "ACTIVE",
                left_at: null,
                updated_at:
                  new Date().toISOString(),
              })
              .in("id", activeIds);

          if (rollbackError) {
            console.error(
              "停用班級失敗後，學生狀態還原失敗：",
              rollbackError
            );

            window.alert(
              `班級停用未完成，而且學生班級狀態還原失敗。\n請立即到 Supabase 檢查「${classItem.class_name}」的 class_students 紀錄。`
            );

            return;
          }
        }

        throw classUpdateError;
      }

      setDetailClass(null);

      await loadClasses();

      window.alert(
        `「${classItem.class_name}」已於 ${endDate} 結束。\n${studentCount} 位學生的退出紀錄已保留。`
      );
    } catch (error) {
      console.error(
        "停用班級失敗：",
        error
      );

      window.alert(
        `停用班級失敗：${error.message}`
      );
    }
  }

  async function reactivateClass(classItem) {
    const confirmed = window.confirm(
      `確定要重新啟用「${classItem.class_name}」嗎？\n\n重新啟用只會恢復班級本身，不會把過去已退出的學生自動重新加入。`
    );

    if (!confirmed) {
      return;
    }

    try {
      const { error } = await supabase
        .from("classes")
        .update({
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", classItem.id);

      if (error) {
        throw error;
      }

      await loadClasses();

      window.alert(
        `「${classItem.class_name}」已重新啟用。`
      );
    } catch (error) {
      console.error(
        "重新啟用班級失敗：",
        error
      );

      window.alert(
        `重新啟用班級失敗：${error.message}`
      );
    }
  }

  async function toggleClassStatus(classItem) {
    if (classItem.is_active) {
      await deactivateClass(classItem);
      return;
    }

    await reactivateClass(classItem);
  }

  const filteredClasses = useMemo(() => {
    const keyword =
      searchText.trim().toLowerCase();

    return classes.filter((classItem) => {
      const matchesKeyword =
        !keyword ||
        classItem.class_name
          ?.toLowerCase()
          .includes(keyword) ||
        classItem.academic_year
          ?.toLowerCase()
          .includes(keyword) ||
        classItem.term
          ?.toLowerCase()
          .includes(keyword) ||
        classItem.note
          ?.toLowerCase()
          .includes(keyword);

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" &&
          classItem.is_active) ||
        (statusFilter === "INACTIVE" &&
          !classItem.is_active);

      return (
        matchesKeyword &&
        matchesStatus
      );
    });
  }, [
    classes,
    searchText,
    statusFilter,
  ]);

  const activeClassCount =
    classes.filter(
      (classItem) =>
        classItem.is_active
    ).length;

  const inactiveClassCount =
    classes.length - activeClassCount;

  return (
    <div className="classPage">
      <header className="classPage__header">
        <div>
          <p className="classPage__eyebrow">
            CLASS MANAGEMENT
          </p>

          <h1>班級管理</h1>

          <p className="classPage__summary">
            建立安親行政班級，管理學年度、學期、班級期間與啟用狀態。
          </p>
        </div>

        {!isViewer && (
          <button
            type="button"
            className="classPage__primaryButton"
            onClick={openNewClassDrawer}
          >
            ＋ 新增班級
          </button>
        )}
      </header>

      <section className="classPage__stats">
        <div className="classPage__statCard">
          <span>全部班級</span>
          <strong>
            {classes.length}
          </strong>
        </div>

        <div className="classPage__statCard">
          <span>目前啟用</span>
          <strong>
            {activeClassCount}
          </strong>
        </div>

        <div className="classPage__statCard">
          <span>已停用</span>
          <strong>
            {inactiveClassCount}
          </strong>
        </div>
      </section>

      <section className="classPage__content">
        <div className="classPage__toolbar">
          <div className="classPage__search">
            <span aria-hidden="true">
              ⌕
            </span>

            <input
              type="search"
              placeholder="搜尋班級名稱、學年度、學期或備註..."
              value={searchText}
              onChange={(event) =>
                setSearchText(
                  event.target.value
                )
              }
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value
              )
            }
            aria-label="班級狀態篩選"
          >
            <option value="ACTIVE">
              目前啟用
            </option>

            <option value="INACTIVE">
              已停用
            </option>

            <option value="ALL">
              全部狀態
            </option>
          </select>
        </div>

        <div className="classPage__resultInfo">
          顯示 {filteredClasses.length} 個班級
        </div>

        <ClassTable
          classes={filteredClasses}
          isLoading={isLoading}
          onOpen={openClassDetail}
          onEdit={openEditClassDrawer}
          onToggleStatus={toggleClassStatus}
          readOnly={isViewer}
        />
      </section>

      {detailClass && (
        <ClassDetailDrawer
          classItem={detailClass}
          onClose={closeClassDetail}
          onEdit={openEditClassDrawer}
          readOnly={isViewer}
        />
      )}

      {!isViewer && isDrawerOpen && (
        <ClassDrawer
          selectedClass={selectedClass}
          form={form}
          setForm={setForm}
          isSaving={isSaving}
          onClose={closeDrawer}
          onSave={saveClass}
        />
      )}
    </div>
  );
}

export default ClassPage;