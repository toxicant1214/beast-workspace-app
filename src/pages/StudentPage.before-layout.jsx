import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import StudentTable from "../components/StudentTable";
import StudentDrawer from "../components/StudentDrawer";
import Sidebar from "../components/Sidebar";
import "../App.css";

function StudentPage({ activePage, setActivePage }) {
  const [students, setStudents] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);

  const emptyForm = {
    student_no: "",
    chinese_name: "",
    english_name: "",
    primary_parent_title: "媽媽",
    primary_parent_phone: "",
    current_grade: "",
    student_status: "ACTIVE",
  };

  const [form, setForm] = useState(emptyForm);

  const pages = [
    "學生資料",
    "老師管理",
    "班級管理",
    "課程管理",
    "營隊管理",
    "行事曆",
    "接送管理",
    "學習報告書",
    "營隊排班",
    "清潔分配",
    "LINE 提醒",
    "成績分析",
  ];

  useEffect(() => {
    loadStudents();
  }, []);

  async function loadStudents() {
    const { data, error } = await supabase
      .from("students")
      .select("*")
      .order("student_no");

    if (error) {
      console.error(error);
      return;
    }

    setStudents(data || []);
  }

  function getNextStudentNo() {
    if (students.length === 0) return "0001";

    const maxNo = Math.max(
      ...students.map((s) => Number(s.student_no || 0)).filter(Boolean)
    );

    return String(maxNo + 1).padStart(4, "0");
  }

  function openNewStudentDrawer() {
    setSelectedStudent(null);
    setForm({
      ...emptyForm,
      student_no: getNextStudentNo(),
    });
    setIsDrawerOpen(true);
  }

  function openStudentDrawer(student) {
    setSelectedStudent(student);
    setForm({
      student_no: student.student_no || "",
      chinese_name: student.chinese_name || "",
      english_name: student.english_name || "",
      primary_parent_title: student.primary_parent_title || "媽媽",
      primary_parent_phone: student.primary_parent_phone || "",
      current_grade: student.current_grade || "",
      student_status: student.student_status || "ACTIVE",
    });
    setIsDrawerOpen(true);
  }

  async function saveStudent(e) {
    e.preventDefault();

    if (selectedStudent) {
      const { error } = await supabase
        .from("students")
        .update(form)
        .eq("id", selectedStudent.id);

      if (error) {
        alert("更新失敗：" + error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("students").insert([form]);

      if (error) {
        alert("新增失敗：" + error.message);
        return;
      }
    }

    setIsDrawerOpen(false);
    setSelectedStudent(null);
    setForm(emptyForm);
    loadStudents();
  }

  async function deleteStudent() {
    if (!selectedStudent) return;

    const confirmed = window.confirm(
      `確定要刪除「${selectedStudent.chinese_name}」嗎？`
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("students")
      .delete()
      .eq("id", selectedStudent.id);

    if (error) {
      alert("刪除失敗：" + error.message);
      return;
    }

    setIsDrawerOpen(false);
    setSelectedStudent(null);
    setForm(emptyForm);
    loadStudents();
  }

  const filteredStudents = students.filter((student) => {
    const keyword = searchText.toLowerCase();

    return (
      student.student_no?.toLowerCase().includes(keyword) ||
      student.chinese_name?.toLowerCase().includes(keyword) ||
      student.english_name?.toLowerCase().includes(keyword) ||
      student.primary_parent_phone?.includes(keyword)
    );
  });

  return (
    <div className="workspace">
      <Sidebar
        pages={pages}
        activePage={activePage}
        setActivePage={setActivePage}
      />

      <main className="main">
        {activePage === "學生資料" ? (
          <>
            <header className="topbar">
              <div>
                <p className="eyebrow">STUDENT CENTER</p>
                <h1>學生資料中心</h1>
                <p className="summary">目前共 {students.length} 位學生</p>
              </div>

              <button className="primary" onClick={openNewStudentDrawer}>
                ＋ 新增學生
              </button>
            </header>

            <section className="card">
              <div className="cardHeader">
                <input
                  placeholder="搜尋姓名、英文名、學號、電話..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
                <span>
                  {filteredStudents.length} / {students.length} 位學生
                </span>
              </div>

              <StudentTable
                students={filteredStudents}
                onSelectStudent={openStudentDrawer}
              />
            </section>
          </>
        ) : (
          <div className="placeholderPage">
            <p className="eyebrow">WORKSPACE</p>
            <h1>{activePage}</h1>
            <p className="summary">這個模組尚未開始製作。</p>
          </div>
        )}
      </main>

      {isDrawerOpen && (
        <StudentDrawer
          selectedStudent={selectedStudent}
          form={form}
          setForm={setForm}
          onClose={() => setIsDrawerOpen(false)}
          onSave={saveStudent}
          onDelete={deleteStudent}
        />
      )}
    </div>
  );
}

export default StudentPage;