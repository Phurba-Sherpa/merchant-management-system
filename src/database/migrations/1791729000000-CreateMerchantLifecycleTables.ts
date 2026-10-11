import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMerchantLifecycleTables1791729000000 implements MigrationInterface {
  name = 'CreateMerchantLifecycleTables1791729000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Enums
    await queryRunner.query(
      `CREATE TYPE "public"."business_type" AS ENUM('SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'LLC', 'CORPORATION', 'NON_PROFIT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."application_status" AS ENUM('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'NEEDS_INFO', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."risk_status" AS ENUM('NOT_STARTED', 'PENDING', 'CLEAR', 'FLAGGED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."risk_review_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."risk_level" AS ENUM('LOW', 'MEDIUM', 'HIGH')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."decision_type" AS ENUM('APPROVE', 'REJECT', 'REQUEST_INFO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_actor_type" AS ENUM('USER', 'SYSTEM')`,
    );

    // 2. merchant_applications table
    await queryRunner.query(
      `CREATE TABLE "merchant_applications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "business_name" character varying(120) NOT NULL,
        "legal_business_name" character varying(200) NOT NULL,
        "business_type" "public"."business_type" NOT NULL,
        "mcc" character(4) NOT NULL,
        "website" character varying(255),
        "business_tax_id" character varying(20),
        "owner_first_name" character varying(80) NOT NULL,
        "owner_last_name" character varying(80) NOT NULL,
        "owner_email" character varying(254) NOT NULL,
        "owner_phone" character varying(20) NOT NULL,
        "owner_date_of_birth" date,
        "expected_monthly_volume" bigint NOT NULL,
        "average_ticket_size" bigint NOT NULL,
        "highest_ticket_size" bigint NOT NULL,
        "currency" character(3) NOT NULL DEFAULT 'USD',
        "status" "public"."application_status" NOT NULL DEFAULT 'DRAFT',
        "risk_status" "public"."risk_status" NOT NULL DEFAULT 'NOT_STARTED',
        "submission_count" integer NOT NULL DEFAULT 0,
        "created_by_id" uuid NOT NULL,
        "assigned_reviewer_id" uuid,
        "submitted_at" TIMESTAMP WITH TIME ZONE,
        "decided_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_merchant_applications_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_merchant_applications_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_merchant_applications_assigned_reviewer" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_merchant_applications_ticket_spread" CHECK ("highest_ticket_size" >= "average_ticket_size"),
        CONSTRAINT "CHK_merchant_applications_volume_positive" CHECK ("expected_monthly_volume" > 0),
        CONSTRAINT "CHK_merchant_applications_avg_ticket_positive" CHECK ("average_ticket_size" > 0),
        CONSTRAINT "CHK_merchant_applications_high_ticket_positive" CHECK ("highest_ticket_size" > 0),
        CONSTRAINT "CHK_merchant_applications_submission_count_nonneg" CHECK ("submission_count" >= 0)
      )`,
    );

    // Indexes for merchant_applications
    await queryRunner.query(
      `CREATE INDEX "IDX_merchant_applications_status" ON "merchant_applications" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_merchant_applications_created_by_status" ON "merchant_applications" ("created_by_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_merchant_applications_reviewer_status" ON "merchant_applications" ("assigned_reviewer_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_merchant_applications_pagination" ON "merchant_applications" ("created_at" DESC, "id" DESC)`,
    );

    // 3. risk_reviews table
    await queryRunner.query(
      `CREATE TABLE "risk_reviews" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "application_id" uuid NOT NULL,
        "submission_number" integer NOT NULL,
        "status" "public"."risk_review_status" NOT NULL DEFAULT 'PENDING',
        "risk_level" "public"."risk_level",
        "risk_score" integer,
        "flags" jsonb NOT NULL DEFAULT '[]',
        "provider_reference" character varying,
        "attempts" integer NOT NULL DEFAULT 0,
        "last_error" text,
        "enqueued_at" TIMESTAMP WITH TIME ZONE,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_risk_reviews_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_risk_reviews_application" FOREIGN KEY ("application_id") REFERENCES "merchant_applications"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_risk_reviews_app_submission" UNIQUE ("application_id", "submission_number")
      )`,
    );

    // 4. review_decisions table
    await queryRunner.query(
      `CREATE TABLE "review_decisions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "application_id" uuid NOT NULL,
        "submission_number" integer NOT NULL,
        "reviewer_id" uuid NOT NULL,
        "decision" "public"."decision_type" NOT NULL,
        "comment" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_review_decisions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_review_decisions_application" FOREIGN KEY ("application_id") REFERENCES "merchant_applications"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_review_decisions_reviewer" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_review_decisions_application_created" ON "review_decisions" ("application_id", "created_at")`,
    );

    // 5. audit_logs table
    await queryRunner.query(
      `CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "actor_type" "public"."audit_actor_type" NOT NULL,
        "actor_id" uuid,
        "actor_role" character varying,
        "action" character varying(64) NOT NULL,
        "entity_type" character varying(64) NOT NULL,
        "entity_id" uuid NOT NULL,
        "before" jsonb,
        "after" jsonb,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_audit_logs_actor" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_entity_occurred" ON "audit_logs" ("entity_type", "entity_id", "occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_actor_id" ON "audit_logs" ("actor_id")`,
    );

    // Append-only trigger for audit_logs
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION audit_logs_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;`,
    );
    await queryRunner.query(
      `CREATE TRIGGER audit_logs_no_update_delete
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS audit_logs_no_update_delete ON audit_logs`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS audit_logs_block_mutation`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "review_decisions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "risk_reviews"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "merchant_applications"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."audit_actor_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."decision_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."risk_level"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."risk_review_status"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."risk_status"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."application_status"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."business_type"`);
  }
}
