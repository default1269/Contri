
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Group = {
  id: string;
  name: string;
  created_at: string;
};

export default function GroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  
  const [loading, setLoading] = useState(true);
  
  const [message, setMessage] = useState("");

  
async function loadGroups() {
  const supabase = createClient();
  const { data: { user }, error: authError } =
    await supabase.auth.getUser();

  if (authError || !user) {
    router.replace("/login");
    return;
  }

  const { data: memberships, error: memberError } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);

  if (memberError) {
    setMessage(memberError.message);
    setGroups([]);
    setLoading(false);
    return;
  }

  const groupIds = (memberships ? memberships.map((m: { group_id: string }) => m.group_id) : []).filter(Boolean);
  if (groupIds.length === 0) {
    setGroups([]);
    setLoading(false);
    return;
  }

  const { data, error } = await supabase
    .from("groups")
    .select("id, name, created_at")
    .in("id", groupIds)
    .order("created_at", { ascending: false });

  if (error) setMessage(error.message);
  else setGroups(data ?? []);

  setLoading(false);
}

async function createGroupFromPrompt(groupName: string) {
  setMessage("");

  const supabase = createClient();
  const { data: { user }, error: authError } =
    await supabase.auth.getUser();

  if (authError || !user) {
    router.replace("/login");
    return;
  }

  const { data: group, error } = await supabase
    .from("groups")
    .insert({
      name: groupName,
      created_by: user.id,
    })
    .select("id, name, created_at")
    .single();

  if (error) {
    setMessage(error.message);
    return;
  }

  const { error: memberError } = await supabase
    .from("group_members")
    .insert({
      group_id: group.id,
      user_id: user.id,
      role: "owner",
    });

  if (memberError) {
    setMessage(
      "Group created, but adding you as a member failed: " +
      memberError.message
    );
    await loadGroups();
    return;
  }

  setGroups(previous => [group, ...previous]);
  setMessage("Group created successfully!");
}


  async function deleteGroup(groupId: string, groupName: string) {
    const confirmDelete = window.confirm(`Delete group "${groupName}"? This action cannot be undone.`);
    if (!confirmDelete) return;
    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc('delete_group_cascade', { p_group_id: groupId });
      if (error) {
        setMessage("Failed to delete group: " + error.message);
        await loadGroups();
        return;
      }
      if (data !== true) {
        setMessage("Failed to delete group: no permission or group not found.");
        await loadGroups();
        return;
      }
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      setMessage("Group deleted.");
    } catch (e: unknown) {
      const errMsg = e && typeof e === "object" && "message" in e ? (e as { message?: string }).message : "Unknown error";
      setMessage("Failed to delete group: " + errMsg);
      await loadGroups();
    }
  }

  useEffect(() => {
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
  <main className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <span className="brand-icon">c</span>
        <span>contri<span className="brand-dot">.</span></span>
      </button>

      <p className="nav-label">WORKSPACE</p>

      <button className="nav-item" onClick={() => router.push("/")}>
        <span className="nav-symbol">◫</span> Overview
      </button>

      <button className="nav-item selected" onClick={() => router.push("/groups")}>
        <span className="nav-symbol">♧</span> My Groups
        <span className="group-count">{groups.length}</span>
      </button>

      <div className="sidebar-bottom">
        <div className="help-card">
          <span className="help-icon">✳</span>
          <strong>Split smarter.</strong>
          <p>Good friends. Clear expenses. No awkward maths.</p>
        </div>
      </div>
    </aside>

    <section className="main-content">
      <header className="topbar">
        <div className="breadcrumb">
          Workspace <span>/</span> My Groups
        </div>
        <div className="top-actions">
          <span className="today-label">◷ &nbsp; October 2026</span>
        </div>
      </header>

      <div className="page-content">
        
<section className="welcome-row">
  <div>
    <p className="eyebrow">YOUR MONEY, IN SYNC</p>
    <h1>My Groups</h1>
    <p className="subtitle">
      Keep track of the groups you share expenses with.
    </p>
  </div>

  <button
    className="primary-button"
    onClick={() => {
      const groupName = window.prompt("Enter the new group name:");
      if (groupName?.trim()) createGroupFromPrompt(groupName.trim());
    }}
  >
    + Create group
  </button>
</section>


        {message && <p role="status">{message}</p>}

        <section className="panel" style={{ marginTop: 24 }}>
          <div className="section-heading">
            <div>
              <h2>Your groups</h2>
              <p className="subtitle">People you share with</p>
            </div>
            

<button
  type="button"
  className="icon-button"
  aria-label="Create group"
  onClick={() => {
    const groupName = window.prompt("Enter the new group name:");

    if (groupName?.trim()) {
      void createGroupFromPrompt(groupName.trim());
    }
  }}
>
  +
</button>


          </div>

          {loading ? (
            <p>Loading groups...</p>
          ) : groups.length === 0 ? (
            <p>You are not in any groups yet.</p>
          ) : (
            <div className="group-list">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="group-list-item"
                  onClick={() => router.push(`/groups/${group.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/groups/${group.id}`);
                    }
                  }}
                >
                  <span className="group-icon">✈</span>
                  <span className="group-list-details">
                    <strong>{group.name}</strong>
                    <span>Open shared space</span>
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Delete group"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteGroup(group.id, group.name);
                    }}
                    style={{ marginLeft: "auto", color: "#b71c1c" }}
                  >
                    ×
                  </button>
                  <span className="group-arrow">›</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  </main>
);
}