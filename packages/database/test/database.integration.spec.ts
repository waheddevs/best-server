import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import { loadInfrastructureEnvironment } from '@best/config';
import { Pool, type PoolClient } from 'pg';

interface EducationFixture {
  groupId: string;
  membershipId: string;
  studentId: string;
  teacherId: string;
}

interface PublishedTestFixture extends EducationFixture {
  correctOptionId: string;
  questionId: string;
  testVersionId: string;
  wrongOptionId: string;
}

const environment = loadInfrastructureEnvironment();
const pool = new Pool({
  application_name: 'best-database-integration-tests',
  connectionString: environment.postgres.url,
  max: 1,
});

after(async () => {
  await pool.end();
});

void test('initial migration exposes the reviewed database surface', async () => {
  await withTransaction(async (client) => {
    const migrations = await client.query<{ migration_name: string }>(
      `SELECT "migration_name"
       FROM "_prisma_migrations"
       WHERE "migration_name" = ANY($1::text[])
         AND "finished_at" IS NOT NULL
         AND "rolled_back_at" IS NULL`,
      [
        [
          '20260901000000_initial_domain_schema',
          '20260901010000_auth_identity_accounts',
          '20260901020000_scoring_outbox',
          '20260901030000_media_object_lifecycle',
          '20260901031000_media_object_updated_at_default',
          '20260901040000_media_malware_scan',
          '20260901041000_fix_media_attachment_trigger',
          '20260904010000_user_profiles',
          '20260904020000_groups_memberships_transfers',
          '20260904030000_learning_public_notifications',
          '20260904040000_vocabulary_import_pilot',
        ],
      ],
    );
    const tables = await client.query<{ count: string }>(
      `SELECT count(*)::text AS "count"
       FROM "information_schema"."tables"
       WHERE "table_schema" = 'public'
         AND "table_type" = 'BASE TABLE'
         AND "table_name" <> '_prisma_migrations'`,
    );
    const enums = await client.query<{ count: string }>(
      `SELECT count(*)::text AS "count"
       FROM "pg_type" AS t
       JOIN "pg_namespace" AS n ON n."oid" = t."typnamespace"
       WHERE n."nspname" = 'public'
         AND t."typtype" = 'e'`,
    );
    const triggers = await client.query<{ trigger_name: string }>(
      `SELECT "trigger_name"
       FROM "information_schema"."triggers"
       WHERE "trigger_schema" = 'public'`,
    );

    assert.equal(migrations.rowCount, 11);
    assert.equal(tables.rows[0]?.count, '51');
    assert.equal(enums.rows[0]?.count, '31');
    assert.deepEqual(
      new Set(triggers.rows.map(({ trigger_name }) => trigger_name)),
      new Set([
        'answer_option_translations_protect_published',
        'answer_options_protect_published',
        'attempt_answers_protect_submitted',
        'attempts_protect_lifecycle',
        'audit_logs_append_only',
        'finance_adjustments_append_only',
        'import_source_documents_protect_identity',
        'library_attachments_require_ready_media',
        'media_objects_protect_lifecycle',
        'outbox_events_protect_source',
        'payments_append_only',
        'payments_require_ready_media',
        'question_translations_protect_published',
        'questions_protect_published',
        'telegram_import_records_append_only',
        'test_translations_protect_published',
        'test_versions_protect_published',
        'tuition_charges_append_only',
      ]),
    );
  });
});

