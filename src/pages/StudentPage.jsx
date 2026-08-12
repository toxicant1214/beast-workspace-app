import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import StudentTable from "../components/StudentTable";
import StudentDrawer from "../components/StudentDrawer";
import StudentProfile from "../components/StudentProfile";
import ImportStudentsDialog from "../components/ImportStudentsDialog";
import { canEditPage } from "../services/permissionService";
import "../App.css";


function StudentPage({ currentTeacher }) {
  const [students, setStudents] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [studentFilter, setStudentFilter] = useState("NORMAL");

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState(null);
  const [profileStudent, setProfileStudent] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const canEdit = canEditPage(
    currentTeacher,
    "students"
  );


  const emptyForm = {
    student_no: "",
    is_test: false,
    record_scope: "NORMAL",
    pickup_enabled: true,
    chinese_name: "",
    english_name: "",
    national_id: "",
    birthday: "",
    gender: "",
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
  }, [studentFilter]);


  async function loadStudents() {
    let query = supabase
      .from("students")
      .select("*");

    if (studentFilter !== "ALL") {
      query = query.eq(
        "record_scope",
        studentFilter
      );
    }

    const { data, error } = await query
      .order("student_no");

    if (error) {
      console.error(
        "讀取學生資料失敗：",
        error
      );

      alert(
        `讀取學生資料失敗：${error.message}`
      );

      return;
    }

    const nextStudents = data || [];

    setStudents(nextStudents);

    setProfileStudent(
      (currentProfile) => {
        if (!currentProfile) {
          return null;
        }

        return (
          nextStudents.find(
            (student) =>
              student.id === currentProfile.id
          ) || null
        );
      }
    );
  }


  function openNewStudentDrawer() {
    if (!canEdit) {
      return;
    }

    setSelectedStudent(null);

    setForm({
      ...emptyForm,

      record_scope:
        studentFilter === "PICKUP_ONLY"
          ? "PICKUP_ONLY"
          : "NORMAL",

      pickup_enabled: true,
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
    if (!canEdit) {
      return;
    }

    setSelectedStudent(student);

    setForm({
      student_no:
        student.student_no || "",

      is_test:
        student.is_test ?? false,

      record_scope:
        student.record_scope || "NORMAL",

      pickup_enabled:
        student.pickup_enabled ?? true,

      chinese_name:
        student.chinese_name || "",

      english_name:
        student.english_name || "",

      national_id:
        student.national_id || "",

      birthday:
        student.birthday || "",

      gender:
        student.gender || "",

      school:
        student.school || "",

      enrollment_date:
        student.enrollment_date || "",

      primary_parent_title:
        student.primary_parent_title ||
        "媽媽",

      primary_parent_phone:
        student.primary_parent_phone ||
        "",

      secondary_parent_title:
        student.secondary_parent_title ||
        "",

      secondary_parent_phone:
        student.secondary_parent_phone ||
        "",

      current_grade:
        student.current_grade || "",

      student_status:
        student.student_status ||
        "ACTIVE",

      note:
        student.note || "",
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


  function openImportDialog() {
    if (!canEdit) {
      return;
    }

    setIsImportOpen(true);
  }


  function closeImportDialog() {
    setIsImportOpen(false);
  }


  async function handleImported() {
    if (!canEdit) {
      return;
    }

    setIsImportOpen(false);

    await loadStudents();
  }


  function validateForm() {
    if (!form.chinese_name.trim()) {
      alert("請填寫中文姓名。");
      return false;
    }

    if (!form.school.trim()) {
      alert("請填寫學校。");
      return false;
    }

    if (!form.current_grade) {
      alert("請選擇目前年級。");
      return false;
    }

    if (
      !form.primary_parent_title.trim()
    ) {
      alert(
        "請填寫主要家長稱謂。"
      );

      return false;
    }

    if (
      !form.primary_parent_phone.trim()
    ) {
      alert(
        "請填寫主要家長電話。"
      );

      return false;
    }

    return true;
  }


  async function saveStudent(e) {
    e.preventDefault();

    if (!canEdit) {
      alert(
        "目前權限為僅查看，無法修改學生資料。"
      );

      return;
    }

    if (!validateForm()) {
      return;
    }


    const normalizedForm = {
      ...form,

      record_scope:
        form.record_scope ===
        "PICKUP_ONLY"
          ? "PICKUP_ONLY"
          : "NORMAL",

      pickup_enabled:
        Boolean(
          form.pickup_enabled
        ),

      chinese_name:
        form.chinese_name.trim(),

      english_name:
        form.english_name.trim() ||
        null,

      national_id:
        form.national_id
          .trim()
          .toUpperCase() ||
        null,

      birthday:
        form.birthday || null,

      gender:
        form.gender || null,

      school:
        form.school.trim(),

      enrollment_date:
        form.enrollment_date ||
        null,

      primary_parent_title:
        form.primary_parent_title.trim(),

      primary_parent_phone:
        form.primary_parent_phone.trim(),

      secondary_parent_title:
        form.secondary_parent_title
          .trim() ||
        null,

      secondary_parent_phone:
        form.secondary_parent_phone
          .trim() ||
        null,

      current_grade:
        form.current_grade,

      student_status:
        form.student_status ||
        "ACTIVE",

      note:
        form.note.trim() ||
        null,
    };


    try {
      setIsSaving(true);


      if (selectedStudent) {
        const {
          student_no,
          ...updateData
        } = normalizedForm;


        const {
          data,
          error,
        } = await supabase
          .from("students")
          .update(updateData)
          .eq(
            "id",
            selectedStudent.id
          )
          .select("*")
          .single();


        if (error) {
          throw error;
        }


        if (data) {
          setProfileStudent(
            (currentProfile) => {
              if (
                currentProfile?.id ===
                data.id
              ) {
                return data;
              }

              return currentProfile;
            }
          );
        }
      } else {
        const {
          student_no,
          student_status,
          ...newStudentData
        } = normalizedForm;


        const {
          data,
          error,
        } = await supabase
          .from("students")
          .insert([
            {
              ...newStudentData,

              record_scope:
                normalizedForm.record_scope ===
                "PICKUP_ONLY"
                  ? "PICKUP_ONLY"
                  : "NORMAL",

              pickup_enabled:
                normalizedForm
                  .pickup_enabled,

              student_status:
                "ACTIVE",
            },
          ])
          .select("*")
          .single();


        if (error) {
          throw error;
        }


        if (!data) {
          throw new Error(
            "學生資料沒有成功寫入資料庫。"
          );
        }


        if (
          data.record_scope ===
          "PICKUP_ONLY"
        ) {
          alert(
            `已新增接送專用學生「${data.chinese_name}」。\n\n可從學生資料中心的「接送專用」篩選查看。`
          );
        } else {
          alert(
            `已新增學生「${data.chinese_name}」。`
          );
        }
      }


      closeDrawer();

      await loadStudents();
    } catch (error) {
      console.error(
        "儲存學生資料失敗：",
        error
      );


      if (
        error.code === "23505" &&
        error.message?.includes(
          "national_id"
        )
      ) {
        alert(
          "儲存失敗：這個身分證字號已經存在。"
        );

        return;
      }


      alert(
        `儲存失敗：${error.message}`
      );
    } finally {
      setIsSaving(false);
    }
  }


  async function deleteStudent() {
    if (!canEdit) {
      alert(
        "目前權限為僅查看，無法刪除學生資料。"
      );

      return;
    }


    if (
      !selectedStudent ||
      isSaving
    ) {
      return;
    }


    const studentName =
      selectedStudent
        .chinese_name ||
      "";


    const studentType =
      selectedStudent.is_test
        ? "測試學生"
        : "正式學生";


    const firstConfirmed =
      window.confirm(
        `確定要永久刪除${studentType}「${studentName}」嗎？\n\n刪除後無法復原。`
      );


    if (!firstConfirmed) {
      return;
    }


    const typedName =
      window.prompt(
        `為避免誤刪，請輸入學生完整姓名「${studentName}」：`
      );


    if (typedName === null) {
      return;
    }


    if (
      typedName.trim() !==
      studentName.trim()
    ) {
      alert(
        "姓名不一致，已取消刪除。"
      );

      return;
    }


    try {
      setIsSaving(true);


      const {
        error,
      } = await supabase
        .from("students")
        .delete()
        .eq(
          "id",
          selectedStudent.id
        );


      if (error) {
        throw error;
      }


      if (
        profileStudent?.id ===
        selectedStudent.id
      ) {
        setProfileStudent(null);
      }


      closeDrawer();

      await loadStudents();


      alert(
        `已永久刪除學生「${studentName}」。`
      );
    } catch (error) {
      console.error(
        "刪除學生失敗：",
        error
      );


      alert(
        `刪除失敗：${error.message}\n\n若這位學生已被班級、課程或接車資料使用，可能需要先移除相關紀錄。`
      );
    } finally {
      setIsSaving(false);
    }
  }


  const filteredStudents =
    students.filter(
      (student) => {
        const keyword =
          searchText
            .trim()
            .toLowerCase();


        if (!keyword) {
          return true;
        }


        const normalizedKeyword =
          keyword.replace(
            /[-\s]/g,
            ""
          );


        const primaryPhone =
          (
            student.primary_parent_phone ||
            ""
          ).replace(
            /[-\s]/g,
            ""
          );


        const secondaryPhone =
          (
            student.secondary_parent_phone ||
            ""
          ).replace(
            /[-\s]/g,
            ""
          );


        return (
          student.student_no
            ?.toLowerCase()
            .includes(
              keyword
            ) ||

          student.chinese_name
            ?.toLowerCase()
            .includes(
              keyword
            ) ||

          student.english_name
            ?.toLowerCase()
            .includes(
              keyword
            ) ||

          student.national_id
            ?.toLowerCase()
            .includes(
              keyword
            ) ||

          primaryPhone.includes(
            normalizedKeyword
          ) ||

          secondaryPhone.includes(
            normalizedKeyword
          ) ||

          student.school
            ?.toLowerCase()
            .includes(
              keyword
            )
        );
      }
    );


  const currentFilterLabel =
    studentFilter ===
    "PICKUP_ONLY"
      ? "接送專用"
      : studentFilter ===
        "ALL"
      ? "全部學生"
      : "一般學生";


  if (profileStudent) {
    return (
      <>
        <div
          className={
            canEdit
              ? ""
              : "student-page-readonly"
          }
        >
          <StudentProfile
            student={
              profileStudent
            }
            onBack={
              closeStudentProfile
            }
            onEdit={
              canEdit
                ? openStudentDrawer
                : () => {}
            }
          />
        </div>


        {!canEdit && (
          <style>
            {`
              .student-page-readonly
              .studentProfile__editButton {
                display: none;
              }
            `}
          </style>
        )}


        {canEdit &&
          isDrawerOpen && (
            <StudentDrawer
              selectedStudent={
                selectedStudent
              }
              form={form}
              setForm={
                setForm
              }
              onClose={
                closeDrawer
              }
              onSave={
                saveStudent
              }
              onDelete={
                deleteStudent
              }
              isSaving={
                isSaving
              }
            />
          )}
      </>
    );
  }


  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">
            STUDENT CENTER
          </p>

          <h1>
            學生資料中心
          </h1>

          <p className="summary">
            {currentFilterLabel}
            共 {students.length} 位
          </p>
        </div>


        {canEdit && (
          <div className="topbarActions">
            <button
              type="button"
              onClick={
                openImportDialog
              }
            >
              Excel 匯入
            </button>


            <button
              type="button"
              className="primary"
              onClick={
                openNewStudentDrawer
              }
            >
              ＋ 新增學生
            </button>
          </div>
        )}
      </header>


      <section className="card">
        <div className="cardHeader">
          <input
            placeholder="搜尋姓名、英文名、學號、電話、學校..."
            value={
              searchText
            }
            onChange={(e) =>
              setSearchText(
                e.target.value
              )
            }
          />


          <select
            value={
              studentFilter
            }
            onChange={(e) => {
              setSearchText("");

              setStudentFilter(
                e.target.value
              );
            }}
            aria-label="學生類型篩選"
          >
            <option value="NORMAL">
              一般學生
            </option>

            <option value="PICKUP_ONLY">
              接送專用
            </option>

            <option value="ALL">
              全部學生
            </option>
          </select>


          <span>
            {
              filteredStudents.length
            }
            {" / "}
            {students.length}
            {" 位學生"}
          </span>
        </div>


        <StudentTable
          students={
            filteredStudents
          }
          onSelectStudent={
            openStudentProfile
          }
        />
      </section>


      {canEdit &&
        isDrawerOpen && (
          <StudentDrawer
            selectedStudent={
              selectedStudent
            }
            form={form}
            setForm={
              setForm
            }
            onClose={
              closeDrawer
            }
            onSave={
              saveStudent
            }
            onDelete={
              deleteStudent
            }
            isSaving={
              isSaving
            }
          />
        )}


      {canEdit && (
        <ImportStudentsDialog
          open={
            isImportOpen
          }
          onClose={
            closeImportDialog
          }
          onImported={
            handleImported
          }
        />
      )}
    </>
  );
}


export default StudentPage;