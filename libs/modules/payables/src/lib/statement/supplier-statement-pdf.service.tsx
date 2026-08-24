import { Injectable } from '@nestjs/common';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { getTenantDb, getTenantId } from '@plexo/database';
import type { SupplierStatement } from '../payables.service.js';

function formatNumber(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: Date): string {
  return value.toLocaleDateString('es-AR', { timeZone: 'UTC' });
}

// Mismo layout/paleta que VatBookTemplate en @plexo/taxes - un extracto de
// cuenta corriente es la misma familia de documento (tabla + totales), no
// hay motivo para reinventar el estilo.
const styles = StyleSheet.create({
  page: { padding: 20, fontSize: 8, fontFamily: 'Helvetica', color: '#111827' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  tenantName: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  tenantTaxId: { fontSize: 8, color: '#4b5563' },
  docType: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontFamily: 'Helvetica-Bold' },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 24,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
  },
  metric: { textAlign: 'right' },
  metricLabel: { fontSize: 7, color: '#4b5563' },
  metricValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
    paddingBottom: 3,
    marginBottom: 2,
  },
  tableRow: { flexDirection: 'row', paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  colDate: { flex: 0.9 },
  colDoc: { flex: 2.6 },
  colDue: { flex: 0.9 },
  colAmount: { flex: 1, textAlign: 'right' },
  colStatus: { flex: 1.3 },
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 20,
    right: 20,
    fontSize: 7,
    color: '#6b7280',
    textAlign: 'center',
  },
});

function SupplierStatementTemplate({
  statement,
  tenantName,
  tenantTaxId,
  generatedAt,
}: {
  statement: SupplierStatement;
  tenantName: string;
  tenantTaxId: string | null;
  generatedAt: string;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.tenantName}>{tenantName}</Text>
            {tenantTaxId && <Text style={styles.tenantTaxId}>CUIT {tenantTaxId}</Text>}
          </View>
          <Text style={styles.docType}>Cuenta Corriente</Text>
        </View>

        <View style={styles.metaRow}>
          <Text>
            <Text style={styles.label}>Proveedor: </Text>
            {statement.supplierName}
          </Text>
          <Text>
            <Text style={styles.label}>Generado: </Text>
            {generatedAt}
          </Text>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Saldo total vencido</Text>
            <Text style={styles.metricValue}>${formatNumber(statement.totalOverdue.toNumber())}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Saldo total a vencer</Text>
            <Text style={styles.metricValue}>${formatNumber(statement.totalNotYetDue.toNumber())}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Total adeudado</Text>
            <Text style={styles.metricValue}>${formatNumber(statement.totalOutstanding.toNumber())}</Text>
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.colDate, styles.label]}>Fecha</Text>
          <Text style={[styles.colDoc, styles.label]}>Comprobante</Text>
          <Text style={[styles.colDue, styles.label]}>Vence</Text>
          <Text style={[styles.colAmount, styles.label]}>Debe</Text>
          <Text style={[styles.colAmount, styles.label]}>Haber</Text>
          <Text style={[styles.colAmount, styles.label]}>Saldo</Text>
          <Text style={[styles.colStatus, styles.label]}>Estado</Text>
        </View>

        {statement.entries.map((entry) => (
          <View style={styles.tableRow} key={entry.id}>
            <Text style={styles.colDate}>{formatDate(entry.date)}</Text>
            <Text style={styles.colDoc}>{entry.documentNumber}</Text>
            <Text style={styles.colDue}>{entry.dueDate ? formatDate(entry.dueDate) : '—'}</Text>
            <Text style={styles.colAmount}>{entry.debe.isZero() ? '' : formatNumber(entry.debe.toNumber())}</Text>
            <Text style={styles.colAmount}>{entry.haber.isZero() ? '' : formatNumber(entry.haber.toNumber())}</Text>
            <Text style={styles.colAmount}>{formatNumber(entry.balance.toNumber())}</Text>
            <Text style={styles.colStatus}>{entry.status ?? '—'}</Text>
          </View>
        ))}

        <Text style={styles.footer} fixed>
          Generado por Oplex
        </Text>
      </Page>
    </Document>
  );
}

@Injectable()
export class SupplierStatementPdfService {
  async generate(statement: SupplierStatement): Promise<{ buffer: Buffer; filename: string }> {
    const tenant = await getTenantDb().tenant.findUniqueOrThrow({ where: { id: getTenantId() } });
    const buffer = await renderToBuffer(
      <SupplierStatementTemplate
        statement={statement}
        tenantName={tenant.name}
        tenantTaxId={tenant.taxId}
        generatedAt={new Date().toLocaleDateString('es-AR')}
      />,
    );
    const supplierSlug = statement.supplierName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    return { buffer, filename: `cuenta-corriente_${supplierSlug}.pdf` };
  }
}