void test('auth accounts keep provider identity unique without storing tokens', async () => {
  await withTransaction(async (client) => {
    const firstUserId = randomUUID();
    const secondUserId = randomUUID();
    const providerAccountId = `provider-${randomUUID()}`;

    await client.query(
      `INSERT INTO "users"
        ("id", "role", "display_name", "email", "email_verified_at", "updated_at")
       VALUES
        ($1, 'STUDENT', 'First Student', 'student@example.com', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ($2, 'STUDENT', 'Second Student', NULL, NULL, CURRENT_TIMESTAMP)`,
      [firstUserId, secondUserId],
    );
    await client.query(
      `INSERT INTO "auth_accounts"
        ("id", "user_id", "provider", "provider_account_id",
         "provider_email", "provider_email_verified_at")
       VALUES ($1, $2, 'GOOGLE', $3, 'student@example.com', CURRENT_TIMESTAMP)`,
      [randomUUID(), firstUserId, providerAccountId],
    );

    await expectDatabaseError(
      client,
      () =>
        client.query(
          `INSERT INTO "auth_accounts"
            ("id", "user_id", "provider", "provider_account_id")
           VALUES ($1, $2, 'GOOGLE', $3)`,
          [randomUUID(), secondUserId, providerAccountId],
        ),
      /auth_accounts_provider_provider_account_id_key/,
    );

    await expectDatabaseError(
      client,
      () =>
        client.query(
          `INSERT INTO "users"
            ("id", "role", "display_name", "email", "updated_at")
           VALUES ($1, 'STUDENT', 'Invalid Email', 'Upper@Example.COM', CURRENT_TIMESTAMP)`,
          [randomUUID()],
        ),
      /users_email_normalized_check/,
    );

    const columns = await client.query<{ column_name: string }>(
      `SELECT "column_name"
       FROM "information_schema"."columns"
       WHERE "table_schema" = 'public'
         AND "table_name" = 'auth_accounts'`,
    );
    const columnNames = new Set(
      columns.rows.map(({ column_name }) => column_name),
    );

    for (const forbiddenColumn of [
      'access_token',
      'refresh_token',
      'id_token',
    ]) {
      assert.equal(columnNames.has(forbiddenColumn), false);
    }
  });
});

void test('a student cannot have two active group memberships', async () => {
  await withTransaction(async (client) => {
    const fixture = await createEducationFixture(client);
    const secondGroupId = randomUUID();

    await client.query(
      `INSERT INTO "groups"
        ("id", "teacher_id", "name", "slug", "payment_deadline_day", "updated_at")
       VALUES ($1, $2, $3, $4, 15, CURRENT_TIMESTAMP)`,
      [
        secondGroupId,
        fixture.teacherId,
        `Second group ${secondGroupId}`,
        `second-${secondGroupId}`,
      ],
    );

    await expectDatabaseError(
      client,
      () =>
        client.query(
          `INSERT INTO "group_memberships"
            ("id", "group_id", "student_id")
           VALUES ($1, $2, $3)`,
          [randomUUID(), secondGroupId, fixture.studentId],
        ),
      /group_memberships_one_active_per_student_idx/,
    );
  });
});

void test('published test content is complete and immutable', async () => {
  await withTransaction(async (client) => {
    const fixture = await createPublishedTestFixture(client);

    const publishedVersion = await client.query<{ status: string }>(
      `SELECT "status"
       FROM "test_versions"
       WHERE "id" = $1`,
      [fixture.testVersionId],
    );

    assert.equal(publishedVersion.rows[0]?.status, 'PUBLISHED');

    await expectDatabaseError(
      client,
      () =>
        client.query(
          `UPDATE "question_translations"
           SET "prompt" = 'Changed after publication'
           WHERE "question_id" = $1`,
          [fixture.questionId],
        ),
      /published question content is immutable/,
    );
  });
});

