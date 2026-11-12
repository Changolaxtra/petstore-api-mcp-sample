import type { UserRow } from '../user.repository';

/** Never includes `password` — write-only from the API's perspective (FR-003). */
export class UserResponseDto {
  id!: number;
  username!: string;
  firstName!: string | null;
  lastName!: string | null;
  email!: string | null;
  phone!: string | null;
  userStatus!: number | null;

  static fromRow(row: UserRow): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = row.id;
    dto.username = row.username;
    dto.firstName = row.first_name;
    dto.lastName = row.last_name;
    dto.email = row.email;
    dto.phone = row.phone;
    dto.userStatus = row.user_status;
    return dto;
  }
}
