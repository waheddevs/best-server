CREATE TYPE "GroupMembershipStatus" AS ENUM ('ACTIVE', 'PAUSED');

ALTER TABLE "group_memberships"
  ADD COLUMN "participation_status" "GroupMembershipStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX "group_memberships_group_id_participation_status_ended_at_idx"
  ON "group_memberships"("group_id", "participation_status", "ended_at");
