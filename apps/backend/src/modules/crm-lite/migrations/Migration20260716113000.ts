import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260716113000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "email_preference" ("id" text not null, "email" text not null, "marketing_suppressed" boolean not null default false, "unsubscribed_at" timestamptz null, "source" text null, "reason" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "email_preference_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_email_preference_deleted_at" ON "email_preference" ("deleted_at") WHERE "deleted_at" IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_preference_email_unique" ON "email_preference" (lower("email")) WHERE "deleted_at" IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "email_preference" cascade;`)
  }
}
