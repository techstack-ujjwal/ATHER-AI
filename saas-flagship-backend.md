# BACKEND ARCHITECTURE
## SaaS Flagship Website Builder — API, Services & Infrastructure

> Authored as: Senior Backend Architect  
> Runtime: Node.js 22 (LTS) · TypeScript 5  
> Framework: Next.js 15 App Router (API Routes) + tRPC v11  
> Database: PostgreSQL 16 via Prisma ORM (see `saas-flagship-database.md`)  
> Queue: BullMQ + Redis  
> AI: Anthropic Claude API (claude-sonnet-4-6)  
> Storage: Supabase Storage (S3-compatible)  
> Auth: Supabase Auth + custom JWT middleware  
> Payments: Stripe  
> Last updated: March 2026

---

## ARCHITECT'S NOTE

This backend powers a **multi-phase generative SaaS platform**. The critical path is:

```
User answers 52 questions → Discovery complete → Generation Job queued
→ Worker calls Claude API with structured prompt → Output parsed + stored
→ Client polls status → Output rendered section-by-section
```

Every architectural decision is made around three constraints:
1. **Generation is expensive and slow** — Claude calls are async, streamed, and must be resumable.
2. **Multi-tenancy is non-negotiable** — org isolation must be enforced at the service layer, not just the API.
3. **Outputs must be structured** — raw LLM markdown is not sufficient; the system parses and stores each output section as discrete, queryable records.

---

## DIRECTORY STRUCTURE

```
/
├── app/
│   ├── api/
│   │   ├── trpc/[trpc]/route.ts          ← tRPC HTTP handler
│   │   ├── webhooks/
│   │   │   ├── stripe/route.ts           ← Stripe webhook handler
│   │   │   └── clerk/route.ts            ← Auth webhook (if using Clerk)
│   │   └── assets/upload/route.ts        ← Multipart file upload endpoint
│   └── (app)/                            ← Next.js UI routes (frontend concern)
│
├── server/
│   ├── trpc/
│   │   ├── init.ts                       ← tRPC instance + context
│   │   ├── router.ts                     ← Root router (merges all sub-routers)
│   │   └── routers/
│   │       ├── auth.ts
│   │       ├── organizations.ts
│   │       ├── projects.ts
│   │       ├── discovery.ts
│   │       ├── outputs.ts
│   │       ├── assets.ts
│   │       └── billing.ts
│   │
│   ├── services/
│   │   ├── auth.service.ts               ← Session validation, token refresh
│   │   ├── organization.service.ts       ← Org CRUD, membership management
│   │   ├── project.service.ts            ← Project lifecycle
│   │   ├── discovery.service.ts          ← Session management, answer persistence
│   │   ├── generation.service.ts         ← Job creation, status polling
│   │   ├── output.service.ts             ← Output parsing, section storage
│   │   ├── design-system.service.ts      ← Token extraction from output
│   │   ├── asset.service.ts              ← Upload, validate, store assets
│   │   ├── billing.service.ts            ← Plan checks, Stripe sync
│   │   └── ai/
│   │       ├── prompt-builder.ts         ← Assembles the full generation prompt
│   │       ├── output-parser.ts          ← Parses Claude's markdown into sections
│   │       ├── token-extractor.ts        ← Extracts design tokens from output
│   │       └── claude.client.ts          ← Anthropic SDK wrapper
│   │
│   ├── workers/
│   │   ├── generation.worker.ts          ← BullMQ worker: processes generation jobs
│   │   └── worker.bootstrap.ts           ← Worker process entrypoint
│   │
│   ├── queues/
│   │   ├── generation.queue.ts           ← BullMQ queue definition + job types
│   │   └── redis.client.ts               ← Redis connection singleton
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts            ← JWT verification
│   │   ├── org.middleware.ts             ← Org membership + role enforcement
│   │   ├── plan.middleware.ts            ← Feature gating by subscription plan
│   │   └── ratelimit.middleware.ts       ← Per-user rate limiting via Redis
│   │
│   ├── lib/
│   │   ├── prisma.ts                     ← Prisma client singleton
│   │   ├── redis.ts                      ← Redis client singleton
│   │   ├── storage.ts                    ← Supabase storage client
│   │   ├── stripe.ts                     ← Stripe client singleton
│   │   ├── anthropic.ts                  ← Anthropic client singleton
│   │   └── logger.ts                     ← Structured logger (Pino)
│   │
│   └── types/
│       ├── api.types.ts                  ← Request/response types
│       ├── generation.types.ts           ← Job payload + output types
│       └── auth.types.ts                 ← Session + user context types
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
└── worker.ts                             ← Separate process: worker bootstrap
```

---

## SECTION 1 — AUTH LAYER

### Auth Strategy

Supabase Auth handles identity (JWT issuance, OAuth, email/password). Our backend trusts the Supabase JWT, extracts `user_id`, and resolves org context from our own DB. We **never trust the client for org_id or role** — these are always resolved server-side.

```typescript
// server/types/auth.types.ts

export interface SessionContext {
  userId: string;
  email: string;
  orgId: string;             // resolved from URL param or session
  role: MemberRole;          // 'owner' | 'admin' | 'editor' | 'viewer'
  planId: string;
  planFeatures: PlanFeatures;
}

export interface PlanFeatures {
  maxProjects: number | null;
  maxOutputsPm: number | null;
  hasDesignSystem: boolean;
  hasExport: boolean;
  hasApiAccess: boolean;
}
```

