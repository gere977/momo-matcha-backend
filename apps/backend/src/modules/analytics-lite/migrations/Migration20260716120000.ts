import { Migration } from "@medusajs/framework/mikro-orm/migrations"

// Adds conversion-value and deduplication fields to the lightweight analytics
// stream. Additive/guarded because local and production share the same Neon DB.
export class Migration20260716120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'alter table if exists "page_view" add column if not exists "event_id" text null;'
    )
    this.addSql(
      'alter table if exists "page_view" add column if not exists "order_id" text null;'
    )
    this.addSql(
      'alter table if exists "page_view" add column if not exists "value" double precision null;'
    )
    this.addSql(
      'alter table if exists "page_view" add column if not exists "currency" text null;'
    )
    this.addSql(
      'create unique index if not exists "IDX_page_view_event_id" on "page_view" ("event_id") where "event_id" is not null and "deleted_at" is null;'
    )
  }

  override async down(): Promise<void> {
    this.addSql('drop index if exists "IDX_page_view_event_id";')
    this.addSql(
      'alter table if exists "page_view" drop column if exists "event_id";'
    )
    this.addSql(
      'alter table if exists "page_view" drop column if exists "order_id";'
    )
    this.addSql(
      'alter table if exists "page_view" drop column if exists "value";'
    )
    this.addSql(
      'alter table if exists "page_view" drop column if exists "currency";'
    )
  }
}
