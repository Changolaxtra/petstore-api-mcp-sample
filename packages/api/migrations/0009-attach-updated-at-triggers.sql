--liquibase formatted sql

--changeset petstore-api:0009-attach-updated-at-triggers
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tags_updated_at BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pets_updated_at BEFORE UPDATE ON pets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_store_orders_updated_at BEFORE UPDATE ON store_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

--rollback DROP TRIGGER IF EXISTS trg_categories_updated_at ON categories;
--rollback DROP TRIGGER IF EXISTS trg_tags_updated_at ON tags;
--rollback DROP TRIGGER IF EXISTS trg_pets_updated_at ON pets;
--rollback DROP TRIGGER IF EXISTS trg_store_orders_updated_at ON store_orders;
--rollback DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
