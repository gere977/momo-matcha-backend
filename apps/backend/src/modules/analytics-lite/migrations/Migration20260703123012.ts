import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260703123012 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "page_view" ("id" text not null, "path" text not null, "referrer" text null, "session_id" text null, "country" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "page_view_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_page_view_deleted_at" ON "page_view" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "page_view" cascade;`);
  }

}
