import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { QuotePdfData } from '../pdf-data.js';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Times-Roman', color: '#1a1a1a' },
  center: { textAlign: 'center' },
  tenantName: { fontSize: 16, fontFamily: 'Times-Bold', textAlign: 'center' },
  docType: { fontSize: 12, fontFamily: 'Times-Bold', textAlign: 'center', marginTop: 10, textTransform: 'uppercase' },
  docNumber: { fontSize: 10, textAlign: 'center', marginBottom: 4 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#1a1a1a', marginVertical: 12 },
  infoBlock: { marginBottom: 4 },
  label: { fontFamily: 'Times-Bold' },
  table: { marginTop: 12, borderWidth: 1, borderColor: '#1a1a1a' },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#d4d4d4' },
  cell: { padding: 6, borderRightWidth: 1, borderRightColor: '#1a1a1a' },
  colArticle: { flex: 3 },
  colSku: { flex: 1.3 },
  colQty: { flex: 1, textAlign: 'right' },
  colPrice: { flex: 1.3, textAlign: 'right' },
  colTotal: { flex: 1.3, textAlign: 'right', borderRightWidth: 0 },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  notes: { marginTop: 20 },
  signatureRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 60 },
  signatureLine: { borderTopWidth: 1, borderTopColor: '#1a1a1a', width: 160, paddingTop: 4, textAlign: 'center' },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, fontSize: 8, color: '#4a4a4a', textAlign: 'center' },
});

export function TradicionalTemplate({ data }: { data: QuotePdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.tenantName}>{data.tenantName}</Text>
        {data.tenantTaxId && <Text style={styles.center}>CUIT {data.tenantTaxId}</Text>}
        <Text style={styles.docType}>Cotización</Text>
        <Text style={styles.docNumber}>N° {data.number} - {data.issueDate}</Text>
        <View style={styles.divider} />

        <View style={styles.infoBlock}>
          <Text><Text style={styles.label}>Señores: </Text>{data.customerName}</Text>
          {data.customerTaxId && <Text><Text style={styles.label}>CUIT: </Text>{data.customerTaxId}</Text>}
          {data.customerAddress && <Text><Text style={styles.label}>Domicilio: </Text>{data.customerAddress}</Text>}
        </View>
        <View style={styles.infoBlock}>
          <Text><Text style={styles.label}>Moneda: </Text>{data.currencyCode}</Text>
          {data.validUntil && <Text><Text style={styles.label}>Válida hasta: </Text>{data.validUntil}</Text>}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.cell, styles.colArticle, styles.label]}>Artículo</Text>
            <Text style={[styles.cell, styles.colSku, styles.label]}>SKU</Text>
            <Text style={[styles.cell, styles.colQty, styles.label]}>Cantidad</Text>
            <Text style={[styles.cell, styles.colPrice, styles.label]}>Precio unit.</Text>
            <Text style={[styles.cell, styles.colTotal, styles.label]}>Subtotal</Text>
          </View>
          {data.lines.map((line, i) => (
            <View style={styles.tableRow} key={i}>
              <Text style={[styles.cell, styles.colArticle]}>
                {line.articleName}
                {line.variantLabel ? ` · ${line.variantLabel}` : ''}
              </Text>
              <Text style={[styles.cell, styles.colSku]}>{line.sku}</Text>
              <Text style={[styles.cell, styles.colQty]}>{line.quantity}</Text>
              <Text style={[styles.cell, styles.colPrice]}>{line.unitPrice}</Text>
              <Text style={[styles.cell, styles.colTotal]}>{line.lineTotal}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.label}>Total ({data.currencyCode}): {data.total}</Text>
        </View>

        {data.notes && (
          <View style={styles.notes}>
            <Text><Text style={styles.label}>Observaciones: </Text>{data.notes}</Text>
          </View>
        )}

        <View style={styles.signatureRow}>
          <Text style={styles.signatureLine}>Emitido por</Text>
          <Text style={styles.signatureLine}>Aceptado por</Text>
        </View>

        <Text style={styles.footer}>Generado por Oplex</Text>
      </Page>
    </Document>
  );
}
