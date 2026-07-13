function StudentTable({ students, onSelectStudent }) {
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
        {students.map((s) => (
          <tr key={s.id} onClick={() => onSelectStudent(s)}>
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
  );
}

export default StudentTable;