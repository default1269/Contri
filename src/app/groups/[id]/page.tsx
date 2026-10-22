"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Group = {
  id: string;
  name: string;
  created_at: string;
};

type Member = {
  user_id: string;
  role: string;
  joined_at: string;
  email?: string;
  full_name?: string;
};

type ExpenseSplit = { user_id: string; share_amount: number };
type Expense = {
  id: string;
  title: string;
  amount: number;
  paid_by: string;
  created_at: string;
  splits?: ExpenseSplit[];
};
type Settlement = {
  id: string;
  group_id: string;
  paid_by: string;
  paid_to: string;
  amount: number;
  created_at: string;
};

export default function GroupDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const groupId = params.id;

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  async function deleteGroup() {
    if (!group) return;
    const confirmDelete = window.confirm(`Delete group "${group.name}"? This will remove expenses, splits, settlements, and members.`);
    if (!confirmDelete) return;
    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc('delete_group_cascade', { p_group_id: groupId });
      if (error) {
        setMessage("Failed to delete group: " + error.message);
        return;
      }
      if (data !== true) {
        setMessage("Failed to delete group: no permission or group not found.");
        return;
      }
      router.push("/groups");
    } catch (e: unknown) {
      const errMsg = e && typeof e === "object" && "message" in e ? (e as { message?: string }).message : "Unknown error";
      setMessage("Failed to delete group: " + errMsg);
    }
  }
  
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [memberMessage, setMemberMessage] = useState("");
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementFrom, setSettlementFrom] = useState("");
  const [settlementTo, setSettlementTo] = useState("");
  const [savingSettlement, setSavingSettlement] = useState(false);
  async function loadGroup() {
    const supabase = createClient();
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        router.replace("/login");
        return;
      }
      setSettlementFrom(user.id);
      const { data: groupData, error: groupError } = await supabase.from("groups").select("id, name, created_at").eq("id", groupId).single();
      if (groupError || !groupData) {
        setMessage("Unable to load this group. Check your access or try again.");
        setLoading(false);
        return;
      }
      setGroup(groupData);
      const { data: membership, error: membershipError } = await supabase.from("group_members").select("user_id").eq("group_id", groupId).eq("user_id", user.id).maybeSingle();
      if (membershipError || !membership) {
        setMessage("You do not have access to this group.");
        setLoading(false);
        return;
      }
      const { data: memberData, error: memberError } = await supabase.from("group_members").select("user_id, role, joined_at").eq("group_id", groupId).order("joined_at", { ascending: true });
      if (!memberError) {
        const { data: profiles } = await supabase.from("profiles").select("id, email, full_name");
        setProfileName(((profiles as { id: string; full_name?: string }[])?.find((profile) => profile.id === user.id)?.full_name) ?? "");
        setMembers(((memberData ?? []) as { user_id: string; role: string; joined_at: string }[]).map((member) => {
          const profile = (profiles as { id: string; email?: string; full_name?: string }[])?.find((p) => p.id === member.user_id);
          return { ...member, email: profile?.email ?? "Unknown member", full_name: profile?.full_name ?? "" };
        }));
      }
      await loadExpenses();
      await loadSettlements();
      setLoading(false);
    } catch (e: unknown) {
      const errMsg = e && typeof e === "object" && "message" in e ? (e as { message?: string }).message : "Unknown error";
      setMessage("Error loading group: " + errMsg);
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGroup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, router]);

  async function addExpense() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !title.trim() || !amount || Number(amount) <= 0 || !paidBy) {
    setMessage("Please fill in all fields with valid values.");
    return;
  }

  if (members.length === 0) {
    setMessage("No group members found.");
    return;
  }

  setSaving(true);
  setMessage("");

  const { data: expense, error } = await supabase
    .from("expenses")
    .insert({
      group_id: groupId,
      title: title.trim(),
      amount: Number(amount),
      paid_by: paidBy,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !expense) {
    setMessage("Could not add expense: " + (error?.message || "Unknown error"));
    setSaving(false);
    return;
  }

  const totalCents = Math.round(Number(amount) * 100);
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
    setMessage(
      "Expense saved, but splitting failed: " + splitError.message
    );
    await loadExpenses();
    setSaving(false);
    return;
  }

  setTitle("");
  setAmount("");
  setPaidBy("");
  setMessage("Expense added and split equally!");
  await loadExpenses();

  setSaving(false);
}
async function addMember() {
  if (!memberEmail.trim()) {
    setMemberMessage("Enter the member's email address.");
    return;
  }

  setAddingMember(true);
  setMemberMessage("");

  try {
    const supabase = createClient();

    const { error } = await supabase.rpc("add_group_member_by_email", {
      target_group_id: groupId,
      target_email: memberEmail.trim().toLowerCase(),
    });

    if (error) {
      setMemberMessage("Could not add member: " + error.message);
      return;
    }

    const { data, error: memberError } = await supabase
      .from("group_members")
      .select("user_id, role, joined_at")
      .eq("group_id", groupId)
      .order("joined_at", { ascending: true });

    if (memberError) {
      setMemberMessage(
        "Member may have been added, but the list could not refresh: " +
          memberError.message
      );
      return;
    }

    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, full_name");

    if (profileError) {
      setMemberMessage(
        "Member added, but profiles could not be loaded: " +
          profileError.message
      );
      return;
    }

    setMembers(
      (data ?? []).map((member) => {
        const profile = profiles?.find(
          (p) => p.id.toLowerCase() === member.user_id.toLowerCase()
        );

        return {
          ...member,
          email: profile?.email ?? "Unknown member",
          full_name: profile?.full_name ?? "",
        };
      })
    );

    setMemberEmail("");
    setMemberMessage("Member added successfully!");
  } catch (error) {
    setMemberMessage(
      "Something went wrong: " +
        (error instanceof Error ? error.message : String(error))
    );
  } finally {
    setAddingMember(false);
  }
}
async function saveProfileName() {
  const name = profileName.trim();

  if (!name) {
    setProfileMessage("Please enter your name.");
    return;
  }

  setSavingProfile(true);
  setProfileMessage("");

  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setProfileMessage("Please log in again.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email: user.email ?? "",
          full_name: name,
        },
        { onConflict: "id" }
      );

    if (error) {
      setProfileMessage("Could not save your name: " + error.message);
      return;
    }

    setMembers((previous) =>
      previous.map((member) =>
        member.user_id === user.id
          ? {
              ...member,
              full_name: name,
              email: user.email ?? member.email,
            }
          : member
      )
    );

    setProfileMessage("Your name has been saved successfully!");
  } catch (error) {
    setProfileMessage(
      "Could not save your name: " +
        (error instanceof Error ? error.message : String(error))
    );
  } finally {
    setSavingProfile(false);
  }
}
async function recordSettlement() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const value = Math.round(Number(settlementAmount) * 100) / 100;

  if (!user || !settlementTo || !settlementAmount ||
      !Number.isFinite(value) || value <= 0) {
    setMessage("Please enter a valid settlement amount and select a recipient.");
    return;
  }

  if (user.id === settlementTo) {
    setMessage("The payer and recipient must be different.");
    return;
  }

  const balances = calculateBalances();
  const payerBalance = balances[user.id] ?? 0;
  const recipientBalance = balances[settlementTo] ?? 0;

  if (payerBalance >= 0 || recipientBalance <= 0) {
    setMessage("You can only record a payment to someone you owe.");
    return;
  }

  if (value > Math.min(-payerBalance, recipientBalance) + 0.001) {
    setMessage("The settlement amount cannot exceed the amount owed.");
    return;
  }

  setSavingSettlement(true);
  setMessage("");

  try {
    const { error } = await supabase.from("settlements").insert({
      group_id: groupId,
      paid_by: user.id,
      paid_to: settlementTo,
      amount: value,
    });

    if (error) {
      setMessage("Could not record settlement: " + error.message);
    } else {
      setSettlementFrom(user.id);
      setSettlementAmount("");
      setSettlementTo("");
      await loadSettlements();
      setMessage("Settlement recorded successfully!");
    }
  } finally {
    setSavingSettlement(false);
  }
}




