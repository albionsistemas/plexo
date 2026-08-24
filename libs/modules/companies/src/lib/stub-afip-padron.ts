import { Injectable } from '@nestjs/common';
import type { AfipPadronData, AfipPadronPort } from './afip-padron.port.js';

/**
 * Wired in sólo cuando AFIP_PADRON_STUB=true (ver companies.module.ts) -
 * pensado para destrabar el testing de UX del autocompletado por CUIT
 * (Ventas/Compras) en desarrollo local, sin depender de un certificado AFIP
 * real. Deliberadamente una clase aparte, no un fallback silencioso dentro
 * de RealAfipPadronService: ese servicio ya distingue "no configurado"
 * (AfipNotConfiguredError, sin cert cargado) de una respuesta con datos, y
 * mezclar un mock ahí adentro arriesgaría que un cert vencido/inválido
 * termine devolviendo el mismo mock en vez de un error real - el mismo
 * criterio que hizo que lookupAfip() en CompaniesService.lookupAfip nunca
 * trague errores (ver el comentario ahí).
 *
 * Determinístico por CUIT (no random) para que un tester pueda reproducir
 * cada caso a voluntad tipeando un CUIT dado, cubriendo los 3 caminos reales
 * que consume el frontend (ver documentLetter.ts/CompanyFormModal):
 * Responsable Inscripto, Monotributo, y "AFIP no tiene datos" (null).
 */
@Injectable()
export class StubAfipPadronService implements AfipPadronPort {
  async lookup(cuit: string): Promise<AfipPadronData | null> {
    const lastDigit = Number(cuit.slice(-1));

    // CUIT terminado en 0 - simula "AFIP no tiene datos para ese CUIT".
    if (lastDigit === 0) {
      return null;
    }

    // Prefijo real de CUIT: 20/23/24/27 = persona física, 30/33/34 = persona
    // jurídica - mismo criterio que usa AFIP de verdad, para que un CUIT de
    // prueba "razonable" (ej. 30-XXXXXXXX-X) dispare el camino jurídica.
    const isJuridica = ['30', '33', '34'].includes(cuit.slice(0, 2));
    const isMonotributo = lastDigit % 2 === 0;

    return {
      cuit,
      personType: isJuridica ? 'JURIDICA' : 'FISICA',
      name: isJuridica ? `[STUB] Empresa de Prueba ${cuit}` : `[STUB] Persona de Prueba ${cuit}`,
      taxCondition: isMonotributo ? 'Monotributo (Stub)' : 'Responsable Inscripto',
      fiscalAddress: '[STUB] Av. de Prueba 123, CABA',
    };
  }
}
