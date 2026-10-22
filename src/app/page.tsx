
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Expense = {
  id: string;
  title: string;
  group: string;
  groupId: string;
  amount: number;
  date: string;
  paidBy: string;
  paidById: string;
};

type Group = {
  id: string;
  name: string;
  members: number;
  icon: string;
  color: string;
};

const money = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function Home() {
  const router = useRouter();

async function handleLogout() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    alert("Unable to log out. Please try again.");
    return;
  }

  router.replace("/login");
  router.refresh();
}
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [group, setGroup] = useState("");
  const [paidBy, setPaidBy] = useState("You");
  const [active, setActive] = useState("Overview");
  const [dbGroups, setDbGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [youAreOwed, setYouAreOwed] = useState(0);
  const [youOwe, setYouOwe] = useState(0);

  
  useEffect(() => {
  
async function loadGroups() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    setGroupsLoading(false);
    return;
  }

  const { data: memberships, error } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);

  if (error) {
    console.error("Error loading memberships:", error.message);
    setGroupsLoading(false);
    return;
  }

  const groupIds = (memberships ?? []).map((m) => m.group_id);

  if (groupIds.length === 0) {
    setDbGroups([]);
    setGroupsLoading(false);
    return;
  }

  const { data, error: groupError } = await supabase
    .from("groups")
    .select("id, name, created_at")
    .in("id", groupIds)
    .order("created_at", { ascending: false });

  if (groupError) {
    console.error("Error loading groups:", groupError.message);
    setGroupsLoading(false);
    return;
  }

  const groupsWithCounts = await Promise.all(
    (data ?? []).map(async (g, i) => {
      const { count, error: countError } = await supabase
        .from("group_members")
        .select("user_id", { count: "exact", head: true })
        .eq("group_id", g.id);

      if (countError) {
        console.error("Error loading member count:", countError.message);
      }

      return {
        ...g,
        members: countError ? 0 : count ?? 0,
        icon: ["✈", "⌂", "♡"][i % 3],
        color: ["lavender", "mint", "peach"][i % 3],
      };
    })
  );

  setDbGroups(groupsWithCounts);
setGroup((current) =>
  groupsWithCounts.some((g) => g.name === current)
    ? current
    : groupsWithCounts[0]?.name ?? ""
);
setGroupsLoading(false);
}


async function loadDashboardData() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return;

  const { data: memberships, error: memberError } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);

  if (memberError) {
    console.error("Could not load memberships:", memberError.message);
    return;
  }

  const groupIds = (memberships ?? []).map((m) => m.group_id);

  if (groupIds.length === 0) {
    setExpenses([]);
    setTotal(0);
    setYouAreOwed(0);
    setYouOwe(0);
    return;
  }

  const { data: groupData, error: groupError } = await supabase
    .from("groups")
    .select("id, name")
    .in("id", groupIds);

  if (groupError) {
    console.error("Could not load group names:", groupError.message);
    return;
  }

  const groupNames = new Map(
    (groupData ?? []).map((g) => [g.id, g.name])
  );

  const { data: expenseData, error: expenseError } = await supabase
    .from("expenses")
    .select("id, group_id, title, amount, paid_by, created_at")
    .in("group_id", groupIds)
    .order("created_at", { ascending: false });

  if (expenseError) {
    console.error("Could not load expenses:", expenseError.message);
    return;
  }

  const rows = expenseData ?? [];
  setTotal(rows.reduce((sum, e) => sum + Number(e.amount), 0));

  const expenseIds = rows.map((e) => e.id);
  let splits: { expense_id: string; user_id: string; share_amount: number }[] = [];

  if (expenseIds.length > 0) {
    const { data: splitData, error: splitError } = await supabase
      .from("expense_splits")
      .select("expense_id, user_id, share_amount")
      .in("expense_id", expenseIds);

    if (splitError) {
      console.error("Could not load expense splits:", splitError.message);
      return;
    }

    splits = splitData ?? [];
    
  }

  const { data: settlementData, error: settlementError } = await supabase
    .from("settlements")
    .select("group_id, paid_by, paid_to, amount")
    .in("group_id", groupIds);

  if (settlementError) {
    console.error("Could not load settlements:", settlementError.message);
    return;
  }

  
  
  
  let owed = 0;
  let owes = 0;

  const myPaid = rows
    .filter((e) => e.paid_by === user.id)
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const myShares = splits
    .filter((s) => s.user_id === user.id)
    .reduce((sum, s) => sum + Number(s.share_amount), 0);

  const mySettlementsPaid = (settlementData ?? [])
    .filter((s) => s.paid_by === user.id)
    .reduce((sum, s) => sum + Number(s.amount), 0);

  const mySettlementsReceived = (settlementData ?? [])
    .filter((s) => s.paid_to === user.id)
    .reduce((sum, s) => sum + Number(s.amount), 0);

  const balance =
    myPaid - myShares + mySettlementsPaid - mySettlementsReceived;
  
  if (balance > 0) owed = balance;
  if (balance < 0) owes = -balance;

  setYouAreOwed(Math.round(owed * 100) / 100);
  setYouOwe(Math.round(owes * 100) / 100);

  setExpenses(
    rows.slice(0, 10).map((e) => ({
      id: e.id,
      title: e.title,
      group: groupNames.get(e.group_id) ?? "Group",
      groupId: e.group_id,
      amount: Number(e.amount),
      date: new Date(e.created_at).toLocaleDateString(),
      paidBy: e.paid_by === user.id ? "You" : "Member",
      paidById: e.paid_by,
    }))
  );
}

  loadGroups();
