import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { QuotePdfData } from '../pdf-data.js';

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica', color: '#44403c', backgroundColor: '#fffbeb' },
  header: { marginBottom: 16 },
  tenantName: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#78350f' },
  docType: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#b45309', marginTop: 6 },
  docNumber: { fontSize: 9, color: '#78716c' },
  row: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  box: { flex: 1, padding: 10, backgroundColor: '#fef3c7', borderRadius: 10 },
  boxTitle: { fontFamily: 'Helvetica-Bold', marginBottom: 4, color: '#92400e' },
  table: { marginTop: 6 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#fde68a',
    padding: 6,
    borderRadius: 8,
    color: '#78350f',
  },
  tableRow: { flexDirection: 'row', padding: 6, borderBottomWidth: 1, borderBottomColor: '#fde68a' },
  colArticle: { flex: 3 },
  colSku: { flex: 1.5 },
  colQty: { flex: 1, textAlign: 'right' },
  colPrice: { flex: 1.5, textAlign: 'right' },
  colTotal: { flex: 1.5, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    padding: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
  },
  totalLabel: { fontFamily: 'Helvetica-Bold', marginRight: 8, color: '#78350f' },
  totalValue: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: '#b45309' },
  notes: { marginTop: 16, padding: 10, backgroundColor: '#fef3c7', borderRadius: 10 },
  footer: { position: 'absolute', bottom: 24, left: 32, right: 32, fontSize: 8, color: '#a8a29e', textAlign: 'center' },
});

export function NaturalTemplate({ data }: { data: QuotePdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.tenantName}>{data.tenantName}</Text>
          {data.tenantTaxId && <Text style={styles.docNumber}>CUIT {data.tenantTaxId}</Text>}
          <Text style={styles.docType}>Cotización · {data.number}</Text>
          <Text style={styles.docNumber}>{data.issueDate}</Text>
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
            <Text style={styles.colTotal}>Subtotal</Text>
          </View>
          {data.lines.map((line, i) => (
            <View style={styles.tableRow} key={i}>
              <Text style={styles.colArticle}>{line.articleName}</Text>
              <Text style={styles.colSku}>{line.sku}</Text>
              <Text style={styles.colQty}>{line.quantity}</Text>
              <Text style={styles.colPrice}>{line.unitPrice}</Text>
              <Text style={styles.colTotal}>{line.lineTotal}</Text>
            </View>
          ))}
        </View>

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