### tRPC Context Builder

```typescript
// server/trpc/init.ts

import { initTRPC, TRPCError } from '@trpc/server';
import { type NextRequest } from 'next/server';
import { verifyJWT } from '@/server/middleware/auth.middleware';
import { resolveOrgContext } from '@/server/middleware/org.middleware';
import { prisma } from '@/server/lib/prisma';

export const createContext = async (req: NextRequest) => {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  
  if (!token) return { session: null, prisma };
  
  const payload = await verifyJWT(token);
  if (!payload) return { session: null, prisma };

  const orgId = req.headers.get('x-org-id') ?? null;
  
  const session = orgId
    ? await resolveOrgContext(payload.sub, orgId, prisma)
    : null;

  return { session, prisma };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Requires valid session
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, session: ctx.session } });
});

// Requires editor role or above
export const editorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['owner', 'admin', 'editor'].includes(ctx.session.role)) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});

// Requires owner or admin
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['owner', 'admin'].includes(ctx.session.role)) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});
```

---

## SECTION 2 — API ROUTERS

### Projects Router

```typescript
// server/trpc/routers/projects.ts

import { z } from 'zod';
import { router, editorProcedure, protectedProcedure } from '../init';
import { ProjectService } from '@/server/services/project.service';
import { TRPCError } from '@trpc/server';

export const projectsRouter = router({

  // List all projects for current org
  list: protectedProcedure
    .input(z.object({
      status: z.enum(['draft','in_discovery','discovery_done','generating','completed','archived']).optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      return ProjectService.list({
        orgId: ctx.session.orgId,
        ...input,
      });
    }),

  // Get single project with latest output summary
  get: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const project = await ProjectService.getById(input.projectId, ctx.session.orgId);
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });
      return project;
    }),

  // Create a new project — check plan limits first
  create: editorProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      productName: z.string().max(150).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Plan gate: check project count against limit
      await PlanGuard.checkProjectLimit(ctx.session.orgId, ctx.session.planFeatures);
      return ProjectService.create({
        orgId: ctx.session.orgId,
        createdBy: ctx.session.userId,
        ...input,
      });
    }),

  // Archive / soft delete
  archive: editorProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ProjectService.archive(input.projectId, ctx.session.orgId);
    }),

  // Permanently delete (owner/admin only) — handled in adminProcedure
  delete: adminProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ProjectService.delete(input.projectId, ctx.session.orgId);
    }),
});
```

---

### Discovery Router

```typescript
// server/trpc/routers/discovery.ts

export const discoveryRouter = router({

  // Get all 52 questions (cached — questions never change at runtime)
  getQuestions: publicProcedure
    .query(async ({ ctx }) => {
      return DiscoveryService.getAllQuestions(ctx.prisma);
    }),

  // Get or create the active session for a project
  getSession: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return DiscoveryService.getOrCreateSession(
        input.projectId,
        ctx.session.userId,
        ctx.session.orgId,
        ctx.prisma,
      );
    }),

  // Save a single answer (auto-advance session progress)
  saveAnswer: editorProcedure
    .input(z.object({
      sessionId:      z.string().uuid(),
      questionId:     z.string().uuid(),
      questionNumber: z.number().min(1).max(52),
      answerText:     z.string().max(10000).optional(),
      answerValues:   z.array(z.string()).optional(),
      answerUrls:     z.array(z.object({
        url: z.string().url(),
        note: z.string().max(500).optional(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return DiscoveryService.saveAnswer({
        ...input,
        userId: ctx.session.userId,
        orgId: ctx.session.orgId,
        prisma: ctx.prisma,
      });
      // Side effect: updates session.current_question + project.discovery_progress
    }),

  // Save multiple answers at once (bulk paste / import)
  saveAnswersBulk: editorProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      answers: z.array(z.object({
        questionId:     z.string().uuid(),
        questionNumber: z.number(),
        answerText:     z.string().optional(),
        answerValues:   z.array(z.string()).optional(),
        answerUrls:     z.array(z.object({ url: z.string().url(), note: z.string().optional() })).optional(),
      })).max(52),
    }))
    .mutation(async ({ ctx, input }) => {
      return DiscoveryService.saveAnswersBulk({
        ...input,
        userId: ctx.session.userId,
        orgId: ctx.session.orgId,
        prisma: ctx.prisma,
      });
    }),

  // Get all answers for a session (to resume UI state)
  getAnswers: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return DiscoveryService.getAnswers(input.sessionId, ctx.session.orgId, ctx.prisma);
    }),

  // Mark discovery complete — triggers generation job
  completeDiscovery: editorProcedure
    .input(z.object({ sessionId: z.string().uuid(), projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Validate: all required questions answered
      const validation = await DiscoveryService.validate(input.sessionId, ctx.prisma);
      if (!validation.isComplete) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Missing required answers: questions ${validation.missing.join(', ')}`,
        });
      }
      // Complete session + update project status
      await DiscoveryService.complete(input.sessionId, input.projectId, ctx.prisma);
      // Queue generation job
      return GenerationService.enqueue({
        projectId: input.projectId,
        sessionId: input.sessionId,
        userId: ctx.session.userId,
        orgId: ctx.session.orgId,
      });
    }),
});
```

---

### Outputs Router

```typescript
// server/trpc/routers/outputs.ts