loadDashboardData();
}, []);

  


async function addExpense(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();

  const value = Number(amount);
  if (!title.trim() || !Number.isFinite(value) || value <= 0) {
    alert("Enter a valid expense name and amount.");
    return;
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    alert("Please log in again.");
    return;
  }

  const selectedGroup = dbGroups.find((g) => g.name === group);

  if (!selectedGroup) {
    alert("Please select a valid group.");
    return;
  }

  const { data: members, error: memberError } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", selectedGroup.id);

  if (memberError || !members?.length) {
    alert("Could not load group members.");
    return;
  }

  const { data: expense, error } = await supabase
    .from("expenses")
    .insert({
      group_id: selectedGroup.id,
      title: title.trim(),
      amount: value,
      paid_by: user.id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !expense) {
    alert("Could not save expense: " + (error?.message ?? "Unknown error"));
    return;
  }

  const totalCents = Math.round(value * 100);
  const baseCents = Math.floor(totalCents / members.length);
  const remainder = totalCents % members.length;

  const splits = members.map((member, index) => ({
    expense_id: expense.id,
    user_id: member.user_id,
    share_amount: (baseCents + (index < remainder ? 1 : 0)) / 100,
  }));

  const { error: splitError } = await supabase
    .from("expense_splits")
    .insert(splits);

  if (splitError) {
    alert("Expense saved, but splitting failed: " + splitError.message);
    return;
  }

  setTitle("");
  setAmount("");
  setShowForm(false);
  setMessage("Expense added.");
  setSaving(false);
  await loadDashboardData();
}


  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#">
          <span className="brand-icon">c</span>
          <span>contri<span className="brand-dot">.</span></span>
        </a>

        <p className="nav-label">WORKSPACE</p>
        {["Overview", "My Groups"].map((item, i) => (
          <button
            key={item}
            className={`nav-item ${active === item ? "selected" : ""}`}
            onClick={() => {
              if (item === "My Groups") {
                router.push("/groups");
              } else if (item === "Overview") {
                setActive("Overview");
              }
            }}
          >
            <span className="nav-symbol">{["◫", "♧"][i]}</span>
            <span className="nav-label">{item}</span>
            {item === "My Groups" && (
  <span className="nav-count">{dbGroups.length}</span>
)}
          </button>
        ))}

        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">✳</span>
            <strong>Split smarter.</strong>
            <p>Good friends. Clear expenses. No awkward maths.</p>
          </div>
          
<div className="profile">
  <div className="avatar">Y</div>
  <div className="profile-text">
    <strong>Your Account</strong>
    <span>Free plan</span>
  </div>
  <button
    type="button"
    className="logout-button"
    onClick={handleLogout}
  >
    Log out
  </button>
</div>

        </div>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> {active}</div>
        <div className="top-actions">
          <span className="today-label">◷ &nbsp; October 2026</span>
        </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <p className="eyebrow">YOUR MONEY, IN SYNC</p>
              <h1>{active === "Overview" ? "Good to see you." : active}</h1>
              <p className="subtitle">
                {active === "Overview"
                  ? "Here's what's happening with your shared expenses."
                  : `Keep track of your ${active.toLowerCase()} in one place.`}
              </p>
            </div>
            <button className="primary-button" onClick={() => setShowForm(!showForm)}>
              <span>＋</span> Add expense
            </button>
          </section>

          {showForm && (
            <form className="expense-form" onSubmit={addExpense}>
              <div className="form-heading">
                <h2>Add a new expense</h2>
                <button type="button" className="close-button" onClick={() => setShowForm(false)}>✕</button>
              </div>
              <label>
                Expense name
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Dinner, groceries" required />
              </label>
              <div className="form-grid">
                <label>
                  Amount (₹)
                  <input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" required />
                </label>
                <label>
                  Group
                  <select value={group} onChange={e => setGroup(e.target.value)}>
                  {dbGroups.map((g: Group) => (
                  <option key={g.id} value={g.name}>{g.name}</option>
                  ))}
                </select>
                </label>
              </div>
              <label>
                Paid by
                <select value={paidBy} onChange={e => setPaidBy(e.target.value)}>
                <option value="You">You</option>
              </select>
              </label>
              <button className="primary-button submit-button" type="submit">Save expense</button>
            </form>
          )}

          <section className="stats-grid">
            <article className="stat-card">
              <div className="stat-top"><span>Total expenses</span><span className="stat-icon purple">↗</span></div>
              <h2>{money(total)}</h2>
              <p className="stat-note">Across all recorded expenses</p>
              <div className="stat-bar"><span style={{ width: "72%" }} /></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>You are owed</span><span className="stat-icon green">↓</span></div>
              <h2 className="green-text">{money(youAreOwed)}</h2>
              <p className="stat-note">Based on your recorded expenses</p>
              <div className="stat-bar green-bar"><span style={{ width: "62%" }} /></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>You owe</span><span className="stat-icon orange">↑</span></div>
              <h2>{money(youOwe)}</h2>
              <p className="stat-note">Based on your recorded expenses</p>
              <div className="stat-bar orange-bar"><span style={{ width: "32%" }} /></div>
            </article>
          </section>

          <section className="content-grid">
            <article className="panel transactions-panel">
              <div className="panel-heading">
                <div><h2>Recent expenses</h2><p>Your latest shared spending</p></div>
                
              </div>

              <div className="transaction-list">
                {expenses.map((expense, i) => (
                  <div className="transaction" key={expense.id}>
                    <div className={`transaction-icon transaction-${i % 4}`}>
                      {["◈", "⌂", "♡", "↗"][i % 4]}
                    </div>
                    <div className="transaction-info">
                      <strong>{expense.title}</strong>
                      <span>{expense.group} · Paid by {expense.paidBy}</span>
                    </div>
                    <div className="transaction-amount">
                      <strong>{money(expense.amount)}</strong>
                      <span>{expense.date}</span>
                    </div>
                  </div>
                ))}
                {expenses.length === 0 && <p className="empty-state">No expenses yet. Add your first one!</p>}
              </div>
            </article>

            <article className="panel groups-panel">
              <div className="panel-heading">
                <div><h2>Your groups</h2><p>People you share with</p></div>
                <button
  type="button"
  className="round-plus"
  aria-label="Open My Groups"
  onClick={() => router.push("/groups")}
>
  ＋
</button>
              </div>
              <div className="group-list">
                {(groupsLoading ? [] : dbGroups).map(g => (
                  <button className="group-row" key={g.id} onClick={() => router.push("/groups/" + g.id)}>
                    <span className={`group-icon ${g.color}`}>{g.icon}</span>
                    <span className="group-info"><strong>{g.name}</strong><span>{g.members} {g.members === 1 ? "member" : "members"}</span></span>
                    <span className="group-arrow">›</span>
                  </button>
                ))}
              </div>
              
            </article>
          </section>

          <footer className="page-footer">
            <span>© 2026 Contri</span>
            <span>Made for sharing, built for clarity. <span className="footer-heart">♥</span></span>
          </footer>
        </div>
      </section>
    </main>
  );
}