function calculateBalances() {
  const balances: Record<string, number> = {};

  members.forEach((member) => {
    balances[member.user_id] = 0;
  });

  expenses.forEach((expense) => {
    if (!expense.splits || expense.splits.length === 0) return;

    balances[expense.paid_by] =
      (balances[expense.paid_by] ?? 0) + Number(expense.amount);

    expense.splits.forEach(
      (split: { user_id: string; share_amount: number }) => {
        balances[split.user_id] =
          (balances[split.user_id] ?? 0) - Number(split.share_amount);
      }
    );
  });

  settlements.forEach((settlement) => {
    balances[settlement.paid_by] =
      (balances[settlement.paid_by] ?? 0) + Number(settlement.amount);

    balances[settlement.paid_to] =
      (balances[settlement.paid_to] ?? 0) - Number(settlement.amount);
  });

  return balances;
}


async function loadExpenses() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("expenses")
    .select("id, title, amount, paid_by, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (error) {
    setMessage("Could not load expenses: " + error.message);
    return;
  }

  const expenseList = data ?? [];

  if (expenseList.length === 0) {
    setExpenses([]);
    return;
  }

  const { data: splitData, error: splitError } = await supabase
    .from("expense_splits")
    .select("expense_id, user_id, share_amount")
    .in("expense_id", expenseList.map((expense) => expense.id));

  if (splitError) {
    setMessage("Expenses loaded, but shares could not be loaded: " + splitError.message);
    setExpenses(expenseList);
    return;
  }

  setExpenses(
    expenseList.map((expense) => ({
      ...expense,
      splits: (splitData ?? []).filter(
        (split) => split.expense_id === expense.id
      ),
    }))
  );
}
async function loadSettlements() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("settlements")
    .select("id, group_id, paid_by, paid_to, amount, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (error) {
    setMessage("Could not load settlements: " + error.message);
    return;
  }

  setSettlements(data ?? []);
}
  
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
      </button>

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
          <button className="logout-button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>
    </aside>

    <section className="main-content">
      <header className="topbar">
        <div className="breadcrumb">
          Workspace <span>/</span> My Groups <span>/</span> {group?.name ?? "Group"}
        </div>
        <div className="top-actions">
          <span className="today-label">◷ &nbsp; October 2026</span>
          <button className="primary-button" onClick={deleteGroup} style={{ background: "#b71c1c", borderColor: "#b71c1c" }}>
            Delete Group
          </button>
        </div>
      </header>
      <div className="page-content">
        <section className="welcome-row">
  <div>
    <p className="eyebrow">YOUR SHARED SPACE</p>
    <h1>{group?.name ?? "Group details"}</h1>
    <p className="subtitle">
      Manage members, expenses and settlements in one place.
    </p>
  </div>