export const outputsRouter = router({

  // Get current output for a project
  getCurrent: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return OutputService.getCurrent(input.projectId, ctx.session.orgId, ctx.prisma);
    }),

  // Get output by ID (for version history)
  getById: protectedProcedure
    .input(z.object({ outputId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return OutputService.getById(input.outputId, ctx.session.orgId, ctx.prisma);
    }),

  // Poll generation status
  getStatus: protectedProcedure
    .input(z.object({ outputId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return OutputService.getStatus(input.outputId, ctx.prisma);
    }),

  // List all output versions for a project
  listVersions: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return OutputService.listVersions(input.projectId, ctx.session.orgId, ctx.prisma);
    }),

  // Regenerate output from existing answers
  regenerate: editorProcedure
    .input(z.object({ projectId: z.string().uuid(), sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await PlanGuard.checkOutputLimit(ctx.session.orgId, ctx.session.planFeatures, ctx.prisma);
      return GenerationService.enqueue({ ...input, userId: ctx.session.userId, orgId: ctx.session.orgId });
    }),

  // Export output as Markdown (plan gated)
  exportMarkdown: protectedProcedure
    .input(z.object({ outputId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.planFeatures.hasExport) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Upgrade your plan to export outputs.' });
      }
      return OutputService.exportMarkdown(input.outputId, ctx.session.orgId, ctx.prisma);
    }),
});
```

---

## SECTION 3 — SERVICES

### Discovery Service

```typescript
// server/services/discovery.service.ts

export class DiscoveryService {

  /**
   * Get all 52 questions.
   * Cached in Redis for 24h — questions are static seed data, no need to hit DB every request.
   */
  static async getAllQuestions(prisma: PrismaClient) {
    const CACHE_KEY = 'discovery:questions:all';
    const cached = await redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached);

    const questions = await prisma.discoveryQuestion.findMany({
      orderBy: { displayOrder: 'asc' },
    });

    await redis.set(CACHE_KEY, JSON.stringify(questions), 'EX', 86400); // 24h TTL
    return questions;
  }

  /**
   * Resume an active session, or create a new one if none exists.
   * Only one 'active' session is allowed per project at a time.
   */
  static async getOrCreateSession(
    projectId: string,
    userId: string,
    orgId: string,
    prisma: PrismaClient,
  ) {
    // Assert project belongs to org
    await assertProjectOwnership(projectId, orgId, prisma);

    const existing = await prisma.discoverySession.findFirst({
      where: { projectId, status: 'active' },
      orderBy: { createdAt: 'desc' },
      include: { answers: { orderBy: { questionNumber: 'asc' } } },
    });

    if (existing) return existing;

    return prisma.discoverySession.create({
      data: {
        projectId,
        startedBy: userId,
        status: 'active',
        currentSection: 1,
        currentQuestion: 1,
        questionsAnswered: 0,
      },
    });
  }

  /**
   * Upsert a single answer.
   * Updates session progress counters atomically in the same transaction.
   */
  static async saveAnswer(input: SaveAnswerInput) {
    const { sessionId, questionId, questionNumber, userId, orgId, prisma, ...answerData } = input;

    return prisma.$transaction(async (tx) => {
      // Upsert answer
      const answer = await tx.discoveryAnswer.upsert({
        where: { sessionId_questionId: { sessionId, questionId } },
        create: {
          sessionId,
          questionId,
          questionNumber,
          projectId: await getProjectIdFromSession(sessionId, tx),
          answeredBy: userId,
          ...answerData,
        },
        update: { ...answerData, updatedAt: new Date() },
      });

      // Recalculate session progress
      const count = await tx.discoveryAnswer.count({ where: { sessionId } });
      const nextQuestion = Math.min(questionNumber + 1, 52);

      await tx.discoverySession.update({
        where: { id: sessionId },
        data: {
          questionsAnswered: count,
          currentQuestion: nextQuestion,
          currentSection: Math.ceil(nextQuestion / 5), // approx section
          updatedAt: new Date(),
        },
      });

      // Update project's discovery_progress
      await tx.project.update({
        where: { id: answer.projectId },
        data: {
          discoveryProgress: count,
          lastActivityAt: new Date(),
          status: count === 52 ? 'discovery_done' : 'in_discovery',
        },
      });

      return answer;
    });
  }

  /**
   * Validate all required questions are answered before generation.
   * Returns list of missing question numbers if incomplete.
   */
  static async validate(sessionId: string, prisma: PrismaClient) {
    const [allRequired, answered] = await Promise.all([
      prisma.discoveryQuestion.findMany({
        where: { isRequired: true },
        select: { id: true, questionNumber: true },
      }),
      prisma.discoveryAnswer.findMany({
        where: { sessionId },
        select: { questionId: true },
      }),
    ]);

    const answeredIds = new Set(answered.map((a) => a.questionId));
    const missing = allRequired
      .filter((q) => !answeredIds.has(q.id))
      .map((q) => q.questionNumber);

    return { isComplete: missing.length === 0, missing };
  }
}
```

---

### Generation Service

```typescript
// server/services/generation.service.ts

