function StudentTable({ students, onSelectStudent }) {
  const statusLabels = {
    ACTIVE: "在學",
    PAUSED: "暫停",
    WITHDRAWN: "退班",
    GRADUATED: "畢業",
  };

  return (
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
        {students.map((student) => (
          <tr
            key={student.id}
            onClick={() => onSelectStudent(student)}
          >
            <td>
              {student.student_no || "—"}

              {student.is_test && (
                <span className="testBadge">測試</span>
              )}
            </td>

            <td>{student.chinese_name}</td>
            <td>{student.english_name || "—"}</td>
            <td>{student.current_grade || "—"}</td>

            <td>
              <span className="badge">
                {statusLabels[student.student_status] ||
                  student.student_status ||
                  "未設定"}
              </span>
            </td>
          </tr>
        ))}

        {students.length === 0 && (
          <tr>
            <td colSpan="5">目前沒有學生資料</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export default StudentTable;