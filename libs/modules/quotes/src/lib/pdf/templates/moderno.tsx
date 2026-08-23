import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { QuotePdfData } from '../pdf-data.js';

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica', color: '#1e293b' },
  headerBand: {
    backgroundColor: '#4f46e5',
    color: '#ffffff',
    padding: 16,
    borderRadius: 6,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tenantName: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  docType: { fontSize: 12, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  docNumber: { fontSize: 10, textAlign: 'right' },
  row: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  box: { flex: 1, padding: 10, backgroundColor: '#f1f5f9', borderRadius: 6 },
  boxTitle: { fontFamily: 'Helvetica-Bold', marginBottom: 4, color: '#4f46e5' },
  table: { marginTop: 8 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#4f46e5',
    color: '#ffffff',
    padding: 6,
    borderRadius: 4,
  },
  tableRow: { flexDirection: 'row', padding: 6, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  colArticle: { flex: 2.5 },
  colSku: { flex: 1.2 },
  colQty: { flex: 0.8, textAlign: 'right' },
  colPrice: { flex: 1.2, textAlign: 'right' },
  colVat: { flex: 1, textAlign: 'right' },
  colTotal: { flex: 1.2, textAlign: 'right' },
  vatSummary: { marginTop: 8, alignSelf: 'flex-end', minWidth: 220 },
  vatSummaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  totalLabel: { fontFamily: 'Helvetica-Bold', marginRight: 8 },
  totalValue: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: '#4f46e5' },
  notes: { marginTop: 16, padding: 10, backgroundColor: '#f1f5f9', borderRadius: 6 },
  footer: { position: 'absolute', bottom: 24, left: 32, right: 32, fontSize: 8, color: '#94a3b8', textAlign: 'center' },
});

export function ModernoTemplate({ data }: { data: QuotePdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBand}>
          <View>
            <Text style={styles.tenantName}>{data.tenantName}</Text>
            {data.tenantTaxId && <Text>CUIT {data.tenantTaxId}</Text>}
          </View>
          <View>
            <Text style={styles.docType}>Cotización</Text>
            <Text style={styles.docNumber}>{data.number}</Text>
            <Text style={styles.docNumber}>{data.issueDate}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Cliente</Text>
            <Text>{data.customerName}</Text>
            {data.customerTaxId && <Text>CUIT {data.customerTaxId}</Text>}
            {data.customerAddress && <Text>{data.customerAddress}</Text>}
          </View>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Condiciones</Text>
            <Text>Moneda: {data.currencyCode}</Text>
            {data.validUntil && <Text>Válida hasta: {data.validUntil}</Text>}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colArticle}>Artículo</Text>
            <Text style={styles.colSku}>SKU</Text>
            <Text style={styles.colQty}>Cantidad</Text>
            <Text style={styles.colPrice}>Precio unit.</Text>
            <Text style={styles.colVat}>Alícuota</Text>
            <Text style={styles.colTotal}>Subtotal</Text>
          </View>
          {data.lines.map((line, i) => (
            <View style={styles.tableRow} key={i}>
              <Text style={styles.colArticle}>
                {line.articleName}
                {line.variantLabel ? ` · ${line.variantLabel}` : ''}
              </Text>
              <Text style={styles.colSku}>{line.sku}</Text>
              <Text style={styles.colQty}>{line.quantity}</Text>
              <Text style={styles.colPrice}>{line.unitPrice}</Text>
              <Text style={styles.colVat}>{line.vatLabel ?? '—'}</Text>
              <Text style={styles.colTotal}>{line.lineTotal}</Text>
            </View>
          ))}
        </View>

        {data.vatSummary && (
          <View style={styles.vatSummary}>
            <View style={styles.vatSummaryRow}>
              <Text>Neto Gravado</Text>
              <Text>{data.vatSummary.netTaxed}</Text>
            </View>
            <View style={styles.vatSummaryRow}>
              <Text>Exento/No Gravado</Text>
              <Text>{data.vatSummary.netExempt}</Text>
            </View>
            <View style={styles.vatSummaryRow}>
              <Text>IVA 21%</Text>
              <Text>{data.vatSummary.vat21}</Text>
            </View>
            <View style={styles.vatSummaryRow}>
              <Text>IVA 10,5%</Text>
              <Text>{data.vatSummary.vat10_5}</Text>
            </View>
            <View style={styles.vatSummaryRow}>
              <Text>IVA 27%</Text>
              <Text>{data.vatSummary.vat27}</Text>
            </View>
            <View style={styles.vatSummaryRow}>
              <Text>IVA Otras</Text>
              <Text>{data.vatSummary.vatOther}</Text>
            </View>
          </View>
        )}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total ({data.currencyCode})</Text>
          <Text style={styles.totalValue}>{data.total}</Text>
        </View>

        {data.notes && (
          <View style={styles.notes}>
            <Text style={styles.boxTitle}>Notas</Text>
            <Text>{data.notes}</Text>
          </View>
        )}

        <Text style={styles.footer}>Generado por Oplex</Text>
      </Page>
    </Document>
  );
}
