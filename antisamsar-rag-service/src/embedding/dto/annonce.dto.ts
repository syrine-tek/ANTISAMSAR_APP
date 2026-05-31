import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';

export class AnnonceDto {
  @IsString()
  id: string;

  @IsString()
  titre: string;

  @IsString()
  description: string;

  @IsNumber()
  prix: number;

  @IsString()
  localisation: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  caracteristiques?: string[];
}
