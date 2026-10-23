# Contri

Contri is a shared-expense tracker. Users create groups, add expenses, split them among members, record settlements, and see who owes whom.

## Tech Stack

- Next.js 15 (App Router) with React 19 and TypeScript
- Supabase (PostgreSQL, Auth, Row Level Security) via `@supabase/supabase-js` and `@supabase/ssr`
- ESLint (`next/core-web-vitals`)

## Features

- Sign up and log in with Supabase Auth (a profile is created automatically on signup)
- Groups with members; existing members can add others by email
- Expenses split among group members (`expenses`, `expense_splits` tables)
- Settlements between members
- Cascade deletion of a group and all its data (`delete_group_cascade` database function)
- Row Level Security so users only see data from their own groups

## Prerequisites

- Node.js 20.9 or newer (Node 22 recommended)
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
3. In the Supabase SQL editor, paste and run `schema.sql`. It creates all tables, security policies, functions and the signup trigger.

4. Start the dev server:
```bash
   npm run dev
```
5. Open http://localhost:3000 and sign up with an email address.

Production build: `npm run build && npm start`.

## Project Structure

```
src/          Application source (pages, components, Supabase clients)
public/       Static assets
schema.sql    Full database setup for Supabase
env.example   Environment variable template
```
