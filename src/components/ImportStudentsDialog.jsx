function ImportStudentsDialog({
  open,
  onClose,
  onImported,
}) {
  if (!open) return null;

  return (
    <div className="drawerBackdrop">
      <div className="drawer">
        <div className="drawerHeader">
          <div>
            <p className="eyebrow">IMPORT STUDENTS</p>
            <h2>Excel 匯入學生</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
          >
            ×
          </button>
        </div>

        <div className="drawerSection">
          <p className="drawerSectionTitle">
            Excel 批次匯入
          </p>

          <p>
            下一步將在這裡加入 Excel 檔案選擇、
            資料預覽與錯誤檢查。
          </p>
        </div>

        <div className="drawerActions">
          <button
            type="button"
            onClick={onClose}
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImportStudentsDialog;