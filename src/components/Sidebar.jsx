import { useState } from "react";
import { supabase } from "../lib/supabase";

function Sidebar({ pages, activePage, setActivePage }) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  async function handleSignOut() {
    try {
      setIsSigningOut(true);
      setSignOutError("");

      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error("登出失敗：", error);
      setSignOutError("登出失敗，請稍後再試。");
      setIsSigningOut(false);
    }
  }

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

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <span className="sidebar-user__name">Lin</span>
          <span className="sidebar-user__role">管理員</span>
        </div>

        {signOutError && (
          <p className="sidebar-signout-error">{signOutError}</p>
        )}

        <button
          type="button"
          className="sidebar-signout"
          onClick={handleSignOut}
          disabled={isSigningOut}
        >
          {isSigningOut ? "登出中…" : "登出"}
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;