void test('submitted answers and scored attempts are immutable', async () => {
  await withTransaction(async (client) => {
    const fixture = await createPublishedTestFixture(client);
    const attemptId = randomUUID();
    const answerId = randomUUID();

    await client.query(
      `INSERT INTO "attempts"
        ("id", "test_version_id", "student_id", "group_membership_id",
         "attempt_number", "updated_at")
       VALUES ($1, $2, $3, $4, 1, CURRENT_TIMESTAMP)`,
      [
        attemptId,
        fixture.testVersionId,
        fixture.studentId,
        fixture.membershipId,
      ],
    );
    await client.query(
      `INSERT INTO "attempt_answers"
        ("id", "attempt_id", "question_id", "selected_option_id")
       VALUES ($1, $2, $3, $4)`,
      [answerId, attemptId, fixture.questionId, fixture.wrongOptionId],
    );
    await client.query(
      `UPDATE "attempts"
       SET "status" = 'SUBMITTED',
           "submitted_at" = CURRENT_TIMESTAMP,
           "submission_reason" = 'MANUAL',
           "updated_at" = CURRENT_TIMESTAMP
       WHERE "id" = $1`,
      [attemptId],
    );

    await expectDatabaseError(
      client,
      () =>
        client.query(
          `UPDATE "attempt_answers"
           SET "selected_option_id" = $1
           WHERE "id" = $2`,
          [fixture.correctOptionId, answerId],
        ),
      /submitted attempt answers are immutable/,
    );

    await client.query(
      `UPDATE "attempts"
       SET "status" = 'SCORED',
           "correct_answer_count" = 0,
           "total_question_count" = 1,
           "percentage" = 0,
           "passed" = false,
           "passing_percentage" = 60,
           "scoring_rule_version" = 'single-choice-v1',
           "updated_at" = CURRENT_TIMESTAMP
       WHERE "id" = $1`,
      [attemptId],
    );

    await expectDatabaseError(
      client,
      () =>
        client.query(
          `UPDATE "attempts"
           SET "percentage" = 100,
               "updated_at" = CURRENT_TIMESTAMP
           WHERE "id" = $1`,
          [attemptId],
        ),
      /scored attempts are immutable/,
    );
  });
});

void test('attempt submission outbox events are unique and immutable', async () => {
  await withTransaction(async (client) => {
    const fixture = await createPublishedTestFixture(client);
    const attemptId = randomUUID();

    await client.query(
      `INSERT INTO "attempts"
        ("id", "test_version_id", "student_id", "group_membership_id",
         "attempt_number", "status", "submitted_at", "submission_reason",
         "updated_at")
       VALUES ($1, $2, $3, $4, 1, 'SUBMITTED', CURRENT_TIMESTAMP, 'MANUAL',
               CURRENT_TIMESTAMP)`,
      [
        attemptId,
        fixture.testVersionId,
        fixture.studentId,
        fixture.membershipId,
      ],
    );

    const insertEvent = async () =>
      client.query(
        `INSERT INTO "outbox_events"
          ("id", "event_type", "aggregate_id", "payload", "correlation_id")
         VALUES ($1, 'ATTEMPT_SUBMITTED', $2, jsonb_build_object('attemptId', $2::uuid), $3)
         ON CONFLICT ("event_type", "aggregate_id") DO NOTHING
         RETURNING "id"`,
        [randomUUID(), attemptId, randomUUID()],
      );

    const firstInsert = await insertEvent();
    const duplicateInsert = await insertEvent();

    assert.equal(firstInsert.rowCount, 1);
    assert.equal(duplicateInsert.rowCount, 0);

    await expectDatabaseError(
      client,
      () =>
        client.query(
          `UPDATE "outbox_events"
           SET "payload" = jsonb_build_object('attemptId', $1, 'changed', true)
           WHERE "aggregate_id" = $1`,
          [attemptId],
        ),
      /outbox event source data is immutable/,
    );
  });
});

void test('finance source rows are append-only', async () => {
  await withTransaction(async (client) => {
    const fixture = await createEducationFixture(client);
    const paymentId = randomUUID();

    await client.query(
      `INSERT INTO "payments"
        ("id", "student_id", "recorded_by_id", "amount_uzs", "method", "paid_at")
       VALUES ($1, $2, $3, 500000, 'CASH', CURRENT_TIMESTAMP)`,
      [paymentId, fixture.studentId, fixture.teacherId],
    );

    await expectDatabaseError(
      client,
      () =>
        client.query(
          `UPDATE "payments"
           SET "amount_uzs" = 1
           WHERE "id" = $1`,
          [paymentId],
        ),
      /payments rows are append-only/,
    );
  });
});

