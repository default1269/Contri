[README.md](https://github.com/user-attachments/files/33873730/README.md)
# Contri

Contri is a shared-expense tracker. Users create groups, add expenses, split them among members, record settlements, and see who owes whom.

## Tech Stack

- Next.js 15 (App Router) with React 19 and TypeScript
- Supabase (PostgreSQL, Auth) via `@supabase/supabase-js` and `@supabase/ssr`
- ESLint (`next/core-web-vitals`)

## Features

- Groups with members
- Expenses split among group members (`expenses`, `expense_splits` tables)
- Settlements between members
- Cascade deletion of a group and all its data (`supabase/supabase_delete_group_cascade.sql`)

## Prerequisites

- Node.js 20.9 or newer (Supabase packages require Node 22+; use Node 22 to be safe)
- A free Supabase project

## How to Run

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the environment template and fill in your Supabase values (Project Settings > API):
   ```bash
   cp env.example .env.local
   ```
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. In the Supabase SQL editor, create the tables (`groups`, `group_members`, `expenses`, `expense_splits`, `settlements`), then run `supabase/supabase_delete_group_cascade.sql`.
4. Start the dev server:
   ```bash
   npm run dev
   ```
5. Open http://localhost:3000.

Production build: `npm run build && npm start`.

## Project Structure

```
app/ or src/        Application source (pages, components, Supabase clients)
supabase/           SQL functions
env.example         Environment variable template
```

## My Contribution

<!-- Fill in: what you personally built (e.g. auth flow, expense splitting logic, UI, database schema). -->
