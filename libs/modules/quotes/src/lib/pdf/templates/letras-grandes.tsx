import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { QuotePdfData } from '../pdf-data.js';

// Large type throughout, generous line-height, high contrast - a tight
// 5-column table doesn't fit at this scale, so each line is its own block
// instead (article name big, details on a second line) rather than
// shrinking columns to make a table fit.
const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 14, fontFamily: 'Helvetica', color: '#000000', lineHeight: 1.4 },
  tenantName: { fontSize: 20, fontFamily: 'Helvetica-Bold' },
  docType: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginTop: 8 },
  docNumber: { fontSize: 14, marginBottom: 12 },
  divider: { borderBottomWidth: 2, borderBottomColor: '#000000', marginVertical: 10 },
  block: { marginBottom: 10 },
  label: { fontFamily: 'Helvetica-Bold' },
  lineBlock: { marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#d4d4d4' },
  lineArticle: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  lineDetails: { fontSize: 13, color: '#262626', marginTop: 2 },
  totalBlock: { marginTop: 12, fontSize: 18, fontFamily: 'Helvetica-Bold' },
  notes: { marginTop: 16, fontSize: 13 },
  footer: { position: 'absolute', bottom: 20, left: 28, right: 28, fontSize: 10, color: '#404040', textAlign: 'center' },
});

export function LetrasGrandesTemplate({ data }: { data: QuotePdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.tenantName}>{data.tenantName}</Text>
        {data.tenantTaxId && <Text>CUIT {data.tenantTaxId}</Text>}
        <Text style={styles.docType}>Cotización N° {data.number}</Text>
        <Text style={styles.docNumber}>{data.issueDate}</Text>
        <View style={styles.divider} />

        <View style={styles.block}>
          <Text><Text style={styles.label}>Cliente: </Text>{data.customerName}</Text>
          {data.customerTaxId && <Text><Text style={styles.label}>CUIT: </Text>{data.customerTaxId}</Text>}
          {data.customerAddress && <Text><Text style={styles.label}>Domicilio: </Text>{data.customerAddress}</Text>}
        </View>
        <View style={styles.block}>
          <Text><Text style={styles.label}>Moneda: </Text>{data.currencyCode}</Text>
          {data.validUntil && <Text><Text style={styles.label}>Válida hasta: </Text>{data.validUntil}</Text>}
        </View>

        <View style={styles.divider} />

        {data.lines.map((line, i) => (
          <View style={styles.lineBlock} key={i}>
            <Text style={styles.lineArticle}>{line.articleName}</Text>
            <Text style={styles.lineDetails}>
              SKU {line.sku} · Cantidad {line.quantity} · Precio unit. {line.unitPrice} · Subtotal {line.lineTotal}
            </Text>
          </View>
        ))}

        <Text style={styles.totalBlock}>Total ({data.currencyCode}): {data.total}</Text>

        {data.notes && (
          <View style={styles.notes}>
            <Text><Text style={styles.label}>Notas: </Text>{data.notes}</Text>
          </View>
        )}

        <Text style={styles.footer}>Generado por Oplex</Text>
      </Page>
    </Document>
  );
}
