import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class RagQueryDto {
  @IsString()
  @IsNotEmpty({ message: 'La query ne peut pas être vide.' })
  @MaxLength(500, { message: 'La query ne doit pas dépasser 500 caractères.' })
  query: string;

  @IsString()
  @IsNotEmpty({ message: 'Le userId est requis.' })
  userId: string;
}
