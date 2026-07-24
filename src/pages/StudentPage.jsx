import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import StudentTable from "../components/StudentTable";
import StudentDrawer from "../components/StudentDrawer";
import "../App.css";

function StudentPage() {
  const [students, setStudents] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);

  const emptyForm = {
    student_no: "",
    is_test: false,
    chinese_name: "",
    english_name: "",
    primary_parent_title: "媽媽",
    primary_parent_phone: "",
    current_grade: "",
    student_status: "ACTIVE",
  };

  const [form, setForm] = useState(emptyForm);

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

  function openNewStudentDrawer() {
    setSelectedStudent(null);
    setForm({
      ...emptyForm,
    });
    setIsDrawerOpen(true);
  }

  function openStudentDrawer(student) {
    setSelectedStudent(student);

    setForm({
      student_no: student.student_no || "",
      is_test: student.is_test ?? false,
      chinese_name: student.chinese_name || "",
      english_name: student.english_name || "",
      primary_parent_title: student.primary_parent_title || "媽媽",
      primary_parent_phone: student.primary_parent_phone || "",
      current_grade: student.current_grade || "",
      student_status: student.student_status || "ACTIVE",
    });

    setIsDrawerOpen(true);
  }

  function closeDrawer() {
    setIsDrawerOpen(false);
    setSelectedStudent(null);
    setForm({
      ...emptyForm,
    });
  }

  async function saveStudent(e) {
    e.preventDefault();

    if (selectedStudent) {
      const { student_no, ...updateData } = form;

      const { error } = await supabase
        .from("students")
        .update(updateData)
        .eq("id", selectedStudent.id);

      if (error) {
        alert("更新失敗：" + error.message);
        return;
      }
    } else {
      const { student_no, ...newStudentData } = form;

      const { error } = await supabase
        .from("students")
        .insert([newStudentData]);

      if (error) {
        alert("新增失敗：" + error.message);
        return;
      }
    }

    closeDrawer();
    await loadStudents();
  }

  async function deleteStudent() {
    if (!selectedStudent) return;

    if (!selectedStudent.is_test) {
      alert("正式學生不可永久刪除。");
      return;
    }

    const confirmed = window.confirm(
      `確定要刪除測試學生「${selectedStudent.chinese_name}」嗎？`
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

    closeDrawer();
    await loadStudents();
  }

  const filteredStudents = students.filter((student) => {
    const keyword = searchText.trim().toLowerCase();

    return (
      student.student_no?.toLowerCase().includes(keyword) ||
      student.chinese_name?.toLowerCase().includes(keyword) ||
      student.english_name?.toLowerCase().includes(keyword) ||
      student.primary_parent_phone?.includes(keyword)
    );
  });

  return (
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

      {isDrawerOpen && (
        <StudentDrawer
          selectedStudent={selectedStudent}
          form={form}
          setForm={setForm}
          onClose={closeDrawer}
          onSave={saveStudent}
          onDelete={deleteStudent}
        />
      )}
    </>
  );
}

export default StudentPage;