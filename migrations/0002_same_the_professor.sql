ALTER TABLE "cheques" ADD COLUMN "deposit_proof_url" text;--> statement-breakpoint
ALTER TABLE "cheques" ADD COLUMN "recovery_status" text;--> statement-breakpoint
ALTER TABLE "cheques" ADD COLUMN "recovery_notes" text;--> statement-breakpoint
ALTER TABLE "cheques" ADD COLUMN "replacement_cheque_id" integer;--> statement-breakpoint
ALTER TABLE "owner_loans" ADD COLUMN "ref_injection_id" integer;