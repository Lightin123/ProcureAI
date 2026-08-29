-- Milestone 7 — Vendor shortlisting and engagement.
--
-- Milestone 6 left a deliberate seam (D69): `work_package_shortlist`, a set of
-- suppliers an official marked against a confirmed work package, with the rank
-- and score read server-side from the stored run. This migration builds the
-- engagement step on top of that seam and nothing else:
--
--   confirmed work package
--     -> ranked, eligible suppliers        (migration 006)
--     -> shortlist                         (migration 006)
--     -> invitation                        (here)
--     -> vendor notification               (reuses `vendor_notifications`)
--     -> vendor accepts or declines        (here)
--
-- Two decisions worth stating, because both were the alternative to adding a
-- table:
--
--  1. Shortlist and invitation actions are audited in `work_package_history`,
--     the table every other work-package decision is already recorded in, by
--     extending its action enum. A parallel `work_package_shortlist_history`
--     would have split the audit trail of one work package across two tables
--     and forced every future reader to union them (D73).
--
--  2. The vendor is notified through `vendor_notifications`, which already
--     carries registration, verification and document-review events and
--     already has a link path, a read state and vendor ownership. Nothing
--     about an invitation needs a second notification system (D74).
--
-- Every statement is safe to run repeatedly.

-- ---------------------------------------------------------------------------
-- Audit vocabulary.
-- ---------------------------------------------------------------------------
--
-- ADD VALUE runs inside the migration runner's transaction, which PostgreSQL
-- permits so long as the new label is not itself used before the transaction
-- commits. This migration only declares the labels; the API writes them.

ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'SHORTLISTED';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'SHORTLIST_REMOVED';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'INVITED';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'INVITATION_WITHDRAWN';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'INVITATION_ACCEPTED';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'INVITATION_DECLINED';

-- ---------------------------------------------------------------------------
-- Invitation lifecycle.
-- ---------------------------------------------------------------------------
--
-- An enum rather than free text, because this is a fixed state machine the
-- database should enforce — the same reasoning applied to the vendor profile
-- and verification states in migration 005 (D56).
--
--   INVITED ──> ACCEPTED
--         ├──> DECLINED
--         └──> WITHDRAWN   (the issuing department cancels)
--
-- There is no EXPIRED. Expiry would have to be written by something, and the
-- only thing that could write it is a background job, which this system does
-- not have (D30). A passed deadline is derived from `response_deadline` when
-- the invitation is read, which is the same fact without the machinery.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_package_invitation_status') THEN
    CREATE TYPE work_package_invitation_status AS ENUM (
      'INVITED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS work_package_invitations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  work_package_id    uuid NOT NULL REFERENCES work_packages (id) ON DELETE CASCADE,
  project_id         uuid NOT NULL REFERENCES procurement_projects (id) ON DELETE CASCADE,
  vendor_profile_id  uuid NOT NULL REFERENCES vendor_profiles (id) ON DELETE CASCADE,

  -- The department that issued it, denormalised from the project. An
  -- invitation outlives the shortlist entry it came from, and "which
  -- organisation invited us" is a fact the vendor is shown; resolving it
  -- through two joins on every read to save one column is not a saving.
  organization_id    uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,

  -- The shortlist entry the official acted on. ON DELETE SET NULL rather than
  -- CASCADE: removing a supplier from the shortlist must not silently delete
  -- the record that they were invited and what they answered.
  shortlist_id       uuid REFERENCES work_package_shortlist (id) ON DELETE SET NULL,

  status             work_package_invitation_status NOT NULL DEFAULT 'INVITED',

  -- Instructions the official wrote for this supplier, and the date by which a
  -- response is expected. Both are shown to the vendor verbatim.
  message            text,
  response_deadline  date,

  invited_by         uuid NOT NULL REFERENCES users (id),
  invited_at         timestamptz NOT NULL DEFAULT now(),

  -- The vendor's answer. `responded_by` is the vendor's own user account, so an
  -- acceptance is attributable to a person and not merely to an organisation.
  responded_by       uuid REFERENCES users (id),
  responded_at       timestamptz,
  response_note      text,

  withdrawn_by       uuid REFERENCES users (id),
  withdrawn_at       timestamptz,
  withdrawal_reason  text,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- A responded or withdrawn invitation must carry its timestamps, and an open
  -- one must not claim a response it does not have.
  CONSTRAINT work_package_invitations_response_consistent CHECK (
    (status IN ('ACCEPTED', 'DECLINED')) = (responded_at IS NOT NULL)
  ),
  CONSTRAINT work_package_invitations_withdrawal_consistent CHECK (
    (status = 'WITHDRAWN') = (withdrawn_at IS NOT NULL)
  )
);

-- One live invitation per supplier per work package. A withdrawn or declined
-- invitation leaves the partial index, so re-inviting after either is possible
-- — and is a fresh, separately audited row rather than a mutation of the one
-- the supplier already answered.
CREATE UNIQUE INDEX IF NOT EXISTS work_package_invitations_open_unique
  ON work_package_invitations (work_package_id, vendor_profile_id)
  WHERE status IN ('INVITED', 'ACCEPTED');

CREATE INDEX IF NOT EXISTS work_package_invitations_package_idx
  ON work_package_invitations (work_package_id, invited_at DESC);

-- The vendor portal's own query: my invitations, newest first.
CREATE INDEX IF NOT EXISTS work_package_invitations_vendor_idx
  ON work_package_invitations (vendor_profile_id, invited_at DESC);

-- ---------------------------------------------------------------------------
-- Notification linkage.
-- ---------------------------------------------------------------------------
--
-- `vendor_notifications` gains an optional pointer to the invitation it is
-- about. The existing `link_path` already takes the vendor to the right page;
-- this column is what makes the relationship queryable — "is this notification
-- still about a live invitation" is not answerable from a URL string.

ALTER TABLE vendor_notifications
  ADD COLUMN IF NOT EXISTS invitation_id uuid
    REFERENCES work_package_invitations (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS vendor_notifications_invitation_idx
  ON vendor_notifications (invitation_id)
  WHERE invitation_id IS NOT NULL;

-- Reading one notification at a time needs the unread predicate indexed on the
-- owner, which is how the header badge is counted on every page load.
CREATE INDEX IF NOT EXISTS vendor_notifications_unread_idx
  ON vendor_notifications (vendor_profile_id)
  WHERE read_at IS NULL;
