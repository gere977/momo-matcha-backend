import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Adds funnel-event + UTM attribution columns to page_view, and an index on
// created_at so the 30-day analytics window doesn't scan the whole table.
export class Migration20260710120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "page_view" add column if not exists "event" text not null default 'page_view';`);
    this.addSql(`alter table if exists "page_view" add column if not exists "utm_source" text null;`);
    this.addSql(`alter table if exists "page_view" add column if not exists "utm_medium" text null;`);
    this.addSql(`alter table if exists "page_view" add column if not exists "utm_campaign" text null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_page_view_created_at" ON "page_view" ("created_at");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_page_view_created_at";`);
    this.addSql(`alter table if exists "page_view" drop column if exists "event";`);
    this.addSql(`alter table if exists "page_view" drop column if exists "utm_source";`);
    this.addSql(`alter table if exists "page_view" drop column if exists "utm_medium";`);
    this.addSql(`alter table if exists "page_view" drop column if exists "utm_campaign";`);
  }

}
