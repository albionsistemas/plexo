import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { PurchaseDocumentPdfData } from '../pdf-data.js';

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
  colArticle: { flex: 3 },
  colSku: { flex: 1.5 },
  colQty: { flex: 1, textAlign: 'right' },
  colCost: { flex: 1.5, textAlign: 'right' },
  colTotal: { flex: 1.5, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  totalLabel: { fontFamily: 'Helvetica-Bold', marginRight: 8 },
  totalValue: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: '#4f46e5' },
  notes: { marginTop: 16, padding: 10, backgroundColor: '#f1f5f9', borderRadius: 6 },
  footer: { position: 'absolute', bottom: 24, left: 32, right: 32, fontSize: 8, color: '#94a3b8', textAlign: 'center' },
});

export function ModernoTemplate({ data }: { data: PurchaseDocumentPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBand}>
          <View>
            <Text style={styles.tenantName}>{data.tenantName}</Text>
            {data.tenantTaxId && <Text>CUIT {data.tenantTaxId}</Text>}
          </View>
          <View>
            <Text style={styles.docType}>{data.documentTypeLabel}</Text>
            <Text style={styles.docNumber}>{data.number}</Text>
            <Text style={styles.docNumber}>{data.issueDate}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Proveedor</Text>
            <Text>{data.supplierName}</Text>
            {data.supplierTaxId && <Text>CUIT {data.supplierTaxId}</Text>}
            {data.supplierAddress && <Text>{data.supplierAddress}</Text>}
          </View>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Condiciones</Text>
            <Text>Moneda: {data.currencyCode}</Text>
            {data.transportModeName && <Text>Transporte: {data.transportModeName}</Text>}
            {data.paymentTermName && <Text>Forma de pago: {data.paymentTermName}</Text>}
            {data.deliveryTimeName && <Text>Plazo de entrega: {data.deliveryTimeName}</Text>}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colArticle}>Artículo</Text>
            <Text style={styles.colSku}>SKU</Text>
            <Text style={styles.colQty}>Cantidad</Text>
            <Text style={styles.colCost}>Costo unit.</Text>
            <Text style={styles.colTotal}>Subtotal</Text>
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