import { generationQueue } from '@/server/queues/generation.queue';

export class GenerationService {

  /**
   * Create an output record and enqueue the generation job.
   * Marks previous output as 'superseded' before setting isCurrent = true on new one.
   */
  static async enqueue(input: {
    projectId: string;
    sessionId: string;
    userId: string;
    orgId: string;
  }) {
    const { projectId, sessionId, userId, orgId } = input;

    // Determine next version number
    const lastOutput = await prisma.flagshipOutput.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (lastOutput?.version ?? 0) + 1;

    // Create output record
    const output = await prisma.flagshipOutput.create({
      data: {
        projectId,
        sessionId,
        version: nextVersion,
        status: 'queued',
        isCurrent: false,        // only set to true when generation succeeds
        generatedBy: userId,
        generationModel: 'claude-sonnet-4-6',
      },
    });

    // Update project status
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'generating' },
    });

    // Enqueue BullMQ job
    await generationQueue.add(
      'generate-flagship-output',
      {
        outputId: output.id,
        projectId,
        sessionId,
        orgId,
        userId,
      },
      {
        priority: 5,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    );

    // Track usage event
    await prisma.usageEvent.create({
      data: {
        organizationId: orgId,
        userId,
        projectId,
        eventType: 'output_generated',
        quantity: 1,
        metadata: { outputId: output.id, version: nextVersion },
      },
    });

    return { outputId: output.id, version: nextVersion, status: 'queued' };
  }
}
```

---

### AI — Prompt Builder

```typescript
// server/services/ai/prompt-builder.ts

/**
 * Assembles the full generation prompt from a project's discovery answers.
 * This is the single most important function in the system.
 * Output: a rich, structured prompt that maps all 52 answers into
 * the Phase 2 flagship output format.
 */
export class PromptBuilder {

