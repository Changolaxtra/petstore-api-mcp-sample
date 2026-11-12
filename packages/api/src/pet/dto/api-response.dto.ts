/** Matches the committed contract's shared `ApiResponse` schema. */
export class ApiResponseDto {
  code!: number;
  type!: string;
  message!: string;
}
