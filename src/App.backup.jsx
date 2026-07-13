import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import "./App.css";

function App() {
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
      <aside className="sidebar">
        <div className="brand">W.</div>
        <h2>WORKSPACE</h2>

        <nav>
          <button className="active">學生資料</button>
          <button>老師管理</button>
          <button>班級管理</button>
          <button>課程管理</button>
          <button>營隊</button>
          <button>行事曆</button>
        </nav>
      </aside>

      <main className="main">
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

          <table>
            <thead>
              <tr>
                <th>學號</th>
                <th>中文姓名</th>
                <th>英文姓名</th>
                <th>年級</th>
                <th>狀態</th>
              </tr>
            </thead>

            <tbody>
              {filteredStudents.map((s) => (
                <tr key={s.id} onClick={() => openStudentDrawer(s)}>
                  <td>{s.student_no}</td>
                  <td>{s.chinese_name}</td>
                  <td>{s.english_name || "—"}</td>
                  <td>{s.current_grade || "—"}</td>
                  <td>
                    <span className="badge">{s.student_status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>

      {isDrawerOpen && (
        <div className="drawerBackdrop">
          <form className="drawer" onSubmit={saveStudent}>
            <div className="drawerHeader">
              <div>
                <p className="eyebrow">
                  {selectedStudent ? "STUDENT PROFILE" : "NEW STUDENT"}
                </p>
                <h2>{selectedStudent ? "學生資料" : "新增學生"}</h2>
              </div>

              <button type="button" onClick={() => setIsDrawerOpen(false)}>
                ×
              </button>
            </div>

            <label>
              學號
              <input value={form.student_no} disabled />
            </label>

            <label>
              中文姓名
              <input
                required
                value={form.chinese_name}
                onChange={(e) =>
                  setForm({ ...form, chinese_name: e.target.value })
                }
              />
            </label>

            <label>
              英文姓名
              <input
                value={form.english_name}
                onChange={(e) =>
                  setForm({ ...form, english_name: e.target.value })
                }
              />
            </label>

            <label>
              主要家長稱謂
              <input
                required
                value={form.primary_parent_title}
                onChange={(e) =>
                  setForm({ ...form, primary_parent_title: e.target.value })
                }
              />
            </label>

            <label>
              主要家長電話
              <input
                required
                value={form.primary_parent_phone}
                onChange={(e) =>
                  setForm({ ...form, primary_parent_phone: e.target.value })
                }
              />
            </label>

            <label>
              年級
              <select
                value={form.current_grade}
                onChange={(e) =>
                  setForm({ ...form, current_grade: e.target.value })
                }
              >
                <option value="">未設定</option>
                <option value="幼兒園">幼兒園</option>
                <option value="一年級">一年級</option>
                <option value="二年級">二年級</option>
                <option value="三年級">三年級</option>
                <option value="四年級">四年級</option>
                <option value="五年級">五年級</option>
                <option value="六年級">六年級</option>
                <option value="畢業生">畢業生</option>
              </select>
            </label>

            <div className="drawerActions">
              {selectedStudent && (
                <button type="button" className="danger" onClick={deleteStudent}>
                  刪除學生
                </button>
              )}

              <button type="button" onClick={() => setIsDrawerOpen(false)}>
                取消
              </button>

              <button type="submit" className="primary">
                {selectedStudent ? "儲存修改" : "儲存學生"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;