</section>

      {loading ? (
  <p>Loading group...</p>
) : group ? (
  <>
  <section className="panel" style={{ marginTop: 24 }}>
  <h2>Your Profile</h2>
  <p>Enter your name so other group members can recognize you.</p>

  <form
    onSubmit={(e) => {
      e.preventDefault();
      void saveProfileName();
    }}
    style={{ display: "grid", gap: 16 }}
  >
    <label style={{ display: "grid", gap: 8 }}>
  Your name
  <input
    type="text"
    value={profileName}
    onChange={(e) => setProfileName(e.target.value)}
    placeholder="Enter your full name"
    maxLength={80}
    style={{
      width: "100%",
      boxSizing: "border-box",
    }}
    required
  />
</label>

    <button
      type="submit"
      className="primary-button"
      disabled={savingProfile}
    >
      {savingProfile ? "Saving..." : "Save name"}
    </button>
  </form>

  {profileMessage && (
    <p role="status" style={{ marginTop: 12 }}>
      {profileMessage}
    </p>
  )}
</section>
    <div className="group-content-grid">

          <section
  className="panel"
  style={{
    marginTop: 24,
    width: "100%",
    maxWidth: 700,
    boxSizing: "border-box",
  }}
>
            <h2>Group members</h2>
            <p>{members.length} {members.length === 1 ? "member" : "members"}</p>

            {members.length === 0 ? (
              <p>No members found in this group.</p>
            ) : (
              members.map((member) => (
                <div
                  key={member.user_id}
                  style={{
                    padding: "14px 0",
                    borderTop: "1px solid #e5e9e2",
                  }}
                >
                  
<strong>
  {member.full_name || member.email || "Unknown member"}
</strong>

<p style={{ color: "#718075", marginBottom: 0 }}>
  {member.role === "owner" ? "Group owner" : "Member"}
</p>

                </div>
              ))
            )}
          </section>
          <section className="panel">
  <h2>Add a member</h2>

  <form
    onSubmit={(e) => {
      e.preventDefault();
      addMember();
    }}
    style={{ display: "grid", gap: 16 }}
  >
    <input
      type="email"
      placeholder="Enter member's email"
      value={memberEmail}
      onChange={(e) => setMemberEmail(e.target.value)}
      required
    />

    <button
  type="submit"
  className="primary-button"
  disabled={addingMember}
>
  {addingMember ? "Adding..." : "Add member"}
</button>
  </form>
  {memberMessage && (
  <p role="status" style={{ marginTop: 12 }}>
    {memberMessage}
  </p>
)}
</section>
          <section className="panel" style={{ marginTop: 24 }}>
  <h2>Add an expense</h2>

  <form
    onSubmit={(e) => {
      e.preventDefault();
      addExpense();
    }}
    style={{ display: "grid", gap: 16 }}
  >
    <input
      placeholder="Expense description"
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      required
    />

    <input
      type="number"
      placeholder="Amount (₹)"
      value={amount}
      onChange={(e) => setAmount(e.target.value)}
      min="0.01"
      step="0.01"
      required
    />

    
<label>Paid by</label>
<select
  value={paidBy}
  onChange={(e) => setPaidBy(e.target.value)}
>
  <option value="">Select who paid</option>
  {members.map((member) => (
    <option key={member.user_id} value={member.user_id}>
      {member.full_name ||
  (member.role === "owner" ? "Group owner" : "Member")}
    </option>
  ))}
</select>


    <button
  type="submit"
  className="primary-button"
  disabled={saving}
>
  {saving ? "Saving..." : "Add expense"}
</button>
  </form>

</section>
<section className="panel" style={{ marginTop: 24 }}>

  <h2>Group expenses</h2>
<div className="expenses-scroll-box">
  {expenses.length === 0 ? (
    <p>No expenses added yet.</p>
  ) : (
    expenses.map((expense) => (
      <div
        key={expense.id}
        style={{
          padding: "14px 0",
          borderTop: "1px solid #e5e9e2",
        }}
      >
        <strong>{expense.title}</strong>
        <p style={{ margin: "6px 0" }}>
          Amount: ₹{Number(expense.amount).toFixed(2)}
        </p>
        <p style={{ color: "#718075", margin: 0 }}>
          Paid by:{" "}
          {members.find((member) => member.user_id === expense.paid_by)
  ?.full_name ||
  members.find((member) => member.user_id === expense.paid_by)
    ?.email ||
  "Unknown member"}
        </p>
        <p style={{ color: "#718075", margin: "6px 0 0" }}>
          {new Date(expense.created_at).toLocaleDateString("en-IN")}
        </p>
        {expense.splits && expense.splits.length > 0 && (
  <div style={{ marginTop: 12 }}>
    <strong>Split details</strong>

    {expense.splits.map((split: { user_id: string; share_amount: number }) => (
      <p
        key={split.user_id}
        style={{ color: "#718075", margin: "6px 0" }}
      >
        {members.find((member) => member.user_id === split.user_id)
  ?.full_name ||
  members.find((member) => member.user_id === split.user_id)
    ?.email ||
  "Unknown member"}
      </p>
    ))}
  </div>
)}
      </div>
      
    ))
  )}
  </div>
</section>
<section className="panel" style={{ marginTop: 24 }}>
  <h2>Member balances</h2>

  {Object.entries(calculateBalances()).map(([userId, balance]) => (
    <div
      key={userId}
      style={{
        padding: "14px 0",
        borderTop: "1px solid #e5e9e2",
      }}
    >
      
<strong>
  {members.find((member) => member.user_id === userId)?.full_name ||
    members.find((member) => member.user_id === userId)?.email ||
    "Unknown member"}
</strong>


      <p
        style={{
          marginBottom: 0,
          color: balance > 0 ? "#287a45" : balance < 0 ? "#b42318" : "#718075",
        }}
      >
        {balance > 0
          ? `Should receive ₹${balance.toFixed(2)}`
          : balance < 0
          ? `Owes ₹${Math.abs(balance).toFixed(2)}`
          : "Settled up"}
      </p>
    </div>
  ))}
</section>
<section className="panel">
 
<section className="panel">
  <h2>Settlement history</h2>

  {settlements.length === 0 ? (
    <p style={{ color: "#718075" }}>
      No settlements recorded yet.
    </p>
  ) : (
    settlements.map((settlement) => {
      const payer = members.find(
        (member) => member.user_id === settlement.paid_by
      );

      const recipient = members.find(
        (member) => member.user_id === settlement.paid_to
      );

      const payerName =
        payer?.full_name ||
        payer?.email ||
        (payer?.role === "owner" ? "Group owner" : "Unknown member");

      const recipientName =
        recipient?.full_name ||
        recipient?.email ||
        (recipient?.role === "owner" ? "Group owner" : "Unknown member");

      return (
        <div
          key={settlement.id}
          style={{
            padding: "14px 0",
            borderTop: "1px solid #e5e9e2",
          }}
        >
          <strong>
            {payerName} paid {recipientName}
          </strong>

          <p style={{ margin: "6px 0" }}>
            Amount: ₹{Number(settlement.amount).toFixed(2)}
          </p>

          <p style={{ color: "#718075", margin: 0 }}>
            {new Date(settlement.created_at).toLocaleDateString("en-IN")}
          </p>
        </div>
      );
    })
  )}
</section>

<h2>Record a settlement</h2>

<form
  onSubmit={(e) => {
    e.preventDefault();
    recordSettlement();
  }}
  style={{ display: "grid", gap: 16 }}
>
  
  <label>
    Paid by
    <select
      value={settlementFrom}
      onChange={(e) => setSettlementFrom(e.target.value)}
      required
    >
      <option value="">Select payer</option>
      {members.map((member) => (
        <option key={member.user_id} value={member.user_id}>
          {member.full_name ||
  (member.role === "owner" ? "Group owner" : "Member")}
        </option>
      ))}
    </select>
  </label>


  <label>
    Paid to
    <select
      value={settlementTo}
      onChange={(e) => setSettlementTo(e.target.value)}
      required
    >
      <option value="">Select recipient</option>
      {members
        .filter(
          (member) =>
            member.user_id !== settlementFrom &&
            member.user_id !== ""
        )
        .map((member) => (
          <option key={member.user_id} value={member.user_id}>
            {member.full_name ||
  (member.role === "owner" ? "Group owner" : "Member")}
          </option>
        ))}
    </select>
  </label>

  <input
    type="number"
    placeholder="Amount (₹)"
    value={settlementAmount}
    onChange={(e) => setSettlementAmount(e.target.value)}
    min="0.01"
    step="0.01"
    required
  />

  <button
  type="submit"
  className="primary-button"
  disabled={savingSettlement}
>
  {savingSettlement ? "Saving..." : "Record settlement"}
</button>
</form>

</section>
    </div>
  </>
) : (
        <p>{message || "Group not found."}</p>
      )}

              {message && group && <p role="status">{message}</p>}
      </div>
    </section>
  </main>
);
}