import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import ClassTable from "../components/ClassTable";
import ClassDrawer from "../components/ClassDrawer";
import "../components/ClassPage.css";

const EMPTY_FORM = {
  class_name: "",
  course_type: "AFTER_SCHOOL",
  academic_year: "",
  term: "",
  start_date: "",
  end_date: "",
  is_active: true,
  note: "",
};

function ClassPage() {
  const [classes, setClasses] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [courseTypeFilter, setCourseTypeFilter] =
    useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadClasses();
  }, []);

  async function loadClasses() {
    setIsLoading(true);

    const { data, error } = await supabase
      .from("classes")
      .select("*")
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("讀取班級資料失敗：", error);
      alert(`讀取班級資料失敗：${error.message}`);
      setIsLoading(false);
      return;
    }

    setClasses(data || []);
    setIsLoading(false);
  }

  function openNewClassDrawer() {
    setSelectedClass(null);
    setForm({ ...EMPTY_FORM });
    setIsDrawerOpen(true);
  }

  function openEditClassDrawer(classItem) {
    setSelectedClass(classItem);

    setForm({
      class_name: classItem.class_name || "",
      course_type:
        classItem.course_type || "AFTER_SCHOOL",
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
    if (isSaving) return;

    setIsDrawerOpen(false);
    setSelectedClass(null);
    setForm({ ...EMPTY_FORM });
  }

  async function saveClass(event) {
    event.preventDefault();

    const className = form.class_name.trim();

    if (!className) {
      alert("請輸入班級名稱。");
      return;
    }

    if (!form.course_type) {
      alert("請選擇課程類型。");
      return;
    }

    if (
      form.start_date &&
      form.end_date &&
      form.end_date < form.start_date
    ) {
      alert("結束日期不可早於開始日期。");
      return;
    }

    const payload = {
      class_name: className,
      course_type: form.course_type,
      academic_year:
        form.academic_year.trim() || null,
      term: form.term.trim() || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      is_active: form.is_active,
      note: form.note.trim() || null,
      updated_at: new Date().toISOString(),
    };

    setIsSaving(true);

    if (selectedClass) {
      const { error } = await supabase
        .from("classes")
        .update(payload)
        .eq("id", selectedClass.id);

      if (error) {
        alert(`更新班級失敗：${error.message}`);
        setIsSaving(false);
        return;
      }
    } else {
      const { error } = await supabase
        .from("classes")
        .insert([payload]);

      if (error) {
        alert(`新增班級失敗：${error.message}`);
        setIsSaving(false);
        return;
      }
    }

    setIsSaving(false);
    closeDrawer();
    await loadClasses();
  }

  async function toggleClassStatus(classItem) {
    const nextStatus = !classItem.is_active;

    const actionText = nextStatus ? "重新啟用" : "停用";

    const confirmed = window.confirm(
      `確定要${actionText}「${classItem.class_name}」嗎？`
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("classes")
      .update({
        is_active: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", classItem.id);

    if (error) {
      alert(`${actionText}班級失敗：${error.message}`);
      return;
    }

    await loadClasses();
  }

  const filteredClasses = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

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

      const matchesCourseType =
        courseTypeFilter === "ALL" ||
        classItem.course_type === courseTypeFilter;

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" &&
          classItem.is_active) ||
        (statusFilter === "INACTIVE" &&
          !classItem.is_active);

      return (
        matchesKeyword &&
        matchesCourseType &&
        matchesStatus
      );
    });
  }, [
    classes,
    searchText,
    courseTypeFilter,
    statusFilter,
  ]);

  const activeClassCount = classes.filter(
    (classItem) => classItem.is_active
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
            建立各類課程班級，並管理學年度、學期及啟用狀態。
          </p>
        </div>

        <button
          type="button"
          className="classPage__primaryButton"
          onClick={openNewClassDrawer}
        >
          ＋ 新增班級
        </button>
      </header>

      <section className="classPage__stats">
        <div className="classPage__statCard">
          <span>全部班級</span>
          <strong>{classes.length}</strong>
        </div>

        <div className="classPage__statCard">
          <span>目前啟用</span>
          <strong>{activeClassCount}</strong>
        </div>

        <div className="classPage__statCard">
          <span>已停用</span>
          <strong>{inactiveClassCount}</strong>
        </div>
      </section>

      <section className="classPage__content">
        <div className="classPage__toolbar">
          <div className="classPage__search">
            <span>⌕</span>

            <input
              type="search"
              placeholder="搜尋班級名稱、學年度、學期或備註..."
              value={searchText}
              onChange={(event) =>
                setSearchText(event.target.value)
              }
            />
          </div>

          <select
            value={courseTypeFilter}
            onChange={(event) =>
              setCourseTypeFilter(event.target.value)
            }
          >
            <option value="ALL">全部課程類型</option>
            <option value="AFTER_SCHOOL">安親</option>
            <option value="ENGLISH">美語</option>
            <option value="LOGIC">邏輯</option>
            <option value="GO">圍棋</option>
            <option value="READING">閱讀</option>
            <option value="WRITING">作文</option>
            <option value="CAMP">營隊</option>
            <option value="OTHER">其他</option>
          </select>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
          >
            <option value="ACTIVE">目前啟用</option>
            <option value="INACTIVE">已停用</option>
            <option value="ALL">全部狀態</option>
          </select>
        </div>

        <div className="classPage__resultInfo">
          顯示 {filteredClasses.length} 個班級
        </div>

        <ClassTable
          classes={filteredClasses}
          isLoading={isLoading}
          onEdit={openEditClassDrawer}
          onToggleStatus={toggleClassStatus}
        />
      </section>

      {isDrawerOpen && (
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