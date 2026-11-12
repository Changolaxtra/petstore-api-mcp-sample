--liquibase formatted sql

--changeset petstore-api:0008-create-updated-at-trigger-function splitStatements:false
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--rollback DROP FUNCTION IF EXISTS set_updated_at();
