import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260716114000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "waitlist_signup" add column if not exists "confirmed_at" timestamptz null;`
    )
    this.addSql(
      `alter table "waitlist_signup" add column if not exists "welcome_1_sent_at" timestamptz null;`
    )
    this.addSql(
      `alter table "waitlist_signup" add column if not exists "welcome_2_sent_at" timestamptz null;`
    )
    this.addSql(
      `alter table "waitlist_signup" add column if not exists "welcome_3_sent_at" timestamptz null;`
    )
    this.addSql(
      `with ranked as (select "id", row_number() over (partition by lower("email"), coalesce("source", '') order by ("confirmed_at" is not null) desc, ("welcome_3_sent_at" is not null) desc, "created_at" asc) as rn from "waitlist_signup" where "deleted_at" is null) update "waitlist_signup" set "deleted_at" = now() where "id" in (select "id" from ranked where rn > 1);`
    )
    this.addSql(
      `create unique index if not exists "IDX_waitlist_signup_email_source_unique" on "waitlist_signup" (lower("email"), coalesce("source", '')) where "deleted_at" is null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "IDX_waitlist_signup_email_source_unique";`
    )
    this.addSql(
      `alter table "waitlist_signup" drop column if exists "welcome_1_sent_at", drop column if exists "welcome_2_sent_at", drop column if exists "welcome_3_sent_at";`
    )
    this.addSql(
      `alter table "waitlist_signup" drop column if exists "confirmed_at";`
    )
  }
}
