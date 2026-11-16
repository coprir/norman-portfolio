-- Database-level enforcement of the sealing rules. Application code obeys
-- these rules too; the triggers exist so that a bug, a stray script or a
-- hurried hot-fix cannot break them.
--
-- The single exception is account erasure (GDPR Art. 17), which sets
-- `dfm.erasure = on` for its transaction. Erasure can only destroy a sealed
-- capsule; nothing can make it readable early.

CREATE FUNCTION dfm_capsule_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.capsule_status <> 'DRAFT' AND current_setting('dfm.erasure', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'A sealed capsule cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.capsule_status <> OLD.capsule_status AND NOT (
       (OLD.capsule_status = 'DRAFT'     AND NEW.capsule_status = 'SEALING')
    OR (OLD.capsule_status = 'SEALING'   AND NEW.capsule_status IN ('LOCKED', 'DRAFT'))
    OR (OLD.capsule_status = 'LOCKED'    AND NEW.capsule_status = 'AVAILABLE')
    OR (OLD.capsule_status = 'AVAILABLE' AND NEW.capsule_status = 'OPENED')
  ) THEN
    RAISE EXCEPTION 'Illegal capsule transition % -> %', OLD.capsule_status, NEW.capsule_status;
  END IF;

  -- A capsule can never become available before its unlock time.
  IF OLD.capsule_status = 'LOCKED' AND NEW.capsule_status = 'AVAILABLE'
     AND (OLD.unlock_at IS NULL OR OLD.unlock_at > now()) THEN
    RAISE EXCEPTION 'Capsule cannot be released before unlock_at';
  END IF;

  IF NEW.capsule_status = 'LOCKED' AND OLD.capsule_status = 'SEALING' AND (
       NEW.sealed_at IS NULL OR NEW.unlock_at IS NULL OR NEW.encryption_key_reference IS NULL
    OR NEW.sealed_content_manifest IS NULL OR NEW.content_integrity_hash IS NULL OR NEW.release_job_id IS NULL
  ) THEN
    RAISE EXCEPTION 'A capsule cannot be locked without its seal';
  END IF;

  -- Once sealed, what the capsule is and when it opens are frozen.
  IF OLD.capsule_status IN ('LOCKED', 'AVAILABLE', 'OPENED') AND (
       NEW.unlock_at IS DISTINCT FROM OLD.unlock_at
    OR NEW.sealed_at IS DISTINCT FROM OLD.sealed_at
    OR NEW.creator_id IS DISTINCT FROM OLD.creator_id
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.timezone IS DISTINCT FROM OLD.timezone
    OR NEW.cover_key IS DISTINCT FROM OLD.cover_key
    OR NEW.seal_prefix IS DISTINCT FROM OLD.seal_prefix
    OR NEW.encryption_key_reference IS DISTINCT FROM OLD.encryption_key_reference
    OR NEW.sealed_content_manifest::text IS DISTINCT FROM OLD.sealed_content_manifest::text
    OR NEW.content_integrity_hash IS DISTINCT FROM OLD.content_integrity_hash
    OR NEW.release_job_id IS DISTINCT FROM OLD.release_job_id
    OR NEW.include_self IS DISTINCT FROM OLD.include_self
  ) THEN
    RAISE EXCEPTION 'A sealed capsule cannot be modified';
  END IF;

  -- While locked, the message stays out of the database (it is in the sealed payload).
  IF OLD.capsule_status = 'LOCKED' AND NEW.capsule_status = 'LOCKED' AND NEW.message IS NOT NULL THEN
    RAISE EXCEPTION 'A locked capsule holds no readable message';
  END IF;
  IF OLD.capsule_status IN ('AVAILABLE', 'OPENED') AND NEW.message IS DISTINCT FROM OLD.message THEN
    RAISE EXCEPTION 'A sealed capsule cannot be modified';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER capsules_guard BEFORE UPDATE OR DELETE ON capsules
  FOR EACH ROW EXECUTE FUNCTION dfm_capsule_guard();

-- Recipients are fixed at sealing. Their rows may still record acceptance
-- and opening, but nobody can be added or removed afterwards.
CREATE FUNCTION dfm_recipient_guard() RETURNS trigger AS $$
DECLARE st "CapsuleStatus";
BEGIN
  IF current_setting('dfm.erasure', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT capsule_status INTO st FROM capsules WHERE id = COALESCE(NEW.capsule_id, OLD.capsule_id);
  IF st IS NOT NULL AND st <> 'DRAFT' THEN
    IF TG_OP IN ('INSERT', 'DELETE') THEN
      RAISE EXCEPTION 'Recipients of a sealed capsule cannot be changed';
    ELSIF NEW.email IS DISTINCT FROM OLD.email OR NEW.capsule_id IS DISTINCT FROM OLD.capsule_id
       OR NEW.permission IS DISTINCT FROM OLD.permission THEN
      RAISE EXCEPTION 'Recipients of a sealed capsule cannot be changed';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER capsule_recipients_guard BEFORE INSERT OR UPDATE OR DELETE ON capsule_recipients
  FOR EACH ROW EXECUTE FUNCTION dfm_recipient_guard();

-- Released items and wrapped keys are written once.
CREATE FUNCTION dfm_write_once() RETURNS trigger AS $$
BEGIN
  IF current_setting('dfm.erasure', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'capsule_keys'
     AND NEW.wrapped_key = OLD.wrapped_key AND NEW.not_before = OLD.not_before
     AND NEW.capsule_id = OLD.capsule_id AND NEW.kek_id = OLD.kek_id AND NEW.algorithm = OLD.algorithm THEN
    RETURN NEW; -- only released_at may be stamped
  END IF;
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER capsule_keys_guard BEFORE UPDATE OR DELETE ON capsule_keys
  FOR EACH ROW EXECUTE FUNCTION dfm_write_once();
CREATE TRIGGER capsule_items_guard BEFORE UPDATE OR DELETE ON capsule_items
  FOR EACH ROW EXECUTE FUNCTION dfm_write_once();

-- The event history is append-only, with no exceptions.
CREATE FUNCTION dfm_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'capsule_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER capsule_events_guard BEFORE UPDATE OR DELETE ON capsule_events
  FOR EACH ROW EXECUTE FUNCTION dfm_append_only();
CREATE TRIGGER capsule_events_no_truncate BEFORE TRUNCATE ON capsule_events
  FOR EACH STATEMENT EXECUTE FUNCTION dfm_append_only();