  static async build(sessionId: string, prisma: PrismaClient): Promise<string> {
    const [session, answers, questions] = await Promise.all([
      prisma.discoverySession.findUnique({
        where: { id: sessionId },
        include: { project: true },
      }),
      prisma.discoveryAnswer.findMany({
        where: { sessionId },
        orderBy: { questionNumber: 'asc' },
      }),
      prisma.discoveryQuestion.findMany({
        orderBy: { questionNumber: 'asc' },
      }),
    ]);

    // Build answer map: questionNumber → formatted answer string
    const answerMap = new Map<number, string>();
    for (const answer of answers) {
      const q = questions.find((q) => q.id === answer.questionId);
      if (!q) continue;

      let value: string;
      if (answer.answerText) {
        value = answer.answerText;
      } else if (answer.answerValues) {
        value = (answer.answerValues as string[]).join(', ');
      } else if (answer.answerUrls) {
        value = (answer.answerUrls as Array<{url: string; note?: string}>)
          .map((u) => `${u.url}${u.note ? ` (${u.note})` : ''}`)
          .join('\n');
      } else {
        value = 'Not provided';
      }
      answerMap.set(q.questionNumber, value);
    }

    return `
You are an elite SaaS website creative director and frontend architect.

Given the discovery answers below, generate a complete **Flagship Output** for this SaaS website.
Your output must be structured EXACTLY as specified. Each section must be delimited with the exact
markers shown so the output parser can extract them cleanly.

---

## DISCOVERY ANSWERS

**Product:** ${answerMap.get(1) ?? 'Unknown'}
**Category:** ${answerMap.get(2) ?? 'Unknown'}
**What it does:** ${answerMap.get(3) ?? 'Not provided'}
**Problem solved:** ${answerMap.get(4) ?? 'Not provided'}
**Pricing model:** ${answerMap.get(5) ?? 'Not provided'}
**Primary CTA:** ${answerMap.get(6) ?? 'Not provided'}
**Secondary CTA:** ${answerMap.get(7) ?? 'Not provided'}
**Dashboard/UI available:** ${answerMap.get(8) ?? 'Not provided'}
**ICP:** ${answerMap.get(9) ?? 'Not provided'}
**Traffic source:** ${answerMap.get(10) ?? 'Not provided'}
**Competitors:** ${answerMap.get(11) ?? 'Not provided'}
**Differentiation:** ${answerMap.get(12) ?? 'Not provided'}
**Value propositions:** ${answerMap.get(13) ?? 'Not provided'}
**Prospect objections:** ${answerMap.get(14) ?? 'Not provided'}
**Desired first impression:** ${answerMap.get(15) ?? 'Not provided'}
**Existing brand identity:** ${answerMap.get(16) ?? 'Not provided'}
**Aesthetic direction:** ${answerMap.get(17) ?? 'Not provided'}
**Mood words:** ${answerMap.get(18) ?? 'Not provided'}
**Must NOT feel like:** ${answerMap.get(19) ?? 'Not provided'}
**Color mode:** ${answerMap.get(20) ?? 'Not provided'}
**Typography personality:** ${answerMap.get(21) ?? 'Not provided'}
**Above-fold visual:** ${answerMap.get(22) ?? 'Not provided'}
**Information density:** ${answerMap.get(23) ?? 'Not provided'}
**Visual hierarchy priority:** ${answerMap.get(24) ?? 'Not provided'}
**Grid/layout system:** ${answerMap.get(25) ?? 'Not provided'}
**Card system:** ${answerMap.get(26) ?? 'Not provided'}
**Icon style:** ${answerMap.get(27) ?? 'Not provided'}
**Border/radius:** ${answerMap.get(28) ?? 'Not provided'}
**Homepage sections:** ${answerMap.get(29) ?? 'Not provided'}
**Storytelling pacing:** ${answerMap.get(30) ?? 'Not provided'}
**Pages needed:** ${answerMap.get(31) ?? 'Not provided'}
**Most critical non-homepage page:** ${answerMap.get(32) ?? 'Not provided'}
**Motion style:** ${answerMap.get(33) ?? 'Not provided'}
**Scroll animation:** ${answerMap.get(34) ?? 'Not provided'}
**Hover interactions:** ${answerMap.get(35) ?? 'Not provided'}
**Page load/entrance:** ${answerMap.get(36) ?? 'Not provided'}
**3D role:** ${answerMap.get(37) ?? 'Not provided'}
**3D visual language:** ${answerMap.get(38) ?? 'Not provided'}
**3D interactivity:** ${answerMap.get(39) ?? 'Not provided'}
**3D mobile handling:** ${answerMap.get(40) ?? 'Not provided'}
**Trust signals available:** ${answerMap.get(41) ?? 'Not provided'}
**Integrations:** ${answerMap.get(42) ?? 'Not provided'}
**Frontend stack preference:** ${answerMap.get(43) ?? 'Not provided'}
**Animation library:** ${answerMap.get(44) ?? 'Not provided'}
**3D library:** ${answerMap.get(45) ?? 'Not provided'}
**Performance priority:** ${answerMap.get(46) ?? 'Not provided'}
**Accessibility priority:** ${answerMap.get(47) ?? 'Not provided'}
**Expected traffic at launch:** ${answerMap.get(48) ?? 'Not provided'}
**Available assets:** ${answerMap.get(49) ?? 'Not provided'}
**Inspiration sites:** ${answerMap.get(50) ?? 'Not provided'}
**Sites to avoid looking like:** ${answerMap.get(51) ?? 'Not provided'}
**Deliverable type requested:** ${answerMap.get(52) ?? 'Full output'}

---

## REQUIRED OUTPUT FORMAT

Generate each section below. Use the exact section markers.
Do not skip any section. Do not add sections not listed.
Be specific, decisive, and premium. Never use filler language.

[SECTION:project_summary]
...
[/SECTION]

[SECTION:brand_impression_strategy]
...
[/SECTION]

[SECTION:creative_direction]
...
[/SECTION]

[SECTION:visual_hierarchy_framework]
...
[/SECTION]

[SECTION:design_system]
Include all CSS custom property definitions as a code block.
Include all color hex values, font names, and spacing values as JSON.
[/SECTION]

[SECTION:homepage_architecture]
For each section: name, purpose, key message, layout, motion, 3D behavior, CTA logic.
[/SECTION]

[SECTION:copy_direction]
Hero copy framework. Feature card formula. Social proof rules. Anti-cliché enforcement.
[/SECTION]

[SECTION:three_d_experience]
...
[/SECTION]

[SECTION:motion_system]
Include all timing tokens and easing curves as a code block.
[/SECTION]

[SECTION:ux_interaction_blueprint]
Navigation, scroll experience, conversion UX, mobile UX rules.
[/SECTION]

[SECTION:frontend_implementation]
Stack recommendation with rationale. Component architecture. Performance plan.
[/SECTION]

[SECTION:saas_enhancements]
Only enhancements genuinely relevant to this product.
[/SECTION]

[SECTION:mobile_performance]
Mobile simplification rules and Core Web Vitals protection strategy.
[/SECTION]

[SECTION:pre_build_checklist]
Full checklist: strategy, design, motion, 3D, technical.
[/SECTION]

[SECTION:final_build_prompt]
The concise, high-signal build prompt for a frontend code generator.
[/SECTION]
`;
  }
}
```

---

### AI — Output Parser

```typescript
// server/services/ai/output-parser.ts

/**
 * Parses the raw LLM output into structured section records.
 * Uses the [SECTION:...] / [/SECTION] delimiter system.
 * Also extracts design tokens from the design_system section into structured JSON.
 */

const SECTION_REGEX = /\[SECTION:(\w+)\]([\s\S]*?)\[\/SECTION\]/g;

export class OutputParser {

  static parseSections(rawOutput: string): ParsedSection[] {
    const sections: ParsedSection[] = [];
    let match: RegExpExecArray | null;
    let order = 0;

    while ((match = SECTION_REGEX.exec(rawOutput)) !== null) {
      const sectionType = match[1] as OutputSectionEnum;
      const content = match[2].trim();
      sections.push({
        sectionType,
        title: SECTION_TITLES[sectionType] ?? sectionType,
        contentMd: content,
        contentData: sectionType === 'design_system'
          ? this.extractDesignTokens(content)
          : null,
        displayOrder: order++,
      });
    }

    if (sections.length === 0) {
      throw new Error('Output parser: no sections found. Raw output may be malformed.');
    }

    return sections;
  }

