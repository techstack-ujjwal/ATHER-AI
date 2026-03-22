# DATABASE ARCHITECTURE
## SaaS Flagship Website Builder — Production Schema

> Authored as: Senior Database Architect  
> Stack: PostgreSQL 16 · Prisma ORM · Redis (cache + queues) · Supabase Storage (assets)  
> Pattern: Multi-tenant SaaS, schema-per-concern, event-sourced outputs  
> Last updated: March 2026

---

## ARCHITECT'S NOTE

This platform is a **multi-phase generative SaaS tool**. A user creates a *Project*, moves through a structured *Discovery Phase* (52 questions across 11 sections), and the system produces a *Flagship Output* — a strategy document containing brand direction, design system, copy architecture, motion system, and frontend blueprint.

The database must support:
- Multi-tenancy (organizations with multiple members)
- Session-persistent discovery (users can pause and resume at any question)
- Versioned outputs (regeneration without data loss)
- Asset management (logos, screenshots, reference URLs)
- Billing-gated feature access
- Full audit trail of every generation

---

## ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────┐
│  AUTH LAYER          users · organizations · memberships        │
├─────────────────────────────────────────────────────────────────┤
│  CORE DOMAIN         projects · discovery_sessions · answers    │
├─────────────────────────────────────────────────────────────────┤
│  OUTPUT LAYER        flagship_outputs · output_sections         │
├─────────────────────────────────────────────────────────────────┤
│  DESIGN SYSTEM       design_tokens · color_palettes · typo_sys  │
├─────────────────────────────────────────────────────────────────┤
│  CONTENT LAYER       copy_direction · section_plans · comp_arch │
├─────────────────────────────────────────────────────────────────┤
│  ASSET LAYER         project_assets · reference_urls            │
├─────────────────────────────────────────────────────────────────┤
│  TRUST + PROOF       trust_signals · integrations · testimonials│
├─────────────────────────────────────────────────────────────────┤
│  COMMERCIAL          plans · subscriptions · usage_events       │
├─────────────────────────────────────────────────────────────────┤
│  SYSTEM              audit_log · generation_jobs · webhooks     │
└─────────────────────────────────────────────────────────────────┘
```

---

## NAMING CONVENTIONS

| Rule | Pattern | Example |
|------|---------|---------|
| Tables | `snake_case`, plural | `flagship_outputs` |
| Primary keys | `id UUID` everywhere | `id UUID PRIMARY KEY` |
| Foreign keys | `{singular_table}_id` | `project_id`, `user_id` |
| Timestamps | `created_at`, `updated_at` on ALL tables | — |
| Soft deletes | `deleted_at TIMESTAMPTZ NULL` | NULL = alive |
| Booleans | `is_` or `has_` prefix | `is_active`, `has_verified` |
| JSON columns | `_data` or `_config` suffix | `brand_config`, `motion_data` |
| Enums | Defined as PostgreSQL ENUM types | `project_status_enum` |
| Indexes | `idx_{table}_{column(s)}` | `idx_projects_org_id` |

---

## SECTION 1 — AUTH LAYER

### `users`

```sql
CREATE TABLE users (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  email             VARCHAR(255)  NOT NULL UNIQUE,
  email_verified_at TIMESTAMPTZ,
  full_name         VARCHAR(150),
  avatar_url        TEXT,
  password_hash     TEXT,                          -- NULL if OAuth-only
  auth_provider     VARCHAR(50)   DEFAULT 'email', -- 'email' | 'google' | 'github'
  auth_provider_id  VARCHAR(255),                  -- external provider UID
  is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_auth_provider ON users(auth_provider, auth_provider_id);
```

> **Decision:** `password_hash` is nullable because OAuth users never set one. We track `auth_provider` + `auth_provider_id` for account linking. `deleted_at` enables soft delete — we never hard-delete users for audit integrity.

---

### `organizations`

```sql
CREATE TYPE org_plan_enum AS ENUM ('free', 'starter', 'pro', 'team', 'enterprise');

CREATE TABLE organizations (
  id            UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(200)    NOT NULL,
  slug          VARCHAR(100)    NOT NULL UNIQUE,  -- used in URLs
  logo_url      TEXT,
  plan          org_plan_enum   NOT NULL DEFAULT 'free',
  plan_seats    INTEGER         NOT NULL DEFAULT 1,
  is_active     BOOLEAN         NOT NULL DEFAULT TRUE,
  created_by    UUID            NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ     NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_orgs_slug ON organizations(slug) WHERE deleted_at IS NULL;
```

---

### `organization_members`

```sql
CREATE TYPE member_role_enum AS ENUM ('owner', 'admin', 'editor', 'viewer');

CREATE TABLE organization_members (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID              NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            member_role_enum  NOT NULL DEFAULT 'editor',
  invited_by      UUID              REFERENCES users(id),
  accepted_at     TIMESTAMPTZ,                   -- NULL = pending invitation
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT now(),

  UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_members_org_id ON organization_members(organization_id);
CREATE INDEX idx_org_members_user_id ON organization_members(user_id);
```

> **Decision:** `accepted_at` being NULL = pending invite. No separate `invitations` table needed — we check this column to determine invite state. Owner is always set during org creation and cannot be demoted without transfer.

---

## SECTION 2 — CORE DOMAIN

### `projects`

The central entity. Every user interaction orbits a project.

```sql
CREATE TYPE project_status_enum AS ENUM (
  'draft',            -- created, discovery not started
  'in_discovery',     -- actively answering questions
  'discovery_done',   -- all 52 questions answered
  'generating',       -- output being generated (async job running)
  'completed',        -- flagship output ready
  'archived'
);

CREATE TYPE saas_category_enum AS ENUM (
  'developer_tools', 'ai_automation', 'crm_sales', 'project_management',
  'analytics_bi', 'hr_people', 'finance_fintech', 'marketing_growth',
  'security_compliance', 'design_creative', 'healthcare', 'legal_tech',
  'education_lms', 'ecommerce', 'communication', 'data_pipeline',
  'vertical_saas', 'other'
);

CREATE TABLE projects (
  id                  UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID                  NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by          UUID                  NOT NULL REFERENCES users(id),
  name                VARCHAR(255)          NOT NULL,             -- e.g. "Fora - Support Routing"
  product_name        VARCHAR(150),
  product_tagline     TEXT,                                       -- Q1 answer summary
  saas_category       saas_category_enum,
  status              project_status_enum   NOT NULL DEFAULT 'draft',
  discovery_progress  INTEGER               NOT NULL DEFAULT 0,   -- 0–52, questions answered
  primary_cta_action  VARCHAR(100),                               -- Q6: 'trial' | 'demo' | 'waitlist' etc.
  pricing_model       VARCHAR(50),                                -- Q5 answer
  is_pinned           BOOLEAN               NOT NULL DEFAULT FALSE,
  last_activity_at    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ           NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ           NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_projects_org_id ON projects(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE INDEX idx_projects_status ON projects(status);
```

---

### `discovery_sessions`

Tracks each attempt to complete the discovery phase. A project can have multiple sessions (user paused, resumed, restarted with a different direction).

```sql
CREATE TYPE session_status_enum AS ENUM ('active', 'paused', 'completed', 'abandoned');

CREATE TABLE discovery_sessions (
  id                  UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID                  NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  started_by          UUID                  NOT NULL REFERENCES users(id),
  status              session_status_enum   NOT NULL DEFAULT 'active',
  current_section     INTEGER               NOT NULL DEFAULT 1,   -- 1–11 (the 11 sections)
  current_question    INTEGER               NOT NULL DEFAULT 1,   -- 1–52
  questions_answered  INTEGER               NOT NULL DEFAULT 0,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ           NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ           NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_project_id ON discovery_sessions(project_id);
```

> **Decision:** Multiple sessions per project allows "start fresh" UX without nuking prior answer history. The app always loads the latest `active` or `completed` session for a project.

---

### `discovery_questions`

The question bank — all 52 questions from the prompt, structured and seeded once.

```sql
CREATE TYPE question_type_enum AS ENUM (
  'text',             -- free text (Q1, Q3, Q4)
  'single_select',    -- one option from a list (Q2, Q5, Q17)
  'multi_select',     -- multiple options (Q29, Q35, Q41, Q42, Q49)
  'rank',             -- drag-to-rank (Q24)
  'url_list',         -- list of URLs (Q50, Q51)
  'checklist'         -- checkboxes (Q31, Q41)
);

CREATE TABLE discovery_questions (
  id              UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  question_number INTEGER               NOT NULL UNIQUE,  -- 1–52
  section_number  INTEGER               NOT NULL,         -- 1–11
  section_name    VARCHAR(100)          NOT NULL,
  question_key    VARCHAR(100)          NOT NULL UNIQUE,  -- machine-readable key e.g. 'saas_category'
  question_text   TEXT                  NOT NULL,
  helper_text     TEXT,
  question_type   question_type_enum    NOT NULL,
  options         JSONB,                                  -- array of {value, label, description?}
  is_required     BOOLEAN               NOT NULL DEFAULT TRUE,
  display_order   INTEGER               NOT NULL,
  created_at      TIMESTAMPTZ           NOT NULL DEFAULT now()
);

-- Seed example (Q2):
-- INSERT INTO discovery_questions VALUES (
--   gen_random_uuid(), 2, 1, 'SaaS Product Core', 'saas_category',
--   'What category of SaaS is this?', 'Choose the closest or describe your own.',
--   'single_select',
--   '["developer_tools","ai_automation","crm_sales",...]'::jsonb,
--   true, 2, now()
-- );
```

---

### `discovery_answers`

One row per question per session. This is the core answer store.

```sql
CREATE TABLE discovery_answers (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID          NOT NULL REFERENCES discovery_sessions(id) ON DELETE CASCADE,
  project_id      UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  question_id     UUID          NOT NULL REFERENCES discovery_questions(id),
  question_number INTEGER       NOT NULL,   -- denormalized for fast lookup without join
  answer_text     TEXT,                     -- for 'text' type
  answer_values   JSONB,                    -- for select/multi/rank/checklist: string[]
  answer_urls     JSONB,                    -- for 'url_list': [{url, note}]
  answered_by     UUID          NOT NULL REFERENCES users(id),
  answered_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  UNIQUE(session_id, question_id)           -- one answer per question per session
);

CREATE INDEX idx_answers_session_id ON discovery_answers(session_id);
CREATE INDEX idx_answers_project_id ON discovery_answers(project_id);
CREATE INDEX idx_answers_question_number ON discovery_answers(question_number);
```

> **Decision:** Three separate answer columns (`answer_text`, `answer_values`, `answer_urls`) instead of a single JSONB blob. This makes querying, validating, and aggregating answers per question type clean and type-safe — no "parse a blob and guess the shape" logic in application code.

---

## SECTION 3 — OUTPUT LAYER

### `flagship_outputs`

The final generated deliverable. Every generation creates a new version — old versions are preserved.

```sql
CREATE TYPE output_status_enum AS ENUM ('queued', 'generating', 'ready', 'failed', 'superseded');

CREATE TABLE flagship_outputs (
  id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID                NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id          UUID                NOT NULL REFERENCES discovery_sessions(id),
  version             INTEGER             NOT NULL DEFAULT 1,   -- auto-incremented per project
  status              output_status_enum  NOT NULL DEFAULT 'queued',
  generation_model    VARCHAR(100),                            -- e.g. 'claude-sonnet-4-6'
  generation_duration INTEGER,                                 -- ms
  token_count         INTEGER,                                 -- total tokens used
  error_message       TEXT,                                    -- if status = 'failed'
  is_current          BOOLEAN             NOT NULL DEFAULT FALSE,  -- only one TRUE per project
  generated_by        UUID                REFERENCES users(id),
  generated_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ         NOT NULL DEFAULT now()
);

CREATE INDEX idx_outputs_project_id ON flagship_outputs(project_id);
CREATE UNIQUE INDEX idx_outputs_current ON flagship_outputs(project_id) WHERE is_current = TRUE;
-- ^ enforces only one current output per project at the database level
```

---

### `output_sections`

Each output is broken into structured sections matching the Phase 2 output format.

```sql
CREATE TYPE output_section_enum AS ENUM (
  'project_summary',
  'brand_impression_strategy',
  'creative_direction',
  'visual_hierarchy_framework',
  'design_system',
  'homepage_architecture',
  'copy_direction',
  'three_d_experience',
  'motion_system',
  'ux_interaction_blueprint',
  'frontend_implementation',
  'saas_enhancements',
  'mobile_performance',
  'pre_build_checklist',
  'final_build_prompt'
);

CREATE TABLE output_sections (
  id              UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  output_id       UUID                    NOT NULL REFERENCES flagship_outputs(id) ON DELETE CASCADE,
  section_type    output_section_enum     NOT NULL,
  title           VARCHAR(200)            NOT NULL,
  content_md      TEXT                    NOT NULL,   -- full markdown content of the section
  content_data    JSONB,                              -- structured data version (e.g., color tokens as JSON)
  display_order   INTEGER                 NOT NULL,
  created_at      TIMESTAMPTZ             NOT NULL DEFAULT now()
);

CREATE INDEX idx_output_sections_output_id ON output_sections(output_id);
```

---

### `design_systems`

The generated design system extracted into queryable structure — so the app can render live token previews.

```sql
CREATE TABLE design_systems (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  output_id           UUID          NOT NULL UNIQUE REFERENCES flagship_outputs(id) ON DELETE CASCADE,
  project_id          UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Color Tokens
  color_brand_primary     VARCHAR(7),   -- hex
  color_brand_secondary   VARCHAR(7),
  color_accent            VARCHAR(7),
  color_bg_base           VARCHAR(7),
  color_bg_surface        VARCHAR(7),
  color_bg_elevated       VARCHAR(7),
  color_text_primary      VARCHAR(7),
  color_text_secondary    VARCHAR(7),
  color_text_muted        VARCHAR(7),
  color_border            VARCHAR(7),
  color_border_subtle     VARCHAR(7),

  -- Extended palette (semantic, status, etc.)
  extended_colors         JSONB,        -- {name: hex, ...}

  -- Typography
  font_display            VARCHAR(100), -- e.g. 'Geist'
  font_body               VARCHAR(100), -- e.g. 'DM Sans'
  font_mono               VARCHAR(100), -- e.g. 'JetBrains Mono'
  type_scale              JSONB,        -- {xs: '0.75rem', sm: '0.875rem', ...}

  -- System choices
  aesthetic_preset        VARCHAR(10),  -- 'A' through 'J' or 'custom'
  mood_words              JSONB,        -- string[]
  border_radius_system    JSONB,        -- {sm: '4px', md: '8px', ...}
  spacing_scale           JSONB,        -- {1: '4px', 2: '8px', ...}
  shadow_system           JSONB,        -- {sm: ..., md: ..., glow: ...}

  -- Motion tokens
  duration_tokens         JSONB,        -- {fast: '150ms', ...}
  easing_tokens           JSONB,        -- {ease_out: 'cubic-bezier(...)', ...}

  created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);
```

---

### `homepage_sections`

Structured breakdown of which sections are in the generated homepage and their individual specs.

```sql
CREATE TYPE homepage_section_enum AS ENUM (
  'hero', 'trust_bar', 'product_preview', 'core_value_prop',
  'feature_breakdown', 'how_it_works', 'use_cases', 'integrations',
  'testimonials', 'metrics_roi', 'pricing', 'faq', 'final_cta', 'footer'
);

CREATE TABLE homepage_sections (
  id                  UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  output_id           UUID                    NOT NULL REFERENCES flagship_outputs(id) ON DELETE CASCADE,
  section_type        homepage_section_enum   NOT NULL,
  display_order       INTEGER                 NOT NULL,
  is_included         BOOLEAN                 NOT NULL DEFAULT TRUE,
  purpose             TEXT,
  key_message         TEXT,
  layout_direction    TEXT,
  motion_behavior     TEXT,
  three_d_behavior    TEXT,
  cta_logic           TEXT,
  trust_contribution  TEXT,
  content_requirements JSONB,                -- structured checklist for each section
  created_at          TIMESTAMPTZ            NOT NULL DEFAULT now()
);

CREATE INDEX idx_homepage_sections_output_id ON homepage_sections(output_id);
```

---

### `site_pages`

Beyond the homepage — all additional pages the output recommends.

```sql
CREATE TYPE page_type_enum AS ENUM (
  'features', 'pricing', 'about', 'blog', 'docs', 'changelog',
  'integrations', 'case_studies', 'security', 'careers', 'contact',
  'partners', 'privacy', 'terms'
);

CREATE TABLE site_pages (
  id                  UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  output_id           UUID              NOT NULL REFERENCES flagship_outputs(id) ON DELETE CASCADE,
  page_type           page_type_enum    NOT NULL,
  is_recommended      BOOLEAN           NOT NULL DEFAULT TRUE,
  is_conversion_critical BOOLEAN        NOT NULL DEFAULT FALSE,  -- Q32: secondary priority
  priority_rank       INTEGER,
  notes               TEXT,
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT now()
);
```

---

## SECTION 4 — ASSET LAYER

### `project_assets`

Logos, screenshots, demo videos — everything a user uploads during discovery (Q49).

```sql
CREATE TYPE asset_type_enum AS ENUM (
  'logo', 'brand_guide', 'screenshot_desktop', 'screenshot_mobile',
  'demo_video', 'testimonial_video', 'customer_logo', 'team_photo',
  'press_badge', 'award_badge', 'other'
);

CREATE TABLE project_assets (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID              NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by     UUID              NOT NULL REFERENCES users(id),
  asset_type      asset_type_enum   NOT NULL,
  file_name       VARCHAR(255)      NOT NULL,
  storage_key     TEXT              NOT NULL UNIQUE,   -- Supabase Storage / S3 object key
  storage_bucket  VARCHAR(100)      NOT NULL,
  mime_type       VARCHAR(100),
  file_size_bytes INTEGER,
  width_px        INTEGER,
  height_px       INTEGER,
  duration_sec    NUMERIC(8,2),                        -- for videos
  alt_text        TEXT,
  is_primary      BOOLEAN           NOT NULL DEFAULT FALSE,  -- primary logo, hero screenshot, etc.
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_assets_project_id ON project_assets(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_type ON project_assets(asset_type);
```

---

### `reference_urls`

Inspiration sites (Q50), sites to avoid (Q51), competitor URLs (Q11).

```sql
CREATE TYPE reference_url_type_enum AS ENUM ('inspiration', 'avoid', 'competitor', 'other');

CREATE TABLE reference_urls (
  id              UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID                      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url             TEXT                      NOT NULL,
  label           VARCHAR(200),             -- e.g. "Linear — love the motion system"
  ref_type        reference_url_type_enum   NOT NULL,
  specific_notes  TEXT,                     -- what specifically to reference/avoid
  added_by        UUID                      NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ               NOT NULL DEFAULT now()
);

CREATE INDEX idx_ref_urls_project_id ON reference_urls(project_id);
```

---

## SECTION 5 — TRUST + PROOF LAYER

### `trust_signals`

From Q41 — SOC2, GDPR, uptime stats, user counts, etc.

```sql
CREATE TYPE trust_signal_enum AS ENUM (
  'soc2_type2', 'gdpr', 'hipaa', 'iso_27001', 'sso_saml',
  'enterprise_sla', 'named_customers', 'g2_rating', 'capterra_rating',
  'producthunt_badge', 'press_mention', 'investor_backing',
  'user_count', 'company_count', 'uptime_stat', 'revenue_milestone',
  'founded_year', 'team_size'
);

CREATE TABLE trust_signals (
  id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID                NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  signal_type     trust_signal_enum   NOT NULL,
  is_available    BOOLEAN             NOT NULL DEFAULT FALSE,
  display_value   VARCHAR(200),       -- e.g. "99.99%", "10,000+ teams", "Series A"
  source_url      TEXT,
  asset_id        UUID                REFERENCES project_assets(id),
  created_at      TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ         NOT NULL DEFAULT now()
);

CREATE INDEX idx_trust_signals_project_id ON trust_signals(project_id);
```

---

### `integrations`

From Q42 — product integrations to display in the ecosystem showcase.

```sql
CREATE TABLE integrations (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            VARCHAR(100)  NOT NULL,
  category        VARCHAR(100),
  logo_url        TEXT,
  website_url     TEXT,
  display_order   INTEGER       NOT NULL DEFAULT 0,
  is_featured     BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_integrations_project_id ON integrations(project_id);
```

---

### `testimonials`

From Q29 (social proof sections) — structured testimonial data for output rendering.

```sql
CREATE TABLE testimonials (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  quote           TEXT          NOT NULL,
  author_name     VARCHAR(150)  NOT NULL,
  author_title    VARCHAR(150),
  author_company  VARCHAR(150),
  author_avatar   TEXT,
  company_logo    TEXT,
  is_video        BOOLEAN       NOT NULL DEFAULT FALSE,
  video_url       TEXT,
  rating          SMALLINT      CHECK (rating BETWEEN 1 AND 5),
  outcome_metric  VARCHAR(200), -- e.g. "43% reduction in ticket resolution time"
  display_order   INTEGER       NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_testimonials_project_id ON testimonials(project_id);
```

---

## SECTION 6 — COMMERCIAL LAYER

### `plans`

```sql
CREATE TABLE plans (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(100)  NOT NULL UNIQUE,    -- 'free', 'starter', 'pro', 'team', 'enterprise'
  display_name        VARCHAR(100)  NOT NULL,
  price_monthly_usd   NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_annual_usd    NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_projects        INTEGER,                          -- NULL = unlimited
  max_seats           INTEGER,
  max_outputs_pm      INTEGER,                          -- outputs per month
  has_design_system   BOOLEAN       NOT NULL DEFAULT FALSE,
  has_export          BOOLEAN       NOT NULL DEFAULT FALSE,
  has_api_access      BOOLEAN       NOT NULL DEFAULT FALSE,
  has_white_label     BOOLEAN       NOT NULL DEFAULT FALSE,
  stripe_price_id_monthly TEXT,
  stripe_price_id_annual  TEXT,
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);
```

---

### `subscriptions`

```sql
CREATE TYPE sub_status_enum AS ENUM (
  'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'
);

CREATE TABLE subscriptions (
  id                    UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID              NOT NULL UNIQUE REFERENCES organizations(id),
  plan_id               UUID              NOT NULL REFERENCES plans(id),
  status                sub_status_enum   NOT NULL DEFAULT 'trialing',
  is_annual             BOOLEAN           NOT NULL DEFAULT FALSE,
  trial_ends_at         TIMESTAMPTZ,
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  canceled_at           TIMESTAMPTZ,
  stripe_customer_id    VARCHAR(255)      UNIQUE,
  stripe_sub_id         VARCHAR(255)      UNIQUE,
  created_at            TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_org_id ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_stripe_sub ON subscriptions(stripe_sub_id);
```

---

### `usage_events`

Metered usage tracking — outputs generated, exports, API calls.

```sql
CREATE TYPE usage_event_enum AS ENUM (
  'output_generated', 'output_exported_pdf', 'output_exported_md',
  'design_system_exported', 'api_call', 'seat_added'
);

CREATE TABLE usage_events (
  id                UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID                NOT NULL REFERENCES organizations(id),
  user_id           UUID                REFERENCES users(id),
  project_id        UUID                REFERENCES projects(id),
  event_type        usage_event_enum    NOT NULL,
  quantity          INTEGER             NOT NULL DEFAULT 1,
  metadata          JSONB,
  occurred_at       TIMESTAMPTZ         NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_events_org_id ON usage_events(organization_id);
CREATE INDEX idx_usage_events_occurred_at ON usage_events(occurred_at);
```

---

## SECTION 7 — SYSTEM LAYER

### `generation_jobs`

Async queue table for output generation (consumed by a worker, e.g., pg-boss or BullMQ).

```sql
CREATE TYPE job_status_enum AS ENUM ('pending', 'running', 'done', 'failed', 'retrying');

CREATE TABLE generation_jobs (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  output_id       UUID              NOT NULL REFERENCES flagship_outputs(id),
  project_id      UUID              NOT NULL REFERENCES projects(id),
  status          job_status_enum   NOT NULL DEFAULT 'pending',
  priority        INTEGER           NOT NULL DEFAULT 5,       -- 1 = highest
  attempts        INTEGER           NOT NULL DEFAULT 0,
  max_attempts    INTEGER           NOT NULL DEFAULT 3,
  error_log       TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  scheduled_for   TIMESTAMPTZ       NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE INDEX idx_gen_jobs_status ON generation_jobs(status, scheduled_for)
  WHERE status IN ('pending', 'retrying');
```

---

### `audit_log`

Immutable event log. Insert-only — never update or delete rows.

```sql
CREATE TABLE audit_log (
  id              BIGSERIAL     PRIMARY KEY,               -- bigserial: high volume, sequential
  organization_id UUID          REFERENCES organizations(id),
  user_id         UUID          REFERENCES users(id),
  project_id      UUID          REFERENCES projects(id),
  action          VARCHAR(100)  NOT NULL,                  -- e.g. 'project.created', 'output.generated'
  entity_type     VARCHAR(100),                            -- e.g. 'project', 'output'
  entity_id       UUID,
  old_data        JSONB,
  new_data        JSONB,
  ip_address      INET,
  user_agent      TEXT,
  occurred_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_org_id ON audit_log(organization_id, occurred_at DESC);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id, occurred_at DESC);
CREATE INDEX idx_audit_log_project_id ON audit_log(project_id);
```

> **Decision:** `BIGSERIAL` not UUID here — audit logs are sequential by nature, and we want cheap ORDER BY without sorting UUIDs. This table is insert-only by policy. No soft deletes.

---

## SECTION 8 — PRISMA SCHEMA

```prisma
// schema.prisma — abridged core models

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                String    @id @default(uuid())
  email             String    @unique
  emailVerifiedAt   DateTime?
  fullName          String?
  avatarUrl         String?
  passwordHash      String?
  authProvider      String    @default("email")
  authProviderId    String?
  isActive          Boolean   @default(true)
  lastLoginAt       DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?

  memberships       OrganizationMember[]
  projects          Project[]            @relation("ProjectCreator")
  discoveryAnswers  DiscoveryAnswer[]
  createdOrgs       Organization[]       @relation("OrgCreator")
}

model Organization {
  id          String    @id @default(uuid())
  name        String
  slug        String    @unique
  logoUrl     String?
  plan        String    @default("free")
  planSeats   Int       @default(1)
  isActive    Boolean   @default(true)
  createdBy   String
  creator     User      @relation("OrgCreator", fields: [createdBy], references: [id])
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  members       OrganizationMember[]
  projects      Project[]
  subscription  Subscription?
  usageEvents   UsageEvent[]
}

model Project {
  id                  String    @id @default(uuid())
  organizationId      String
  organization        Organization @relation(fields: [organizationId], references: [id])
  createdBy           String
  creator             User      @relation("ProjectCreator", fields: [createdBy], references: [id])
  name                String
  productName         String?
  productTagline      String?
  saasCategory        String?
  status              String    @default("draft")
  discoveryProgress   Int       @default(0)
  primaryCtaAction    String?
  pricingModel        String?
  isPinned            Boolean   @default(false)
  lastActivityAt      DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  deletedAt           DateTime?

  discoverySessions   DiscoverySession[]
  flagshipOutputs     FlagshipOutput[]
  assets              ProjectAsset[]
  referenceUrls       ReferenceUrl[]
  trustSignals        TrustSignal[]
  integrations        Integration[]
  testimonials        Testimonial[]
}

model DiscoverySession {
  id                String    @id @default(uuid())
  projectId         String
  project           Project   @relation(fields: [projectId], references: [id])
  startedBy         String
  status            String    @default("active")
  currentSection    Int       @default(1)
  currentQuestion   Int       @default(1)
  questionsAnswered Int       @default(0)
  completedAt       DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  answers           DiscoveryAnswer[]
  flagshipOutputs   FlagshipOutput[]
}

model DiscoveryAnswer {
  id              String    @id @default(uuid())
  sessionId       String
  session         DiscoverySession @relation(fields: [sessionId], references: [id])
  projectId       String
  questionId      String
  question        DiscoveryQuestion @relation(fields: [questionId], references: [id])
  questionNumber  Int
  answerText      String?
  answerValues    Json?
  answerUrls      Json?
  answeredBy      String
  user            User      @relation(fields: [answeredBy], references: [id])
  answeredAt      DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([sessionId, questionId])
}

model FlagshipOutput {
  id                  String    @id @default(uuid())
  projectId           String
  project             Project   @relation(fields: [projectId], references: [id])
  sessionId           String
  session             DiscoverySession @relation(fields: [sessionId], references: [id])
  version             Int       @default(1)
  status              String    @default("queued")
  generationModel     String?
  generationDuration  Int?
  tokenCount          Int?
  errorMessage        String?
  isCurrent           Boolean   @default(false)
  generatedBy         String?
  generatedAt         DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  sections            OutputSection[]
  designSystem        DesignSystem?
  homepageSections    HomepageSection[]
  sitePages           SitePage[]
  generationJob       GenerationJob?
}
```

---

## SECTION 9 — PERFORMANCE & INDEXING STRATEGY

```sql
-- ─── COVERING INDEXES (avoid heap fetches for hot query paths) ───

-- Dashboard: list all projects for an org with status + progress
CREATE INDEX idx_projects_dashboard ON projects(organization_id, status, discovery_progress)
  INCLUDE (name, product_name, last_activity_at)
  WHERE deleted_at IS NULL;

-- Discovery resume: find active session for a project
CREATE INDEX idx_sessions_active ON discovery_sessions(project_id, status)
  WHERE status = 'active';

-- Answer lookup: resume from last answered question
CREATE INDEX idx_answers_resume ON discovery_answers(session_id, question_number DESC);

-- Output history: latest output per project
CREATE INDEX idx_outputs_version ON flagship_outputs(project_id, version DESC);

-- Job queue: worker polling query
CREATE INDEX idx_jobs_queue ON generation_jobs(priority, scheduled_for)
  WHERE status IN ('pending', 'retrying');

-- Billing: org subscription lookup by Stripe ID
CREATE INDEX idx_stripe_sub ON subscriptions(stripe_sub_id)
  WHERE stripe_sub_id IS NOT NULL;
```

---

## SECTION 10 — ROW-LEVEL SECURITY (Supabase / PostgREST)

```sql
-- Enable RLS on all core tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE flagship_outputs ENABLE ROW LEVEL SECURITY;

-- Users can only see projects belonging to their organization(s)
CREATE POLICY "org_members_see_projects"
  ON projects FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- Editors and above can create/update projects
CREATE POLICY "editors_can_write_projects"
  ON projects FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin', 'editor')
        AND accepted_at IS NOT NULL
    )
  );

-- Viewers can see outputs but not generate
CREATE POLICY "members_see_outputs"
  ON flagship_outputs FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid() AND om.accepted_at IS NOT NULL
    )
  );
```

---

## SECTION 11 — MIGRATIONS STRATEGY

```
migrations/
  001_auth_layer.sql                 -- users, organizations, members
  002_core_domain.sql                -- projects, sessions, questions
  003_discovery_answers.sql          -- answers table + indexes
  004_output_layer.sql               -- outputs, sections, design systems
  005_homepage_and_pages.sql         -- homepage sections, site pages
  006_asset_layer.sql                -- assets, reference urls
  007_trust_and_proof.sql            -- trust signals, integrations, testimonials
  008_commercial_layer.sql           -- plans, subscriptions, usage events
  009_system_layer.sql               -- generation jobs, audit log
  010_rls_policies.sql               -- all RLS policies
  011_seed_questions.sql             -- seed all 52 discovery questions
```

Rules:
- Never edit a committed migration — always create a new one.
- Each migration is wrapped in a transaction block.
- `011_seed_questions.sql` is idempotent — uses `INSERT ... ON CONFLICT DO NOTHING`.

---

## SECTION 12 — ENVIRONMENT VARIABLES

```env
# Database
DATABASE_URL=postgresql://user:password@db.supabase.co:5432/postgres
DATABASE_DIRECT_URL=postgresql://user:password@db.supabase.co:5432/postgres
DATABASE_POOL_MAX=10
DATABASE_POOL_MIN=2
DATABASE_STATEMENT_TIMEOUT=30000    # 30s hard limit per query

# Supabase Storage
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...       # server-side only, never expose to client
STORAGE_BUCKET_ASSETS=project-assets

# Billing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Redis (job queue + cache)
REDIS_URL=redis://...
```

---

## SECURITY CHECKLIST

- [ ] RLS enabled on all user-data tables
- [ ] Service role key never exposed client-side
- [ ] `password_hash` never included in any SELECT *
- [ ] Asset `storage_key` values are non-guessable (UUID-based paths)
- [ ] `audit_log` table is INSERT-only — no UPDATE/DELETE grants
- [ ] Stripe webhook signature verified before any DB write
- [ ] `DATABASE_STATEMENT_TIMEOUT` set — no runaway queries
- [ ] Connection pooling via PgBouncer or Supabase connection pooler
- [ ] Automated backups enabled with daily snapshot + point-in-time recovery
- [ ] Sensitive JSONB columns (brand configs, answers) excluded from logs

---

*This schema is the single source of truth for all database work on this project. Attach to any AI coding prompt before asking for queries, migrations, API routes, or data access logic.*
