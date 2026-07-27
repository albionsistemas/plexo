import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { PurchaseDocumentPdfData } from '../pdf-data.js';

const styles = StyleSheet.create({
  page: { padding: 18, fontSize: 8, fontFamily: 'Helvetica', color: '#111827' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#111827' },
  tenantName: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  docType: { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  metaRow: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  metaCol: { flex: 1 },
  label: { fontFamily: 'Helvetica-Bold' },
  table: { marginTop: 4 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#111827', paddingBottom: 2, marginBottom: 2 },
  tableRow: { flexDirection: 'row', paddingVertical: 1 },
  colArticle: { flex: 3 },
  colSku: { flex: 1.2 },
  colQty: { flex: 0.8, textAlign: 'right' },
  colCost: { flex: 1, textAlign: 'right' },
  colTotal: { flex: 1, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4, paddingTop: 2, borderTopWidth: 1, borderTopColor: '#111827' },
  totalLabel: { fontFamily: 'Helvetica-Bold', marginRight: 6 },
  notes: { marginTop: 6 },
  footer: { position: 'absolute', bottom: 12, left: 18, right: 18, fontSize: 6, color: '#6b7280', textAlign: 'center' },
});

export function CompactoTemplate({ data }: { data: PurchaseDocumentPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.tenantName}>{data.tenantName}{data.tenantTaxId ? ` - CUIT ${data.tenantTaxId}` : ''}</Text>
          <Text style={styles.docType}>{data.documentTypeLabel} {data.number} - {data.issueDate}</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text><Text style={styles.label}>Proveedor: </Text>{data.supplierName}{data.supplierTaxId ? ` (CUIT ${data.supplierTaxId})` : ''}</Text>
            {data.supplierAddress && <Text>{data.supplierAddress}</Text>}
          </View>
          <View style={styles.metaCol}>
            <Text><Text style={styles.label}>Moneda: </Text>{data.currencyCode}</Text>
            {data.transportModeName && <Text><Text style={styles.label}>Transporte: </Text>{data.transportModeName}</Text>}
            {data.paymentTermName && <Text><Text style={styles.label}>Pago: </Text>{data.paymentTermName}</Text>}
            {data.deliveryTimeName && <Text><Text style={styles.label}>Entrega: </Text>{data.deliveryTimeName}</Text>}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colArticle, styles.label]}>Artículo</Text>
            <Text style={[styles.colSku, styles.label]}>SKU</Text>
            <Text style={[styles.colQty, styles.label]}>Cant.</Text>
            <Text style={[styles.colCost, styles.label]}>Costo</Text>
            <Text style={[styles.colTotal, styles.label]}>Subtotal</Text>
          </View>
          {data.lines.map((line, i) => (
            <View style={styles.tableRow} key={i}>
              <Text style={styles.colArticle}>{line.articleName}</Text>
              <Text style={styles.colSku}>{line.sku}</Text>
              <Text style={styles.colQty}>{line.quantity}</Text>
              <Text style={styles.colCost}>{line.unitCost}</Text>
              <Text style={styles.colTotal}>{line.lineTotal}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total ({data.currencyCode})</Text>
          <Text style={styles.label}>{data.total}</Text>
        </View>

        {data.notes && (
          <View style={styles.notes}>
            <Text><Text style={styles.label}>Notas: </Text>{data.notes}</Text>
          </View>
        )}

        <Text style={styles.footer}>Generado por Plexo</Text>
      </Page>
    </Document>
  );
}