  /**
   * Extract structured design tokens from the design_system section markdown.
   * Looks for CSS custom properties block and JSON blocks.
   */
  static extractDesignTokens(sectionContent: string): Record<string, unknown> {
    const tokens: Record<string, unknown> = {};

    // Extract hex colors from CSS custom properties
    const colorRegex = /--color-([\w-]+):\s*(#[0-9a-fA-F]{3,6})/g;
    let colorMatch;
    const colors: Record<string, string> = {};
    while ((colorMatch = colorRegex.exec(sectionContent)) !== null) {
      colors[colorMatch[1]] = colorMatch[2];
    }
    if (Object.keys(colors).length) tokens.colors = colors;

    // Extract font names
    const fontRegex = /--font-(display|body|mono):\s*['"]?([^;'"]+)['"]?/g;
    let fontMatch;
    const fonts: Record<string, string> = {};
    while ((fontMatch = fontRegex.exec(sectionContent)) !== null) {
      fonts[fontMatch[1]] = fontMatch[2].trim();
    }
    if (Object.keys(fonts).length) tokens.fonts = fonts;

    // Extract motion duration tokens
    const durationRegex = /--duration-([\w-]+):\s*([\d]+ms)/g;
    let durMatch;
    const durations: Record<string, string> = {};
    while ((durMatch = durationRegex.exec(sectionContent)) !== null) {
      durations[durMatch[1]] = durMatch[2];
    }
    if (Object.keys(durations).length) tokens.durations = durations;

    return tokens;
  }
}

const SECTION_TITLES: Partial<Record<string, string>> = {
  project_summary: 'Project Summary',
  brand_impression_strategy: 'Brand Impression Strategy',
  creative_direction: 'Creative Direction',
  visual_hierarchy_framework: 'Visual Hierarchy Framework',
  design_system: 'Design System',
  homepage_architecture: 'Homepage Architecture',
  copy_direction: 'Copy Direction',
  three_d_experience: '3D Experience Direction',
  motion_system: 'Motion System',
  ux_interaction_blueprint: 'UX & Interaction Blueprint',
  frontend_implementation: 'Frontend Implementation Strategy',
  saas_enhancements: 'SaaS Premium Enhancements',
  mobile_performance: 'Mobile & Performance Strategy',
  pre_build_checklist: 'Pre-Build Quality Checklist',
  final_build_prompt: 'Final Build Prompt',
};
```

---

## SECTION 4 — GENERATION WORKER

```typescript
// server/workers/generation.worker.ts

import { Worker, type Job } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { redis } from '@/server/lib/redis';
import { prisma } from '@/server/lib/prisma';
import { PromptBuilder } from '@/server/services/ai/prompt-builder';
import { OutputParser } from '@/server/services/ai/output-parser';
import { logger } from '@/server/lib/logger';

const anthropic = new Anthropic();

interface GenerationJobPayload {
  outputId: string;
  projectId: string;
  sessionId: string;
  orgId: string;
  userId: string;
}

export const generationWorker = new Worker<GenerationJobPayload>(
  'generation',
  async (job: Job<GenerationJobPayload>) => {
    const { outputId, projectId, sessionId } = job.data;
    const startTime = Date.now();

    logger.info({ outputId, projectId }, 'Generation job started');

    // 1. Mark output as generating
    await prisma.flagshipOutput.update({
      where: { id: outputId },
      data: { status: 'generating', startedAt: new Date() },
    });

    try {
      // 2. Build the generation prompt from all discovery answers
      const prompt = await PromptBuilder.build(sessionId, prisma);

      // 3. Call Claude — streaming so we can store progress in Redis
      let rawOutput = '';
      let totalTokens = 0;

      const stream = await anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        messages: [{ role: 'user', content: prompt }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          rawOutput += event.delta.text;
          // Stream progress to Redis so client can poll
          await redis.set(
            `generation:stream:${outputId}`,
            JSON.stringify({ partial: rawOutput.slice(-2000), status: 'streaming' }),
            'EX', 900, // 15 min TTL
          );
        }
        if (event.type === 'message_delta') {
          totalTokens = event.usage?.output_tokens ?? 0;
        }
      }

      // 4. Parse the raw output into structured sections
      const sections = OutputParser.parseSections(rawOutput);

      // 5. Persist everything in a single transaction
      await prisma.$transaction(async (tx) => {
        // Store all output sections
        await tx.outputSection.createMany({
          data: sections.map((s) => ({
            outputId,
            sectionType: s.sectionType,
            title: s.title,
            contentMd: s.contentMd,
            contentData: s.contentData ?? undefined,
            displayOrder: s.displayOrder,
          })),
        });

        // Extract and store design system tokens if present
        const designSection = sections.find((s) => s.sectionType === 'design_system');
        if (designSection?.contentData) {
          await tx.designSystem.create({
            data: {
              outputId,
              projectId,
              ...flattenTokensToColumns(designSection.contentData),
            },
          });
        }

        // Mark previous output as superseded
        await tx.flagshipOutput.updateMany({
          where: { projectId, isCurrent: true },
          data: { isCurrent: false, status: 'superseded' },
        });

        // Mark this output as current + done
        await tx.flagshipOutput.update({
          where: { id: outputId },
          data: {
            status: 'ready',
            isCurrent: true,
            generatedAt: new Date(),
            generationDuration: Date.now() - startTime,
            tokenCount: totalTokens,
          },
        });

        // Update project status
        await tx.project.update({
          where: { id: projectId },
          data: { status: 'completed', lastActivityAt: new Date() },
        });
      });

      // 6. Clear streaming cache
      await redis.del(`generation:stream:${outputId}`);

      logger.info({ outputId, durationMs: Date.now() - startTime }, 'Generation complete');

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ outputId, error: message }, 'Generation failed');

