import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class RegisterDomainDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})+$/, {
    message: 'Ingresá un nombre de dominio válido (ej: tuempresa.com)',
  })
  domain!: string;
}
