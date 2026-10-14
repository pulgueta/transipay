ALTER TABLE "auth"."session" DROP CONSTRAINT "session_impersonated_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_impersonated_by_user_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;