      await prisma.flagshipOutput.update({
        where: { id: outputId },
        data: { status: 'failed', errorMessage: message },
      });

      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'discovery_done' }, // roll back to allow retry
      });

      throw error; // re-throw so BullMQ retries
    }
  },
  {
    connection: redis,
    concurrency: 5,      // max 5 simultaneous generation jobs
    limiter: {
      max: 10,           // max 10 jobs per 30s (Claude rate limit protection)
      duration: 30000,
    },
  },
);
```

---

## SECTION 5 — QUEUE DEFINITION

```typescript
// server/queues/generation.queue.ts

import { Queue } from 'bullmq';
import { redis } from '@/server/lib/redis';

export const generationQueue = new Queue('generation', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,        // 5s → 10s → 20s
    },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
});
```

---

## SECTION 6 — WEBHOOKS

### Stripe Webhook Handler

```typescript
// app/api/webhooks/stripe/route.ts

import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/server/lib/stripe';
import { prisma } from '@/server/lib/prisma';
import { logger } from '@/server/lib/logger';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    logger.warn({ err }, 'Stripe webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        logger.debug({ type: event.type }, 'Unhandled Stripe event');
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error({ err, eventType: event.type }, 'Stripe webhook handler error');
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }
}

async function handleSubscriptionUpdate(sub: Stripe.Subscription) {
  const orgId = sub.metadata.org_id;
  if (!orgId) throw new Error(`Missing org_id metadata on subscription ${sub.id}`);

  const plan = await prisma.plan.findFirstOrThrow({
    where: { stripeProductId: sub.items.data[0].price.product as string },
  });

  await prisma.subscription.upsert({
    where: { organizationId: orgId },
    create: {
      organizationId: orgId,
      planId: plan.id,
      status: sub.status as any,
      stripeCustomerId: sub.customer as string,
      stripeSubId: sub.id,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    },
    update: {
      status: sub.status as any,
      planId: plan.id,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
    },
  });

  // Sync plan to org
  await prisma.organization.update({
    where: { id: orgId },
    data: { plan: plan.name as any },
  });
}
```

---

## SECTION 7 — MIDDLEWARE

### Rate Limiting

```typescript
// server/middleware/ratelimit.middleware.ts

import { redis } from '@/server/lib/redis';
import { TRPCError } from '@trpc/server';

/**
 * Sliding window rate limiter via Redis.
 * Different limits for different operation types.
 */

const LIMITS = {
  default:    { max: 100, windowSec: 60 },     // 100 req/min
  generation: { max: 10,  windowSec: 3600 },   // 10 generations/hour
  upload:     { max: 20,  windowSec: 60 },      // 20 uploads/min
  export:     { max: 30,  windowSec: 3600 },    // 30 exports/hour
} as const;

export async function rateLimit(
  userId: string,
  operation: keyof typeof LIMITS = 'default',
) {
  const { max, windowSec } = LIMITS[operation];
  const key = `ratelimit:${operation}:${userId}`;
  const now = Date.now();
  const windowStart = now - windowSec * 1000;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, `${now}-${Math.random()}`);
  pipeline.zcard(key);
  pipeline.expire(key, windowSec);

  const results = await pipeline.exec();
  const count = results?.[2]?.[1] as number;

  if (count > max) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Rate limit exceeded for ${operation}. Try again shortly.`,
    });
  }
}
```

### Plan Guard

```typescript
// server/middleware/plan.middleware.ts

export class PlanGuard {

  static async checkProjectLimit(
    orgId: string,
    planFeatures: PlanFeatures,
  ) {
    if (planFeatures.maxProjects === null) return; // unlimited

    const count = await prisma.project.count({
      where: { organizationId: orgId, deletedAt: null },
    });

    if (count >= planFeatures.maxProjects) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Your plan allows a maximum of ${planFeatures.maxProjects} projects. Upgrade to create more.`,
      });
    }
  }

  static async checkOutputLimit(
    orgId: string,
    planFeatures: PlanFeatures,
    prisma: PrismaClient,
  ) {
    if (planFeatures.maxOutputsPm === null) return; // unlimited

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const count = await prisma.usageEvent.count({
      where: {
        organizationId: orgId,
        eventType: 'output_generated',
        occurredAt: { gte: thisMonth },
      },
    });

    if (count >= planFeatures.maxOutputsPm) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `You've reached your monthly output limit (${planFeatures.maxOutputsPm}). Upgrade or wait until next month.`,
      });
    }
  }
}
```

---

## SECTION 8 — ASSET UPLOAD ENDPOINT

```typescript
// app/api/assets/upload/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/storage';
import { prisma } from '@/server/lib/prisma';
import { verifyJWT } from '@/server/middleware/auth.middleware';

