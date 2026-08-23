import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { CartPdfData } from './cart-pdf-data.js';

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: 'Helvetica', color: '#111827' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  tenantName: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  docType: { fontSize: 10, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  label: { fontFamily: 'Helvetica-Bold' },
  table: { marginTop: 6 },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
    paddingBottom: 3,
    marginBottom: 3,
  },
  tableRow: { flexDirection: 'row', paddingVertical: 2 },
  colArticle: { flex: 3 },
  colCategory: { flex: 1.5 },
  colSku: { flex: 1.3 },
  colQty: { flex: 0.8, textAlign: 'right' },
  colPrice: { flex: 1, textAlign: 'right' },
  colTotal: { flex: 1, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#111827',
  },
  totalLabel: { fontFamily: 'Helvetica-Bold', marginRight: 8 },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 24,
    right: 24,
    fontSize: 7,
    color: '#6b7280',
    textAlign: 'center',
  },
});

export function CartListTemplate({ data }: { data: CartPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.tenantName}>{data.tenantName}</Text>
          <Text style={styles.docType}>Listado de artículos - {data.generatedAt}</Text>
        </View>

        <View style={styles.metaRow}>
          <Text>
            <Text style={styles.label}>Armado por: </Text>
            {data.requestedByName}
          </Text>
          <Text>
            <Text style={styles.label}>Artículos: </Text>
            {data.lines.length}
          </Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colArticle, styles.label]}>Artículo</Text>
            <Text style={[styles.colCategory, styles.label]}>Categoría</Text>
            <Text style={[styles.colSku, styles.label]}>SKU</Text>
            <Text style={[styles.colQty, styles.label]}>Cant.</Text>
            <Text style={[styles.colPrice, styles.label]}>Precio</Text>
            <Text style={[styles.colTotal, styles.label]}>Subtotal</Text>
          </View>
          {data.lines.map((line, i) => (
            <View style={styles.tableRow} key={i}>
              <Text style={styles.colArticle}>
                {line.articleName}
                {line.variantLabel ? ` · ${line.variantLabel}` : ''}
              </Text>
              <Text style={styles.colCategory}>{line.categoryName ?? '-'}</Text>
              <Text style={styles.colSku}>{line.sku}</Text>
              <Text style={styles.colQty}>{line.quantity}</Text>
              <Text style={styles.colPrice}>{line.unitPrice}</Text>
              <Text style={styles.colTotal}>{line.lineTotal}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.label}>{data.total}</Text>
        </View>

        <Text style={styles.footer}>Generado por Oplex</Text>
      </Page>
    </Document>
  );
}
