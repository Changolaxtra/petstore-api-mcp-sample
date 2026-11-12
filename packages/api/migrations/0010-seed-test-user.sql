--liquibase formatted sql

--changeset petstore-api:0010-seed-test-user
-- Preloaded test account for local/dev use (spec FR-013). Password is
-- "Petstore123!", documented in plain text in the project README — acceptable
-- only because this is a non-production sample project. The value below is
-- its Argon2id hash, generated via the project's own PasswordHasherService
-- (packages/api/src/security/password-hasher.service.ts).
INSERT INTO users (username, first_name, last_name, email, password, phone, user_status)
VALUES (
    'testuser',
    'Test',
    'User',
    'testuser@example.com',
    '$argon2id$v=19$m=65536,t=3,p=4$rArvOsyAAWispOt5Cv2oBA$VPKn7cZ5rQYBdlyq7wuErl5OHDDDZlzMHie6r3VZjC4',
    '555-0100',
    1
);

--rollback DELETE FROM users WHERE username = 'testuser';
