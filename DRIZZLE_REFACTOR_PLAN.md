# Drizzle Migration System Refactor

## Problem
Current database schema management is broken:
- Using raw SQL file (`schema.sql`) instead of Drizzle migrations
- No `drizzle.config.ts` configuration
- Dual schema definitions that get out of sync
- No migration history tracking
- Manual table creation is error-prone

## Solution
Implement proper Drizzle ORM migration system.

## Files to Create/Modify

### Phase 1: Drizzle Setup
1. **Create `apps/server/drizzle.config.ts`** - Drizzle Kit configuration
2. **Update `apps/server/package.json`** - Add drizzle scripts
3. **Create `apps/server/src/db/migrate.ts`** - Proper migration runner

### Phase 2: Schema Cleanup
4. **Update `apps/server/src/db/schema.ts`** - Ensure all tables properly defined
5. **Delete `apps/server/src/db/schema.sql`** - Remove redundant SQL file
6. **Update `apps/server/src/db/init.ts`** - Use Drizzle migrations instead of raw SQL

### Phase 3: Fix Auth Module
7. **Fix `apps/server/src/auth/session.ts`** - Type errors with sessions table
8. **Fix `apps/server/src/auth/index.ts`** - Ensure using Drizzle properly
9. **Fix `apps/server/src/routes/auth.ts`** - Cookie and session handling

### Phase 4: Cleanup & Test
10. **Remove temp files** - `create-sessions-table.ts`
11. **Test registration/login** - Verify auth flow works
12. **Test Electron app** - Full integration test

## Drizzle Config Template

```typescript
// apps/server/drizzle.config.ts
import type { Config } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

## Package.json Scripts

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:studio": "drizzle-kit studio"
  }
}
```

## Migration Command Flow

1. **Development**: `pnpm db:push` - Push schema changes directly (no migration files)
2. **Production**: `pnpm db:generate` → `pnpm db:migrate` - Generate migration files and run them

## Agent Assignments

- **Agent 1**: Create drizzle.config.ts and update package.json scripts
- **Agent 2**: Fix schema.ts (ensure sessions table is correct with proper types)
- **Agent 3**: Fix auth/session.ts and auth/index.ts type errors
- **Agent 4**: Replace init.ts with proper Drizzle migration approach
- **Agent 5**: Clean up and final testing

## Success Criteria

- [ ] `pnpm db:push` works without errors
- [ ] All tables created via Drizzle (no raw SQL)
- [ ] TypeScript compiles with no errors
- [ ] Registration and login work in Electron app
- [ ] Session persistence works across app restarts