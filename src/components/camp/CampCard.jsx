const CAMP_TYPE_LABELS = {
  WINTER: "寒假營隊",
  SUMMER: "暑假營隊",
  OTHER: "其他營隊",
};

const STATUS_LABELS = {
  PLANNING: "規劃中",
  ACTIVE: "進行中",
  ARCHIVED: "已封存",
};

function formatDate(dateString) {
  if (!dateString) {
    return "—";
  }

  const [year, month, day] = String(
    dateString
  ).split("-");

  return `${year}/${month}/${day}`;
}

function CampCard({
  camp,
  onOpen,
}) {
  const statusClass =
    camp.status === "ACTIVE"
      ? "campFolderCard__status campFolderCard__status--active"
      : camp.status === "ARCHIVED"
      ? "campFolderCard__status campFolderCard__status--archived"
      : "campFolderCard__status";

  return (
    <article
      className={[
        "campFolderCard",
        camp.status === "ARCHIVED"
          ? "campFolderCard--archived"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="campFolderCard__main"
        onClick={onOpen}
      >
        <div className="campFolderCard__folder">
          <span className="campFolderCard__folderTab" />
        </div>

        <div className="campFolderCard__content">
          <div className="campFolderCard__topRow">
            <span className="campFolderCard__type">
              {CAMP_TYPE_LABELS[camp.camp_type] || "營隊"}
            </span>

            <span className={statusClass}>
              {STATUS_LABELS[camp.status] || camp.status}
            </span>
          </div>

          <h2>{camp.name}</h2>

          <p className="campFolderCard__dates">
            {formatDate(camp.start_date)}
            <span>—</span>
            {formatDate(camp.end_date)}
          </p>

          {camp.notes && (
            <p className="campFolderCard__note">
              {camp.notes}
            </p>
          )}

          <div className="campFolderCard__footer">
            <span>獨立營隊資料</span>
            <strong>進入營隊 →</strong>
          </div>
        </div>
      </button>
    </article>
  );
}

export default CampCard;