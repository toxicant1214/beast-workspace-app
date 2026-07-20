function Sidebar({ pages, activePage, setActivePage }) {
  return (
    <aside className="sidebar">
      <div className="brand">W.</div>
      <h2>WORKSPACE</h2>

      <nav>
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            className={activePage === page ? "active" : ""}
            onClick={() => setActivePage(page)}
          >
            {page}
          </button>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;