void test('media objects require verified metadata before attachment', async () => {
  await withTransaction(async (client) => {
    const fixture = await createEducationFixture(client);
    const categoryId = randomUUID();
    const libraryItemId = randomUUID();
    const mediaObjectId = randomUUID();

    await client.query(
      `INSERT INTO "library_categories"
        ("id", "teacher_id", "name", "updated_at")
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [categoryId, fixture.teacherId, `Media category ${categoryId}`],
    );
    await client.query(
      `INSERT INTO "library_items"
        ("id", "owner_teacher_id", "category_id", "primary_language",
         "visibility", "updated_at")
       VALUES ($1, $2, $3, 'UZ', 'ALL_GROUPS', CURRENT_TIMESTAMP)`,
      [libraryItemId, fixture.teacherId, categoryId],
    );
    await client.query(
      `INSERT INTO "media_objects"
        ("id", "created_by_id", "media_type", "bucket", "object_key",
         "original_name", "mime_type", "upload_expires_at", "updated_at")
       VALUES
        ($1, $2, 'PDF', 'best-private', $3, 'lesson.pdf',
         'application/pdf', CURRENT_TIMESTAMP + INTERVAL '5 minutes',
         CURRENT_TIMESTAMP)`,
      [mediaObjectId, fixture.teacherId, `private/${mediaObjectId}`],
    );

    await expectDatabaseError(
      client,
      () =>
        client.query(
          `UPDATE "media_objects"
           SET "status" = 'READY',
               "size_bytes" = 1024,
               "checksum_sha256" = repeat('a', 64),
               "verified_at" = CURRENT_TIMESTAMP
           WHERE "id" = $1`,
          [mediaObjectId],
        ),
      /invalid media object status transition/,
    );

    await client.query(
      `UPDATE "media_objects"
       SET "status" = 'VERIFYING'
       WHERE "id" = $1`,
      [mediaObjectId],
    );

    await expectDatabaseError(
      client,
      () =>
        client.query(
          `INSERT INTO "library_attachments"
            ("id", "library_item_id", "media_object_id", "position")
           VALUES ($1, $2, $3, 1)`,
          [randomUUID(), libraryItemId, mediaObjectId],
        ),
      /media object must be READY and CLEAN before domain attachment/,
    );

    await client.query(
      `UPDATE "media_objects"
       SET "status" = 'READY',
           "visibility" = 'DOMAIN_AUTHORIZED',
           "size_bytes" = 1024,
           "checksum_sha256" = repeat('a', 64),
           "verified_at" = CURRENT_TIMESTAMP,
           "malware_status" = 'CLEAN',
           "malware_scanned_at" = CURRENT_TIMESTAMP,
           "malware_engine" = 'CLAMAV',
           "malware_engine_version" = '1.5.3',
           "malware_signature_version" = '99999'
       WHERE "id" = $1`,
      [mediaObjectId],
    );
    await client.query(
      `INSERT INTO "library_attachments"
        ("id", "library_item_id", "media_object_id", "position")
       VALUES ($1, $2, $3, 1)`,
      [randomUUID(), libraryItemId, mediaObjectId],
    );

    await expectDatabaseError(
      client,
      () =>
        client.query(
          `UPDATE "media_objects"
           SET "size_bytes" = 2048
           WHERE "id" = $1`,
          [mediaObjectId],
        ),
      /terminal media object metadata is immutable/,
    );
  });
});

void test('Telegram import retries are idempotent and provenance is immutable', async () => {
  await withTransaction(async (client) => {
    const fixture = await createEducationFixture(client);
    const importRunId = randomUUID();
    const libraryCategoryId = randomUUID();
    const libraryItemId = randomUUID();
    const importRecordId = randomUUID();
    const channelId = `channel-${randomUUID()}`;
    const messageId = '42';

    await client.query(
      `INSERT INTO "library_categories"
        ("id", "teacher_id", "name", "updated_at")
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [libraryCategoryId, fixture.teacherId, `Category ${libraryCategoryId}`],
    );
    await client.query(
      `INSERT INTO "library_items"
        ("id", "owner_teacher_id", "category_id", "primary_language",
         "visibility", "updated_at")
       VALUES ($1, $2, $3, 'UZ', 'ALL_GROUPS', CURRENT_TIMESTAMP)`,
      [libraryItemId, fixture.teacherId, libraryCategoryId],
    );
    await client.query(
      `INSERT INTO "telegram_import_runs" ("id", "channel_id")
       VALUES ($1, $2)`,
      [importRunId, channelId],
    );

    const insertImportRecord = async () =>
      client.query(
        `INSERT INTO "telegram_import_records"
          ("id", "import_run_id", "library_item_id", "channel_id",
           "message_id", "message_date", "original_text")
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, 'Original')
         ON CONFLICT ("channel_id", "message_id") DO NOTHING
         RETURNING "id"`,
        [importRecordId, importRunId, libraryItemId, channelId, messageId],
      );

    const firstImport = await insertImportRecord();
    const retry = await insertImportRecord();

    assert.equal(firstImport.rowCount, 1);
    assert.equal(retry.rowCount, 0);

    await expectDatabaseError(
      client,
      () =>
        client.query(
          `UPDATE "telegram_import_records"
           SET "original_text" = 'Changed provenance'
           WHERE "id" = $1`,
          [importRecordId],
        ),
      /telegram_import_records rows are append-only/,
    );
  });
});

