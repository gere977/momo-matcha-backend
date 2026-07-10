import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260710150000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "marketing_asset" ("id" text not null, "data" text not null, "media_type" text not null, "prompt" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "marketing_asset_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketing_asset_deleted_at" ON "marketing_asset" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "marketing_asset" cascade;`);
  }

}
