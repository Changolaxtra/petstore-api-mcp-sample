--liquibase formatted sql

--changeset petstore-api:0005-create-pet-tags-table
CREATE TABLE pet_tags (
    pet_id BIGINT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    tag_id BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pet_id, tag_id)
);

--rollback DROP TABLE pet_tags;
