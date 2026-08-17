CREATE TABLE "arrangement_corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_id" integer NOT NULL,
	"note_item_id" integer,
	"reason" text NOT NULL,
	"product_id" integer,
	"store_id" integer,
	"qty_returned" numeric,
	"qty_correct" numeric,
	"corrected_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "arrangement_note_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_id" integer NOT NULL,
	"document_item_id" integer,
	"product_id" integer NOT NULL,
	"description" text NOT NULL,
	"unit" text DEFAULT 'PCS' NOT NULL,
	"total_qty" numeric NOT NULL,
	"source_store_id" integer NOT NULL,
	"split_qty" numeric NOT NULL,
	"bring_to" integer,
	"staff_group" text NOT NULL,
	"arranged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "arrangement_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"pickup_location_id" integer,
	"delivery_method" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cashflow" (
	"id" serial PRIMARY KEY NOT NULL,
	"direction" text NOT NULL,
	"category" text NOT NULL,
	"amount" numeric NOT NULL,
	"ref_type" text,
	"ref_id" integer,
	"store_id" integer,
	"notes" text,
	"date" date NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cheques" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"supplier_id" integer,
	"payment_id" integer,
	"document_id" integer,
	"ref_type" text,
	"ref_id" integer,
	"type" text DEFAULT 'receivable' NOT NULL,
	"cheque_number" text NOT NULL,
	"bank_name" text NOT NULL,
	"amount" numeric NOT NULL,
	"cheque_date" date NOT NULL,
	"who" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"deposited_date" date,
	"cleared_date" date,
	"bounced_date" date,
	"photo_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"reason" text NOT NULL,
	"corrected_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "custom_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_key" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"category" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"type" text DEFAULT 'walk-in' NOT NULL,
	"credit_limit" numeric DEFAULT '0',
	"trn" text,
	"address" text,
	"notes" text,
	"payment_terms" text,
	"logo_url" text,
	"custom_data" jsonb DEFAULT '{}'::jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "damage_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer,
	"description" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"photos" text[] DEFAULT '{}',
	"supplier_id" integer,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_counters" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"next_number" integer NOT NULL,
	"prefix" text,
	"digits" integer DEFAULT 0,
	"separator" text DEFAULT '-',
	CONSTRAINT "document_counters_type_unique" UNIQUE("type")
);
--> statement-breakpoint
CREATE TABLE "document_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"product_id" integer,
	"sku" text,
	"description" text NOT NULL,
	"qty" numeric NOT NULL,
	"unit" text DEFAULT 'PCS' NOT NULL,
	"price" numeric NOT NULL,
	"discount_type" text DEFAULT 'QAR',
	"discount_amount" numeric DEFAULT '0',
	"amount" numeric NOT NULL,
	"location_store_id" integer
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"number" text NOT NULL,
	"date" date NOT NULL,
	"po_number" text,
	"due_date" date,
	"to_store_id" integer,
	"taken_by" text,
	"received_by" integer,
	"received_at" timestamp,
	"confirm_method" text,
	"external_receiver" text,
	"pricing_approved_by" integer,
	"customer_id" integer,
	"customer_name" text,
	"supplier_id" integer,
	"expected_date" date,
	"store_id" integer,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"transaction_mode" text DEFAULT 'real',
	"payment_type" text,
	"delivery_method" text,
	"delivery_status" text,
	"delivery_address" text,
	"expected_delivery_date" date,
	"authorized_by" integer,
	"authorized_at" timestamp,
	"driver_id" integer,
	"delivery_instructions" text,
	"map_link" text,
	"receiver_name" text,
	"receiver_phone" text,
	"warehouse_signed_by" integer,
	"warehouse_signed_at" timestamp,
	"signed_dn_url" text,
	"damage_reported" boolean DEFAULT false,
	"damage_notes" text,
	"damage_photo" text,
	"damage_reported_at" timestamp,
	"damage_resolution" text,
	"damage_resolution_notes" text,
	"damage_resolved_at" timestamp,
	"damage_resolved_by" integer,
	"footer_discount_by" integer,
	"discount_type" text DEFAULT 'QAR',
	"discount_amount" numeric DEFAULT '0',
	"subtotal" numeric DEFAULT '0' NOT NULL,
	"tax_rate" numeric DEFAULT '0',
	"tax_amount" numeric DEFAULT '0',
	"total" numeric DEFAULT '0' NOT NULL,
	"total_words" text,
	"notes" text,
	"custom_data" jsonb DEFAULT '{}'::jsonb,
	"linked_doc_id" integer,
	"original_invoice_id" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "documents_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "edit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer,
	"user_id" integer,
	"user_name" text,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"reason" text,
	"is_admin_override" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"amount" numeric NOT NULL,
	"date" date NOT NULL,
	"payment_method" text DEFAULT 'Cash' NOT NULL,
	"store_id" integer,
	"notes" text,
	"attachment_url" text,
	"is_recurring" boolean DEFAULT false,
	"frequency" text,
	"next_due_date" date,
	"deleted_at" timestamp,
	"deleted_by" integer,
	"delete_reason" text,
	"linked_issue_id" integer,
	"custom_data" jsonb DEFAULT '{}'::jsonb,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "field_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_key" text NOT NULL,
	"field_key" text NOT NULL,
	"label" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"visible_to_roles" jsonb DEFAULT '[]'::jsonb,
	"show_in_list" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"qty" numeric DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "managed_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_key" text NOT NULL,
	"value" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"document_id" integer,
	"type" text NOT NULL,
	"content" text,
	"sent_at" timestamp DEFAULT now(),
	"sent_by" integer,
	"skipped" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "module_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text DEFAULT 'Box',
	"categories" jsonb DEFAULT '[]'::jsonb,
	"roles" jsonb DEFAULT '[]'::jsonb,
	"is_custom" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "module_definitions_module_key_unique" UNIQUE("module_key")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_role" text,
	"target_user_id" integer,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"link" text,
	"entity_type" text,
	"entity_id" integer,
	"is_read" boolean DEFAULT false,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "numbering_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_type" text NOT NULL,
	"old_next" integer,
	"new_next" integer,
	"skipped" jsonb DEFAULT '[]'::jsonb,
	"reason" text,
	"user_id" integer,
	"user_name" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "owner_loans" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"amount" numeric NOT NULL,
	"source" text,
	"method" text DEFAULT 'Cash' NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer,
	"customer_id" integer,
	"amount" numeric NOT NULL,
	"method" text NOT NULL,
	"date" date NOT NULL,
	"reference" text,
	"phone" text,
	"bank_name" text,
	"account_number" text,
	"notes" text,
	"is_refund" boolean DEFAULT false,
	"recorded_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"sku" text,
	"name" text NOT NULL,
	"category" text,
	"unit" text DEFAULT 'PCS' NOT NULL,
	"sale_price" numeric DEFAULT '0',
	"wholesale_price" numeric DEFAULT '0',
	"cost_price" numeric DEFAULT '0',
	"min_stock_qty" numeric DEFAULT '0',
	"supplier_id" integer,
	"location_store_id" integer,
	"location_area" text,
	"location_rack" text,
	"location_shelf" text,
	"image_url" text,
	"custom_data" jsonb DEFAULT '{}'::jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "return_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"return_id" integer NOT NULL,
	"document_item_id" integer,
	"product_id" integer,
	"description" text NOT NULL,
	"qty" numeric NOT NULL,
	"unit" text,
	"price" numeric,
	"amount" numeric,
	"condition" text DEFAULT 'original',
	"damage_description" text
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"voucher_number" text,
	"original_invoice_id" integer,
	"original_invoice_number" text,
	"source_invoices" jsonb DEFAULT '[]'::jsonb,
	"is_manual" boolean DEFAULT false,
	"credit_note_id" integer,
	"date" date,
	"customer_id" integer,
	"customer_name" text,
	"store_id" integer,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_by" integer,
	"rejection_reason" text,
	"reason" text,
	"refund_method" text,
	"refund_amount" numeric,
	"total" numeric DEFAULT '0',
	"processed_by" integer,
	"processed_at" timestamp,
	"admin_pin" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "returns_voucher_number_unique" UNIQUE("voucher_number")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_name_en" text DEFAULT 'MAMUN M TRADING AND CONTRACTING W.L.L' NOT NULL,
	"store_name_ar" text DEFAULT 'مأمون م للتجارة والمقاولات ذ.م.م' NOT NULL,
	"address_en" text DEFAULT 'NAJMA STREET, NAJMA, DOHA, QATAR' NOT NULL,
	"address_ar" text DEFAULT 'شارع النجمة، النجمة، الدوحة، قطر' NOT NULL,
	"phone" text DEFAULT '+974 30703722' NOT NULL,
	"whatsapp" text DEFAULT '+974 30703722',
	"email" text DEFAULT 'info@mtc.com',
	"cr_number" text DEFAULT '72986/1' NOT NULL,
	"po_box" text DEFAULT '17336' NOT NULL,
	"logo_url" text,
	"tax_rate" numeric DEFAULT '0',
	"return_policy_text" text DEFAULT 'Returns accepted within 7 days with original invoice — materials must be undamaged and in original condition. Management decision is final.',
	"large_order_threshold" numeric DEFAULT '5000',
	"pdc_threshold" numeric DEFAULT '4000',
	"return_pdc_threshold" numeric DEFAULT '5000',
	"return_approval_threshold" numeric DEFAULT '1000',
	"show_po_field" boolean DEFAULT true,
	"void_window_hours" integer DEFAULT 12,
	"credit_terms" integer[] DEFAULT '{30,60,90}',
	"pdc_alert_days" integer DEFAULT 3,
	"maintenance_cheque_threshold" numeric DEFAULT '10000',
	"tier_window_months" integer DEFAULT 6,
	"tier_best_pct" numeric DEFAULT '10',
	"tier_better_pct" numeric DEFAULT '30',
	"tier_default_term_days" integer DEFAULT 30,
	"tier_bad_overdue_days" integer DEFAULT 60,
	"tier_bad_late_count" integer DEFAULT 2,
	"store_open_time" text DEFAULT '05:00',
	"store_close_time" text DEFAULT '22:00',
	"opening_cash" numeric DEFAULT '0',
	"opening_bank" numeric DEFAULT '0',
	"quiet_hours_start" text DEFAULT '21:00',
	"quiet_hours_end" text DEFAULT '08:00',
	"max_messages_per_day" integer DEFAULT 1,
	"auto_queue_messages" boolean DEFAULT true,
	"google_maps_url" text,
	"youtube" text,
	"tiktok" text,
	"instagram" text,
	"facebook" text,
	"brands" text[] DEFAULT '{"DEWALT","STANLEY","TOTAL TOOLS","MILANO","NATIONAL","BQ","BR","MÜLLER","KISTENMACHER","ORYX PAINTS","BERGER PAINTS"}'
);
--> statement-breakpoint
CREATE TABLE "staff_payroll" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric DEFAULT '0' NOT NULL,
	"date" date NOT NULL,
	"month" text NOT NULL,
	"note" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"qty_change" numeric NOT NULL,
	"type" text NOT NULL,
	"reason" text,
	"reference_id" integer,
	"user_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text,
	"address" text,
	"type" text DEFAULT 'store' NOT NULL,
	"owner_store_id" integer,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"po_number" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"store_id" integer,
	"notes" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payment_terms_days" integer DEFAULT 0,
	"receipt_date" date,
	"payment_due_date" date,
	"supplier_invoice_number" text,
	"supplier_invoice_url" text,
	"supplier_invoice_amount" numeric,
	"sent_at" timestamp DEFAULT now(),
	"received_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"po_id" integer,
	"amount" numeric NOT NULL,
	"method" text DEFAULT 'Cash' NOT NULL,
	"date" date NOT NULL,
	"reference" text,
	"supplier_invoice_number" text,
	"supplier_invoice_url" text,
	"receipt_url" text,
	"cheque_id" integer,
	"bank_name" text,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "supplier_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_id" integer,
	"supplier_id" integer,
	"store_id" integer,
	"return_type" text NOT NULL,
	"refund_mode" text DEFAULT 'credit_note' NOT NULL,
	"status" text DEFAULT 'pending_confirmation' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total" numeric DEFAULT '0',
	"refund_amount" numeric,
	"refund_received_at" timestamp,
	"refund_method" text,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"whatsapp" text,
	"phone" text,
	"email" text,
	"address" text,
	"notes" text,
	"payment_terms" text,
	"credit_days" integer DEFAULT 0,
	"payment_mode" text DEFAULT 'credit',
	"custom_data" jsonb DEFAULT '{}'::jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"assigned_to" integer NOT NULL,
	"assigned_by" integer,
	"store_id" integer,
	"due_date" date,
	"status" text DEFAULT 'open' NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'salesman' NOT NULL,
	"pin" text NOT NULL,
	"username" text,
	"password_hash" text,
	"must_change_password" boolean DEFAULT true,
	"must_change_pin" boolean DEFAULT false,
	"token_version" integer DEFAULT 0 NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"store_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"salary" numeric DEFAULT '0',
	"day_rate" numeric DEFAULT '0',
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "warehouse_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer,
	"description" text NOT NULL,
	"urgency" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"is_manager_override" boolean DEFAULT false,
	"reported_by" integer,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arrangement_corrections" ADD CONSTRAINT "arrangement_corrections_note_id_arrangement_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."arrangement_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangement_corrections" ADD CONSTRAINT "arrangement_corrections_note_item_id_arrangement_note_items_id_fk" FOREIGN KEY ("note_item_id") REFERENCES "public"."arrangement_note_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangement_corrections" ADD CONSTRAINT "arrangement_corrections_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangement_corrections" ADD CONSTRAINT "arrangement_corrections_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangement_corrections" ADD CONSTRAINT "arrangement_corrections_corrected_by_users_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangement_note_items" ADD CONSTRAINT "arrangement_note_items_note_id_arrangement_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."arrangement_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangement_note_items" ADD CONSTRAINT "arrangement_note_items_document_item_id_document_items_id_fk" FOREIGN KEY ("document_item_id") REFERENCES "public"."document_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangement_note_items" ADD CONSTRAINT "arrangement_note_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangement_note_items" ADD CONSTRAINT "arrangement_note_items_source_store_id_stores_id_fk" FOREIGN KEY ("source_store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangement_note_items" ADD CONSTRAINT "arrangement_note_items_bring_to_stores_id_fk" FOREIGN KEY ("bring_to") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangement_notes" ADD CONSTRAINT "arrangement_notes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangement_notes" ADD CONSTRAINT "arrangement_notes_pickup_location_id_stores_id_fk" FOREIGN KEY ("pickup_location_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashflow" ADD CONSTRAINT "cashflow_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashflow" ADD CONSTRAINT "cashflow_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_corrected_by_users_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_records" ADD CONSTRAINT "custom_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_claims" ADD CONSTRAINT "damage_claims_invoice_id_documents_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_claims" ADD CONSTRAINT "damage_claims_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_items" ADD CONSTRAINT "document_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_items" ADD CONSTRAINT "document_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_items" ADD CONSTRAINT "document_items_location_store_id_stores_id_fk" FOREIGN KEY ("location_store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_authorized_by_users_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_warehouse_signed_by_users_id_fk" FOREIGN KEY ("warehouse_signed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_damage_resolved_by_users_id_fk" FOREIGN KEY ("damage_resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_footer_discount_by_users_id_fk" FOREIGN KEY ("footer_discount_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_log" ADD CONSTRAINT "edit_log_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_log" ADD CONSTRAINT "edit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_linked_issue_id_warehouse_issues_id_fk" FOREIGN KEY ("linked_issue_id") REFERENCES "public"."warehouse_issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages_log" ADD CONSTRAINT "messages_log_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages_log" ADD CONSTRAINT "messages_log_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages_log" ADD CONSTRAINT "messages_log_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbering_audit" ADD CONSTRAINT "numbering_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_loans" ADD CONSTRAINT "owner_loans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_location_store_id_stores_id_fk" FOREIGN KEY ("location_store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_document_item_id_document_items_id_fk" FOREIGN KEY ("document_item_id") REFERENCES "public"."document_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_original_invoice_id_documents_id_fk" FOREIGN KEY ("original_invoice_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_credit_note_id_documents_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_payroll" ADD CONSTRAINT "staff_payroll_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_payroll" ADD CONSTRAINT "staff_payroll_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_po_id_supplier_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."supplier_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_cheque_id_cheques_id_fk" FOREIGN KEY ("cheque_id") REFERENCES "public"."cheques"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_po_id_supplier_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."supplier_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_issues" ADD CONSTRAINT "warehouse_issues_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_issues" ADD CONSTRAINT "warehouse_issues_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;