# Coding Standards — Sistem Tugas

## Bahasa
- **User-facing text** (UI, error messages, toast): Bahasa Indonesia
- **Code identifiers** (variables, functions, types): English
- **Comments**: Bahasa Indonesia
- **Git commit messages**: English with RALPH prefix

## Style
- Use `camelCase` for variables and functions
- Use `PascalCase` for React components, types, and interfaces
- Prefer named exports over default exports (except page components)
- Use `type` over `interface` for prop types
- No semicolons (TypeScript strict mode handles this)
- Single quotes for strings
- 2-space indentation

## React
- One component per file
- Co-locate sub-components in the same file if they are only used by the parent
- Use Tailwind CSS classes only — no inline `style={{}}` and no global CSS
- Use `React.lazy()` for page-level components
- Use TanStack Query (`useQuery`, `useMutation`) for all server state
- No `window.confirm()` — always use `<ConfirmModal>`
- No `dangerouslySetInnerHTML` — use React components

## Backend (Hono + Cloudflare Workers)
- One route module per domain in `workers/api/src/routes/`
- All endpoints return JSON with consistent error format: `{ error: string }`
- Use `requireAuth()` helper for protected routes
- Use prepared statements for all D1 queries
- Validate input at the start of every handler before any DB calls

## Testing
- Test external behavior, not implementation details
- Every API endpoint must have: happy path test + error case test + auth test
- Component tests must cover: loading, empty, error, and success states
- E2E tests must cover: complete guru flow and complete siswa flow
- Use descriptive test names in English

## Architecture
- Keep modules focused on a single domain (tasks, classes, submissions, auth, admin)
- Prefer composition over inheritance
- Shared utilities go in `lib/` folders
- No circular imports
- Use path alias `@/` instead of relative imports with `../../`

## Security
- Never log credentials or tokens
- Never store passwords (plaintext or encrypted) in browser storage
- Validate file types server-side, not just client-side
- All teacher routes require JWT auth
- Admin routes require X-Admin-Key + rate limiting