const ALLOWED_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'application/pdf'];
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const projectId = formData.get('projectId') as string | null;
  const assetType = formData.get('assetType') as string | null;

  if (!file || !projectId || !assetType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 415 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File exceeds 50MB limit' }, { status: 413 });
  }

  // Generate non-guessable storage path
  const ext = file.name.split('.').pop();
  const storageKey = `${projectId}/${assetType}/${crypto.randomUUID()}.${ext}`;

  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await supabaseAdmin.storage
    .from(process.env.STORAGE_BUCKET_ASSETS!)
    .upload(storageKey, bytes, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: 'Upload failed', detail: uploadError.message }, { status: 500 });
  }

  const asset = await prisma.projectAsset.create({
    data: {
      projectId,
      uploadedBy: payload.sub,
      assetType: assetType as any,
      fileName: file.name,
      storageKey,
      storageBucket: process.env.STORAGE_BUCKET_ASSETS!,
      mimeType: file.type,
      fileSizeBytes: file.size,
    },
  });

  return NextResponse.json({ assetId: asset.id, storageKey });
}
```

---

## SECTION 9 — SINGLETON CLIENTS

```typescript
// server/lib/prisma.ts
import { PrismaClient } from '@prisma/client';
declare global { var __prisma: PrismaClient | undefined; }
export const prisma = global.__prisma ?? new PrismaClient({ log: ['error', 'warn'] });
if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

// server/lib/redis.ts
import { Redis } from 'ioredis';
declare global { var __redis: Redis | undefined; }
export const redis = global.__redis ?? new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
if (process.env.NODE_ENV !== 'production') global.__redis = redis;

// server/lib/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// server/lib/stripe.ts
import Stripe from 'stripe';
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-12-18.acacia' });

// server/lib/storage.ts
import { createClient } from '@supabase/supabase-js';
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-side only — never expose to client
);
```

---

## SECTION 10 — ERROR HANDLING STANDARD

All service methods use this pattern — never throw raw Prisma errors to the API layer:

```typescript
// Wrap all service calls in typed, loggable errors
export class AppError extends Error {
  constructor(
    message: string,
    public code: 'NOT_FOUND' | 'FORBIDDEN' | 'BAD_REQUEST' | 'CONFLICT' | 'INTERNAL',
    public context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// tRPC error mapper — called in the onError handler of tRPC init
export function mapToTRPCError(err: unknown): TRPCError {
  if (err instanceof AppError) {
    return new TRPCError({ code: err.code, message: err.message });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return new TRPCError({ code: 'NOT_FOUND' });
    if (err.code === 'P2002') return new TRPCError({ code: 'CONFLICT', message: 'Record already exists.' });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' });
}
```

---

## SECTION 11 — ENVIRONMENT VARIABLES

```env
# App
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db?pgbouncer=true&connection_limit=1
DATABASE_DIRECT_URL=postgresql://user:pass@host:5432/db   # for migrations (bypasses pooler)

# Auth (Supabase)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...                          # NEVER expose to client

# Storage
STORAGE_BUCKET_ASSETS=project-assets

# Redis
REDIS_URL=redis://default:password@host:6379

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Billing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Logging
LOG_LEVEL=info
```

---

## SECTION 12 — API ENDPOINT REFERENCE

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/trpc/auth.signIn` | Public | Email/password sign in |
| POST | `/api/trpc/auth.signOut` | Protected | Invalidate session |
| GET | `/api/trpc/organizations.get` | Protected | Get org details |
| POST | `/api/trpc/organizations.create` | Protected | Create new org |
| GET | `/api/trpc/projects.list` | Protected | List org projects |
| POST | `/api/trpc/projects.create` | Editor | Create project |
| GET | `/api/trpc/discovery.getQuestions` | Public | Get all 52 questions |
| GET | `/api/trpc/discovery.getSession` | Protected | Get/create active session |
| POST | `/api/trpc/discovery.saveAnswer` | Editor | Save one answer |
| POST | `/api/trpc/discovery.completeDiscovery` | Editor | Complete + queue generation |
| GET | `/api/trpc/outputs.getCurrent` | Protected | Get current output |
| GET | `/api/trpc/outputs.getStatus` | Protected | Poll generation status |
| POST | `/api/trpc/outputs.regenerate` | Editor | Queue new generation |
| POST | `/api/trpc/outputs.exportMarkdown` | Protected | Export output (plan gated) |
| POST | `/api/assets/upload` | Editor | Upload project asset |
| POST | `/api/webhooks/stripe` | Stripe sig | Handle billing events |

---

## SECTION 13 — SECURITY CHECKLIST

- [ ] All API routes require valid JWT — no unauthenticated data access
- [ ] Org isolation enforced in every service method — never trust client-supplied `orgId`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` never sent to client
- [ ] Stripe webhook signature verified before any DB write
- [ ] File uploads: MIME type validated, size capped at 50MB, storage path is UUID-based
- [ ] Rate limiting on generation, export, and upload endpoints
- [ ] Plan gates checked before every billable action
- [ ] Database statement timeout set — no runaway queries from bad prompts
- [ ] Prisma errors never surfaced raw — always mapped to typed AppError
- [ ] Worker runs as a separate process — cannot be triggered directly by HTTP

---

*This file is the single source of truth for all backend work on this project. Attach alongside `saas-flagship-database.md` when prompting for routes, services, migrations, or worker logic.*
