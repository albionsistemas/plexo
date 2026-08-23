import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { VatBookPdfData } from './vat-book-pdf-data.js';

const styles = StyleSheet.create({
  page: { padding: 20, fontSize: 7, fontFamily: 'Helvetica', color: '#111827' },
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
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontFamily: 'Helvetica-Bold' },
  table: { marginTop: 4 },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
    paddingBottom: 3,
    marginBottom: 2,
  },
  tableRow: { flexDirection: 'row', paddingVertical: 1.5, borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  totalsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#111827',
    marginTop: 2,
    paddingTop: 3,
  },
  colDate: { flex: 0.9 },
  colType: { flex: 1.6 },
  colNumber: { flex: 1.2 },
  colName: { flex: 2.4 },
  colTaxId: { flex: 1.1, textAlign: 'right' },
  colCondition: { flex: 1.5 },
  colAmount: { flex: 1, textAlign: 'right' },
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

export function VatBookTemplate({ data }: { data: VatBookPdfData }) {
  // Compras no tiene desglose real por alícuota (ver el comentario en
  // VatBookService.getPurchasesBook) - se muestra una sola columna "IVA
  // Crédito Fiscal" en vez de las 3 columnas 21/10.5/27 + Otras que sí
  // aplican a Ventas.
  const showRateColumns = data.kind === 'sales';

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.tenantName}>{data.tenantName}</Text>
            {data.tenantTaxId && <Text style={styles.tenantTaxId}>CUIT {data.tenantTaxId}</Text>}
          </View>
          <Text style={styles.docType}>{data.title}</Text>
        </View>

        <View style={styles.metaRow}>
          <Text>
            <Text style={styles.label}>Período: </Text>
            {data.from} a {data.to}
          </Text>
          <Text>
            <Text style={styles.label}>Generado: </Text>
            {data.generatedAt}
          </Text>
          <Text>
            <Text style={styles.label}>Comprobantes: </Text>
            {data.lines.length}
          </Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colDate, styles.label]}>Fecha</Text>
            <Text style={[styles.colType, styles.label]}>Comprobante</Text>
            <Text style={[styles.colNumber, styles.label]}>Número</Text>
            <Text style={[styles.colName, styles.label]}>Razón Social</Text>
            <Text style={[styles.colTaxId, styles.label]}>CUIT/DNI</Text>
            <Text style={[styles.colCondition, styles.label]}>Cond. IVA</Text>
            <Text style={[styles.colAmount, styles.label]}>Neto Grav.</Text>
            <Text style={[styles.colAmount, styles.label]}>Exento</Text>
            <Text style={[styles.colAmount, styles.label]}>No Grav.</Text>
            {showRateColumns ? (
              <>
                <Text style={[styles.colAmount, styles.label]}>IVA 21%</Text>
                <Text style={[styles.colAmount, styles.label]}>IVA 10,5%</Text>
                <Text style={[styles.colAmount, styles.label]}>IVA 27%</Text>
                <Text style={[styles.colAmount, styles.label]}>IVA Otras</Text>
              </>
            ) : (
              <Text style={[styles.colAmount, styles.label]}>IVA Créd. Fiscal</Text>
            )}
            <Text style={[styles.colAmount, styles.label]}>Percepc.</Text>
            <Text style={[styles.colAmount, styles.label]}>IVA Total</Text>
            <Text style={[styles.colAmount, styles.label]}>Total</Text>
          </View>

          {data.lines.map((line, i) => (
            <View style={styles.tableRow} key={i}>
              <Text style={styles.colDate}>{line.date}</Text>
              <Text style={styles.colType}>{line.documentType}</Text>
              <Text style={styles.colNumber}>{line.numberLabel}</Text>
              <Text style={styles.colName}>{line.counterpartyName}</Text>
              <Text style={styles.colTaxId}>{line.counterpartyTaxId}</Text>
              <Text style={styles.colCondition}>{line.taxCondition}</Text>
              <Text style={styles.colAmount}>{line.netTaxed}</Text>
              <Text style={styles.colAmount}>{line.netExempt}</Text>
              <Text style={styles.colAmount}>{line.netUntaxed}</Text>
              {showRateColumns ? (
                <>
                  <Text style={styles.colAmount}>{line.vat21}</Text>
                  <Text style={styles.colAmount}>{line.vat10_5}</Text>
                  <Text style={styles.colAmount}>{line.vat27}</Text>
                  <Text style={styles.colAmount}>{line.vatOther}</Text>
                </>
              ) : (
                <Text style={styles.colAmount}>{line.vatOther}</Text>
              )}
              <Text style={styles.colAmount}>{line.perceptions}</Text>
              <Text style={styles.colAmount}>{line.vatTotal}</Text>
              <Text style={styles.colAmount}>{line.total}</Text>
            </View>
          ))}

          <View style={styles.totalsRow}>
            <Text style={[styles.colDate, styles.label]}>Totales</Text>
            <Text style={styles.colType} />
            <Text style={styles.colNumber} />
            <Text style={styles.colName} />
            <Text style={styles.colTaxId} />
            <Text style={styles.colCondition} />
            <Text style={[styles.colAmount, styles.label]}>{data.totals.netTaxed}</Text>
            <Text style={[styles.colAmount, styles.label]}>{data.totals.netExempt}</Text>
            <Text style={[styles.colAmount, styles.label]}>{data.totals.netUntaxed}</Text>
            {showRateColumns ? (
              <>
                <Text style={[styles.colAmount, styles.label]}>{data.totals.vat21}</Text>
                <Text style={[styles.colAmount, styles.label]}>{data.totals.vat10_5}</Text>
                <Text style={[styles.colAmount, styles.label]}>{data.totals.vat27}</Text>
                <Text style={[styles.colAmount, styles.label]}>{data.totals.vatOther}</Text>
              </>
            ) : (
              <Text style={[styles.colAmount, styles.label]}>{data.totals.vatOther}</Text>
            )}
            <Text style={[styles.colAmount, styles.label]}>{data.totals.perceptions}</Text>
            <Text style={[styles.colAmount, styles.label]}>{data.totals.vatTotal}</Text>
            <Text style={[styles.colAmount, styles.label]}>{data.totals.total}</Text>
          </View>
        </View>

        <Text style={styles.footer}>Generado por Oplex</Text>
      </Page>
    </Document>
  );
}
