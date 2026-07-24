import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import StudentTable from "../components/StudentTable";
import StudentDrawer from "../components/StudentDrawer";
import StudentProfile from "../components/StudentProfile";
import "../App.css";

function StudentPage() {
  const [students, setStudents] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [profileStudent, setProfileStudent] = useState(null);

  const emptyForm = {
    student_no: "",
    is_test: false,
    chinese_name: "",
    english_name: "",
    birthday: "",
    school: "",
    enrollment_date: "",
    primary_parent_title: "媽媽",
    primary_parent_phone: "",
    secondary_parent_title: "",
    secondary_parent_phone: "",
    current_grade: "",
    student_status: "ACTIVE",
    note: "",
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
      console.error("讀取學生資料失敗：", error);
      return;
    }

    const nextStudents = data || [];
    setStudents(nextStudents);

    setProfileStudent((currentProfile) => {
      if (!currentProfile) return null;

      return (
        nextStudents.find(
          (student) => student.id === currentProfile.id
        ) || null
      );
    });
  }

  function openNewStudentDrawer() {
    setSelectedStudent(null);
    setForm({
      ...emptyForm,
    });
    setIsDrawerOpen(true);
  }

  function openStudentProfile(student) {
    setProfileStudent(student);
  }

  function closeStudentProfile() {
    setProfileStudent(null);
  }

  function openStudentDrawer(student) {
    setSelectedStudent(student);

    setForm({
      student_no: student.student_no || "",
      is_test: student.is_test ?? false,
      chinese_name: student.chinese_name || "",
      english_name: student.english_name || "",
      birthday: student.birthday || "",
      school: student.school || "",
      enrollment_date: student.enrollment_date || "",
      primary_parent_title:
        student.primary_parent_title || "媽媽",
      primary_parent_phone:
        student.primary_parent_phone || "",
      secondary_parent_title:
        student.secondary_parent_title || "",
      secondary_parent_phone:
        student.secondary_parent_phone || "",
      current_grade: student.current_grade || "",
      student_status: student.student_status || "ACTIVE",
      note: student.note || "",
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

    const normalizedForm = {
      ...form,
      english_name: form.english_name.trim() || null,
      birthday: form.birthday || null,
      school: form.school.trim() || null,
      enrollment_date: form.enrollment_date || null,
      primary_parent_title:
        form.primary_parent_title.trim(),
      primary_parent_phone:
        form.primary_parent_phone.trim(),
      secondary_parent_title:
        form.secondary_parent_title.trim() || null,
      secondary_parent_phone:
        form.secondary_parent_phone.trim() || null,
      current_grade: form.current_grade || null,
      note: form.note.trim() || null,
    };

    if (selectedStudent) {
      const { student_no, ...updateData } = normalizedForm;

      const { data, error } = await supabase
        .from("students")
        .update(updateData)
        .eq("id", selectedStudent.id)
        .select("*")
        .single();

      if (error) {
        alert("更新失敗：" + error.message);
        return;
      }

      if (data) {
        setProfileStudent((currentProfile) => {
          if (currentProfile?.id === data.id) {
            return data;
          }

          return currentProfile;
        });
      }
    } else {
      const { student_no, ...newStudentData } = normalizedForm;

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

    if (profileStudent?.id === selectedStudent.id) {
      setProfileStudent(null);
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
      student.primary_parent_phone?.includes(keyword) ||
      student.secondary_parent_phone?.includes(keyword) ||
      student.school?.toLowerCase().includes(keyword)
    );
  });

  if (profileStudent) {
    return (
      <>
        <StudentProfile
          student={profileStudent}
          onBack={closeStudentProfile}
          onEdit={openStudentDrawer}
        />

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

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">STUDENT CENTER</p>
          <h1>學生資料中心</h1>
          <p className="summary">
            目前共 {students.length} 位學生
          </p>
        </div>

        <button
          type="button"
          className="primary"
          onClick={openNewStudentDrawer}
        >
          ＋ 新增學生
        </button>
      </header>

      <section className="card">
        <div className="cardHeader">
          <input
            placeholder="搜尋姓名、英文名、學號、電話、學校..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />

          <span>
            {filteredStudents.length} / {students.length} 位學生
          </span>
        </div>

        <StudentTable
          students={filteredStudents}
          onSelectStudent={openStudentProfile}
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