void test('vocabulary import drafts preserve source identity and ordered entries', async () => {
  await withTransaction(async (client) => {
    const fixture = await createEducationFixture(client);
    const mediaObjectId = randomUUID();
    const sourceDocumentId = randomUUID();
    const draftId = randomUUID();
    const channelId = `channel-${randomUUID()}`;

    await client.query(
      `INSERT INTO "media_objects"
        ("id", "created_by_id", "media_type", "status", "source",
         "visibility", "bucket", "object_key", "original_name", "mime_type",
         "upload_expires_at", "updated_at")
       VALUES
        ($1, $2, 'PDF', 'VERIFYING', 'TELEGRAM_IMPORT', 'OWNER_ONLY',
         'best-private', $3, 'unit-1.pdf', 'application/pdf',
         CURRENT_TIMESTAMP + INTERVAL '5 minutes', CURRENT_TIMESTAMP)`,
      [
        mediaObjectId,
        fixture.teacherId,
        `private/${fixture.teacherId}/${mediaObjectId}`,
      ],
    );
    await client.query(
      `INSERT INTO "import_source_documents"
        ("id", "channel_id", "message_id", "content_message_id",
         "media_object_id", "checksum_sha256", "original_name",
         "source_published_at", "extraction_method", "extraction_status",
         "rights_status", "detected_brands", "updated_at")
       VALUES
        ($1, $2, 261, 264, $3, repeat('a', 64), 'unit-1.pdf',
         CURRENT_TIMESTAMP, 'EMBEDDED_TEXT', 'COMPLETED', 'REVIEW_REQUIRED',
         '["Cambridge"]'::jsonb, CURRENT_TIMESTAMP)`,
      [sourceDocumentId, channelId, mediaObjectId],
    );
    await client.query(
      `INSERT INTO "vocabulary_drafts"
        ("id", "source_document_id", "title", "parser_version", "status",
         "unparsed_lines", "updated_at")
       VALUES ($1, $2, 'The family', 1, 'DRAFT', '[]'::jsonb, CURRENT_TIMESTAMP)`,
      [draftId, sourceDocumentId],
    );
    await client.query(
      `INSERT INTO "vocabulary_draft_entries"
        ("id", "draft_id", "position", "section", "term", "pronunciation", "translation")
       VALUES
        ($1, $2, 1, 'Family words', 'mother', 'mʌðə', 'ona'),
        ($3, $2, 2, 'Family words', 'father', 'fɑːðə', 'ota')`,
      [randomUUID(), draftId, randomUUID()],
    );

    const entries = await client.query<{ position: number; term: string }>(
      `SELECT "position", "term"
       FROM "vocabulary_draft_entries"
       WHERE "draft_id" = $1
       ORDER BY "position"`,
      [draftId],
    );

    assert.deepEqual(entries.rows, [
      { position: 1, term: 'mother' },
      { position: 2, term: 'father' },
    ]);

    await expectDatabaseError(
      client,
      () =>
        client.query(
          `UPDATE "import_source_documents"
           SET "message_id" = 999
           WHERE "id" = $1`,
          [sourceDocumentId],
        ),
      /import source document identity is immutable/,
    );
  });
});

async function createEducationFixture(
  client: PoolClient,
): Promise<EducationFixture> {
  const teacherId = randomUUID();
  const studentId = randomUUID();
  const groupId = randomUUID();
  const membershipId = randomUUID();

  await client.query(
    `INSERT INTO "users" ("id", "role", "display_name", "updated_at")
     VALUES
       ($1, 'TEACHER', 'Integration Teacher', CURRENT_TIMESTAMP),
       ($2, 'STUDENT', 'Integration Student', CURRENT_TIMESTAMP)`,
    [teacherId, studentId],
  );
  await client.query(
    `INSERT INTO "groups"
      ("id", "teacher_id", "name", "slug", "payment_deadline_day", "updated_at")
     VALUES ($1, $2, $3, $4, 10, CURRENT_TIMESTAMP)`,
    [groupId, teacherId, `Group ${groupId}`, `group-${groupId}`],
  );
  await client.query(
    `INSERT INTO "group_memberships" ("id", "group_id", "student_id")
     VALUES ($1, $2, $3)`,
    [membershipId, groupId, studentId],
  );

  return { groupId, membershipId, studentId, teacherId };
}

async function createPublishedTestFixture(
  client: PoolClient,
): Promise<PublishedTestFixture> {
  const education = await createEducationFixture(client);
  const categoryId = randomUUID();
  const testId = randomUUID();
  const testVersionId = randomUUID();
  const questionId = randomUUID();
  const correctOptionId = randomUUID();
  const wrongOptionId = randomUUID();

  await client.query(
    `INSERT INTO "test_categories"
      ("id", "teacher_id", "name", "updated_at")
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
    [categoryId, education.teacherId, `Category ${categoryId}`],
  );
  await client.query(
    `INSERT INTO "tests"
      ("id", "group_id", "category_id", "updated_at")
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
    [testId, education.groupId, categoryId],
  );
  await client.query(
    `INSERT INTO "test_versions"
      ("id", "test_id", "version", "primary_language", "updated_at")
     VALUES ($1, $2, 1, 'UZ', CURRENT_TIMESTAMP)`,
    [testVersionId, testId],
  );
  await client.query(
    `INSERT INTO "test_translations"
      ("id", "test_version_id", "language", "title")
     VALUES ($1, $2, 'UZ', 'Integration test')`,
    [randomUUID(), testVersionId],
  );
  await client.query(
    `INSERT INTO "questions" ("id", "test_version_id", "position")
     VALUES ($1, $2, 1)`,
    [questionId, testVersionId],
  );
  await client.query(
    `INSERT INTO "question_translations"
      ("id", "question_id", "language", "prompt")
     VALUES ($1, $2, 'UZ', 'Choose one')`,
    [randomUUID(), questionId],
  );
  await client.query(
    `INSERT INTO "answer_options"
      ("id", "question_id", "position", "is_correct")
     VALUES
       ($1, $3, 1, true),
       ($2, $3, 2, false)`,
    [correctOptionId, wrongOptionId, questionId],
  );
  await client.query(
    `INSERT INTO "answer_option_translations"
      ("id", "answer_option_id", "language", "text")
     VALUES
       ($1, $3, 'UZ', 'Correct'),
       ($2, $4, 'UZ', 'Wrong')`,
    [randomUUID(), randomUUID(), correctOptionId, wrongOptionId],
  );
  await client.query(
    `UPDATE "test_versions"
     SET "status" = 'PUBLISHED',
         "published_at" = CURRENT_TIMESTAMP,
         "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = $1`,
    [testVersionId],
  );

  return {
    ...education,
    correctOptionId,
    questionId,
    testVersionId,
    wrongOptionId,
  };
}

async function expectDatabaseError(
  client: PoolClient,
  action: () => Promise<unknown>,
  expectedMessage: RegExp,
): Promise<void> {
  await client.query('SAVEPOINT expected_database_error');

  let databaseError: unknown;

  try {
    await action();
  } catch (error: unknown) {
    databaseError = error;
  }

  await client.query('ROLLBACK TO SAVEPOINT expected_database_error');
  await client.query('RELEASE SAVEPOINT expected_database_error');

  assert.notEqual(
    databaseError,
    undefined,
    'expected the database to reject SQL',
  );
  assert.match(getErrorMessage(databaseError), expectedMessage);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function withTransaction(
  action: (client: PoolClient) => Promise<void>,
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await action(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}
