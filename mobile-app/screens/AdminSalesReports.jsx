/**
 * AdminSalesReports.jsx -- Business Reports (Sales & Inventory)
 * Aggregated report creator with date filters, KPI cards, and detailed tables.
 * Mirrors web AdminBusinessReports.js functionality.
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  RefreshControl, SafeAreaView, Platform, Share, Alert, ActivityIndicator, ActionSheetIOS, Modal
} from 'react-native';
import {
  ChevronLeft, TrendingUp, Package, DollarSign, Activity, Tag,
  AlertTriangle, Search, Share2, RefreshCw, ChevronDown, Calendar,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/context/ThemeContext';
import { typography, borderRadius, shadows } from '../src/theme';
import { AnimatedTouchable } from '../src/components/shared/AnimatedTouchable';
import { PremiumLoader } from '../src/components/shared/PremiumLoader';
import { EmptyState } from '../src/components/shared/EmptyState';
import { formatCurrency } from '../src/utils/formatters';
import { API_BASE_URL } from '../src/utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateCSV, exportCSV, buildReportHTML, printOrSharePDF, sharePDF } from '../src/utils/exportHelpers';

const toDateStr = (d) => d.toISOString().split('T')[0];
const fmtPeso = (v) => `P${parseFloat(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PRESETS = [
  { label: 'This Week', key: 'week' },
  { label: 'This Month', key: 'month' },
  { label: 'This Quarter', key: 'quarter' },
  { label: 'This Year', key: 'year' },
  { label: 'Custom', key: 'custom' },
];

const getPresetDates = (key) => {
  const now = new Date();
  const end = toDateStr(now);
  if (key === 'week') {
    const d = new Date(now);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return { start: toDateStr(d), end };
  }
  if (key === 'month') {
    return { start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, end };
  }
  if (key === 'quarter') {
    const qm = Math.floor(now.getMonth() / 3) * 3;
    return { start: `${now.getFullYear()}-${String(qm + 1).padStart(2, '0')}-01`, end };
  }
  if (key === 'year') {
    return { start: `${now.getFullYear()}-01-01`, end };
  }
  return { start: end, end };
};

export const AdminSalesReports = ({ navigation }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const s = getStyles(theme, insets);

  const [reportType, setReportType] = useState('sales');
  const [preset, setPreset] = useState('month');
  const [startDate, setStartDate] = useState(() => getPresetDates('month').start);
  const [endDate, setEndDate] = useState(() => getPresetDates('month').end);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [customDateModalVisible, setCustomDateModalVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const h = { Authorization: `Bearer ${token}` };
      if (reportType === 'sales') {
        const res = await fetch(`${API_BASE_URL}/api/admin/invoices`, { headers: h });
        const d = await res.json();
        if (d.success) setInvoices(d.data || []);
      } else {
        const [invR, txR] = await Promise.all([
          fetch(`${API_BASE_URL}/api/admin/inventory`, { headers: h }),
          fetch(`${API_BASE_URL}/api/admin/inventory/transactions`, { headers: h }),
        ]);
        const invD = await invR.json();
        const txD = await txR.json();
        if (invD.success) setInventory(invD.data || []);
        if (txD.success) setTransactions(txD.data || []);
      }
    } catch (e) { console.warn('Report fetch error:', e); }
    finally { setLoading(false); }
  }, [reportType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handlePreset = (key) => {
    if (key === 'custom') {
      setCustomDateModalVisible(true);
      return;
    }
    setPreset(key);
    const { start, end } = getPresetDates(key);
    setStartDate(start);
    setEndDate(end);
  };

  /* ═══ SALES AGGREGATION ═══ */
  const salesReport = useMemo(() => {
    if (reportType !== 'sales') return null;
    const sD = new Date(startDate);
    const eD = new Date(endDate); eD.setHours(23, 59, 59, 999);

    const period = invoices.filter(inv => {
      const d = new Date(inv.created_at || inv.issue_date);
      return d >= sD && d <= eD && (inv.status || '').toLowerCase() === 'paid';
    });

    let gross = 0, discounts = 0, service = 0, retail = 0;
    const products = {};

    period.forEach(inv => {
      const amt = parseFloat(inv.amount) || 0;
      const disc = parseFloat(inv.discount_amount) || 0;
      gross += amt; discounts += disc;
      const type = (inv.service_type || '').toLowerCase();
      if (type.includes('retail') || type.includes('pos')) {
        retail += (amt - disc);
        if (inv.items) {
          try {
            const items = typeof inv.items === 'string' ? JSON.parse(inv.items) : inv.items;
            items.forEach(it => {
              if (!products[it.name]) products[it.name] = { name: it.name, qty: 0, rev: 0 };
              products[it.name].qty += parseInt(it.quantity) || 0;
              products[it.name].rev += (parseFloat(it.retail_price) || 0) * (parseInt(it.quantity) || 0);
            });
          } catch (_) {}
        }
      } else { service += (amt - disc); }
    });

    const net = gross - discounts;
    const count = period.length;
    const atv = count > 0 ? net / count : 0;
    const top = Object.values(products).sort((a, b) => b.rev - a.rev).slice(0, 10);
    return { gross, discounts, net, count, atv, service, retail, top };
  }, [invoices, startDate, endDate, reportType]);

  /* ═══ INVENTORY AGGREGATION ═══ */
  const invReport = useMemo(() => {
    if (reportType !== 'inventory') return null;
    const sD = new Date(startDate);
    const eD = new Date(endDate); eD.setHours(23, 59, 59, 999);

    let totalVal = 0, totalQty = 0, lowCount = 0;
    const lowItems = [];
    inventory.forEach(it => {
      const qty = parseInt(it.quantity) || 0;
      const min = parseInt(it.min_stock_level) || 0;
      const cost = parseFloat(it.cost) || parseFloat(it.retail_price) || 0;
      totalQty += qty; totalVal += qty * cost;
      if (qty <= min) { lowCount++; lowItems.push(it); }
    });

    const moves = {};
    transactions.forEach(tx => {
      const d = new Date(tx.created_at || tx.transaction_date);
      if (d >= sD && d <= eD) {
        const isOut = (tx.type || '').toLowerCase() === 'out';
        const qty = parseInt(tx.quantity) || 0;
        if (!moves[tx.item_name]) moves[tx.item_name] = { name: tx.item_name, consumed: 0, added: 0 };
        if (isOut) moves[tx.item_name].consumed += qty;
        else moves[tx.item_name].added += qty;
      }
    });
    const topConsumed = Object.values(moves).filter(m => m.consumed > 0).sort((a, b) => b.consumed - a.consumed).slice(0, 10);
    return { totalVal, totalQty, lowCount, lowItems, topConsumed };
  }, [inventory, transactions, startDate, endDate, reportType]);

  /* ═══ SHARE / EXPORT ═══ */
  const handleExport = () => {
    const options = ['Share as Text', 'Export as CSV', 'Print Report', 'Share PDF', 'Cancel'];
    const cancelIndex = 4;

    const doAction = (index) => {
      if (index === 0) {
        // Original text share
        let text = `InkVistAR ${reportType === 'sales' ? 'Sales' : 'Inventory'} Report\nPeriod: ${startDate} to ${endDate}\nGenerated: ${new Date().toLocaleString()}\n\n`;
        if (reportType === 'sales' && salesReport) {
          text += `Net Revenue: ${fmtPeso(salesReport.net)}\nTransactions: ${salesReport.count}\nAvg Transaction: ${fmtPeso(salesReport.atv)}\nService Revenue: ${fmtPeso(salesReport.service)}\nRetail Revenue: ${fmtPeso(salesReport.retail)}\nDiscounts: ${fmtPeso(salesReport.discounts)}\n`;
          if (salesReport.top.length > 0) {
            text += '\nTop Products:\n';
            salesReport.top.forEach(p => { text += `  ${p.name}: ${p.qty} sold, ${fmtPeso(p.rev)}\n`; });
          }
        } else if (reportType === 'inventory' && invReport) {
          text += `Stock Value: ${fmtPeso(invReport.totalVal)}\nItems on Hand: ${invReport.totalQty}\nLow Stock Alerts: ${invReport.lowCount}\n`;
          if (invReport.topConsumed.length > 0) {
            text += '\nTop Consumed:\n';
            invReport.topConsumed.forEach(p => { text += `  ${p.name}: -${p.consumed} consumed, +${p.added} added\n`; });
          }
        }
        Share.share({ message: text, title: 'Business Report' }).catch(() => {});
      } else if (index === 1) {
        // CSV Export
        if (reportType === 'sales') {
          const sD = new Date(startDate);
          const eD = new Date(endDate); eD.setHours(23, 59, 59, 999);
          const period = invoices.filter(inv => {
            const d = new Date(inv.created_at || inv.issue_date);
            return d >= sD && d <= eD && (inv.status || '').toLowerCase() === 'paid';
          });
          const columns = [
            { key: 'created_at', label: 'Date' },
            { key: 'client', label: 'Client' },
            { key: 'service_type', label: 'Type' },
            { key: 'amount', label: 'Amount' },
            { key: 'discount_amount', label: 'Discount' },
            { key: 'status', label: 'Status' },
          ];
          const csv = generateCSV(period, columns);
          exportCSV(csv, `sales_report_${startDate}_to_${endDate}`);
        } else {
          const columns = [
            { key: 'name', label: 'Item' },
            { key: 'category', label: 'Category' },
            { key: 'quantity', label: 'Stock' },
            { key: 'min_stock_level', label: 'Min Stock' },
            { key: 'cost', label: 'Unit Cost' },
            { key: 'retail_price', label: 'Retail Price' },
          ];
          const csv = generateCSV(inventory, columns);
          exportCSV(csv, `inventory_report_${startDate}_to_${endDate}`);
        }
      } else if (index === 2 || index === 3) {
        // Print or Share PDF
        const html = reportType === 'sales' && salesReport
          ? buildReportHTML({
              title: 'Sales & Revenue Report',
              subtitle: `Period: ${startDate} to ${endDate}`,
              metrics: [
                { label: 'Net Revenue', value: fmtPeso(salesReport.net) },
                { label: 'Transactions', value: String(salesReport.count) },
                { label: 'Avg Transaction', value: fmtPeso(salesReport.atv) },
                { label: 'Discounts', value: fmtPeso(salesReport.discounts) },
              ],
              tables: [
                {
                  title: 'Revenue by Source',
                  headers: ['Source', 'Amount', '% Share'],
                  rows: [
                    ['Tattoo Services', fmtPeso(salesReport.service), salesReport.net > 0 ? `${((salesReport.service / salesReport.net) * 100).toFixed(1)}%` : '0%'],
                    ['Retail POS', fmtPeso(salesReport.retail), salesReport.net > 0 ? `${((salesReport.retail / salesReport.net) * 100).toFixed(1)}%` : '0%'],
                  ],
                },
                {
                  title: 'Bestselling Retail Products',
                  headers: ['Product', 'Qty Sold', 'Revenue'],
                  rows: salesReport.top.map(p => [p.name, String(p.qty), fmtPeso(p.rev)]),
                },
              ],
            })
          : buildReportHTML({
              title: 'Inventory Report',
              subtitle: `Period: ${startDate} to ${endDate}`,
              metrics: [
                { label: 'Stock Value', value: fmtPeso(invReport?.totalVal || 0) },
                { label: 'Items on Hand', value: String(invReport?.totalQty || 0) },
                { label: 'Low Stock Alerts', value: `${invReport?.lowCount || 0} items` },
              ],
              tables: [
                {
                  title: 'Highest Turnover (Consumed)',
                  headers: ['Item', 'Used', 'Restocked'],
                  rows: (invReport?.topConsumed || []).map(p => [p.name, `-${p.consumed}`, `+${p.added}`]),
                },
                {
                  title: 'Low Stock / Reorder Alerts',
                  headers: ['Item', 'Current Stock', 'Minimum'],
                  rows: (invReport?.lowItems || []).map(p => [p.name, String(p.quantity), String(p.min_stock_level)]),
                },
              ],
            });
        if (index === 2) printOrSharePDF(html);
        else sharePDF(html, `${reportType}_report_${startDate}_to_${endDate}`);
      }
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, title: 'Export Report' },
        doAction
      );
    } else {
      Alert.alert('Export Report', 'Choose an export format:', [
        { text: 'Share Text', onPress: () => doAction(0) },
        { text: 'CSV File', onPress: () => doAction(1) },
        { text: 'Print Report', onPress: () => doAction(2) },
        { text: 'Share PDF', onPress: () => doAction(3) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  /* ═══ KPI CARD ═══ */
  const KPI = ({ icon: Icon, label, value, color, bgColor }) => (
    <View style={[s.kpiCard, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      <View style={[s.kpiIcon, { backgroundColor: bgColor }]}>
        <Icon size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.kpiLabel}>{label}</Text>
        <Text style={s.kpiValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );

  /* ═══ TABLE ROW ═══ */
  const TableRow = ({ cells, isHeader, danger }) => (
    <View style={[s.tableRow, isHeader && s.tableHeaderRow]}>
      {cells.map((c, i) => (
        <Text key={i} style={[s.tableCell, isHeader && s.tableHeaderCell, i === 0 && { flex: 2 }, danger && i === 1 && { color: theme.error, fontWeight: '700' }]} numberOfLines={1}>{c}</Text>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <AnimatedTouchable onPress={() => navigation?.goBack()} style={s.backBtn}>
          <ChevronLeft size={24} color={theme.textPrimary} />
        </AnimatedTouchable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.headerTitle}>Business Reports</Text>
          <Text style={s.headerSub}>Sales & Inventory Insights</Text>
        </View>
        <AnimatedTouchable onPress={handleExport} style={s.shareBtn} title="Export Report">
          <Share2 size={18} color={theme.gold} />
        </AnimatedTouchable>
        <AnimatedTouchable onPress={fetchData} style={[s.shareBtn, { marginLeft: 8 }]} title="Refresh">
          <RefreshCw size={18} color={theme.textSecondary} />
        </AnimatedTouchable>
      </View>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={theme.gold} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Report Type Toggle */}
        <View style={s.toggleContainer}>
          <TouchableOpacity style={[s.toggleBtn, reportType === 'sales' && s.toggleBtnActive]} onPress={() => { setReportType('sales'); setSearch(''); }}>
            <TrendingUp size={16} color={reportType === 'sales' ? theme.backgroundDeep : theme.textSecondary} />
            <Text style={[s.toggleText, reportType === 'sales' && s.toggleTextActive]}>Sales & Revenue</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.toggleBtn, reportType === 'inventory' && s.toggleBtnActive]} onPress={() => { setReportType('inventory'); setSearch(''); }}>
            <Package size={16} color={reportType === 'inventory' ? theme.backgroundDeep : theme.textSecondary} />
            <Text style={[s.toggleText, reportType === 'inventory' && s.toggleTextActive]}>Inventory</Text>
          </TouchableOpacity>
        </View>

        {/* Date Presets */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.presetsRow}>
          {PRESETS.map(p => (
            <TouchableOpacity key={p.key} style={[s.presetPill, preset === p.key && s.presetPillActive]} onPress={() => handlePreset(p.key)}>
              <Text style={[s.presetText, preset === p.key && s.presetTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Date Display */}
        <View style={s.dateBar}>
          <Calendar size={14} color={theme.textTertiary} />
          <Text style={s.dateText}>{startDate}  to  {endDate}</Text>
        </View>

        {/* Search */}
        <View style={s.searchBar}>
          <Search size={16} color={theme.textTertiary} />
          <TextInput style={s.searchInput} placeholder="Search records..." placeholderTextColor={theme.textTertiary} value={search} onChangeText={setSearch} />
        </View>

        {loading ? (
          <PremiumLoader message="Generating report..." />
        ) : reportType === 'sales' && salesReport ? (
          <>
            {/* Sales KPIs */}
            <View style={s.kpiGrid}>
              <KPI icon={DollarSign} label="Net Revenue" value={fmtPeso(salesReport.net)} color={theme.success} bgColor={`${theme.success}18`} />
              <KPI icon={Activity} label="Transactions" value={String(salesReport.count)} color={theme.info || '#3b82f6'} bgColor={`${theme.info || '#3b82f6'}18`} />
              <KPI icon={Tag} label="Avg Value" value={fmtPeso(salesReport.atv)} color={'#8b5cf6'} bgColor={'rgba(139,92,246,0.1)'} />
              <KPI icon={AlertTriangle} label="Discounts" value={fmtPeso(salesReport.discounts)} color={theme.error} bgColor={`${theme.error}18`} />
            </View>

            {/* Revenue Mix */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Revenue by Source</Text>
              <View style={s.tableCard}>
                <TableRow cells={['Source', 'Amount', '% Share']} isHeader />
                <TableRow cells={['Tattoo Services', fmtPeso(salesReport.service), salesReport.net > 0 ? `${((salesReport.service / salesReport.net) * 100).toFixed(1)}%` : '0%']} />
                <TableRow cells={['Retail POS', fmtPeso(salesReport.retail), salesReport.net > 0 ? `${((salesReport.retail / salesReport.net) * 100).toFixed(1)}%` : '0%']} />
              </View>
            </View>

            {/* Top Products */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Bestselling Retail Products</Text>
              <View style={s.tableCard}>
                <TableRow cells={['Product', 'Qty', 'Revenue']} isHeader />
                {salesReport.top.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).length > 0 ? (
                  salesReport.top.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map((p, i) => (
                    <TableRow key={i} cells={[p.name, String(p.qty), fmtPeso(p.rev)]} />
                  ))
                ) : (
                  <View style={s.emptyRow}><Text style={s.emptyText}>No retail products found for this period.</Text></View>
                )}
              </View>
            </View>
          </>
        ) : reportType === 'inventory' && invReport ? (
          <>
            {/* Inventory KPIs */}
            <View style={s.kpiGrid}>
              <KPI icon={DollarSign} label="Stock Value" value={fmtPeso(invReport.totalVal)} color={'#d97706'} bgColor={'rgba(217,119,6,0.1)'} />
              <KPI icon={Package} label="Items on Hand" value={String(invReport.totalQty)} color={theme.textPrimary} bgColor={`${theme.textTertiary}20`} />
              <KPI icon={AlertTriangle} label="Low Stock" value={`${invReport.lowCount} items`} color={invReport.lowCount > 0 ? theme.error : theme.success} bgColor={invReport.lowCount > 0 ? `${theme.error}18` : `${theme.success}18`} />
            </View>

            {/* Most Consumed */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Highest Turnover (Consumed)</Text>
              <View style={s.tableCard}>
                <TableRow cells={['Item', 'Used', 'Restocked']} isHeader />
                {invReport.topConsumed.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).length > 0 ? (
                  invReport.topConsumed.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map((p, i) => (
                    <TableRow key={i} cells={[p.name, `-${p.consumed}`, `+${p.added}`]} />
                  ))
                ) : (
                  <View style={s.emptyRow}><Text style={s.emptyText}>No consumption data for this period.</Text></View>
                )}
              </View>
            </View>

            {/* Low Stock Alerts */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Low Stock / Reorder Alerts</Text>
              <View style={s.tableCard}>
                <TableRow cells={['Item', 'Stock', 'Min']} isHeader />
                {invReport.lowItems.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).length > 0 ? (
                  invReport.lowItems.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map((p, i) => (
                    <TableRow key={i} cells={[p.name, String(p.quantity), String(p.min_stock_level)]} danger />
                  ))
                ) : (
                  <View style={s.emptyRow}><Text style={[s.emptyText, { color: theme.success }]}>All stock levels are healthy.</Text></View>
                )}
              </View>
            </View>
          </>
        ) : null}

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>Confidential Internal Report</Text>
          <Text style={s.footerText}>InkVistAR Studio</Text>
        </View>
      </ScrollView>

      {/* Custom Date Modal */}
      <Modal visible={customDateModalVisible} animationType="fade" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Custom Date Range</Text>
            <Text style={s.modalText}>Enter dates in YYYY-MM-DD format.</Text>
            
            <Text style={s.inputLabel}>Start Date</Text>
            <TextInput
              style={s.dateInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textTertiary}
              value={customStartDate}
              onChangeText={setCustomStartDate}
            />
            
            <Text style={s.inputLabel}>End Date</Text>
            <TextInput
              style={s.dateInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textTertiary}
              value={customEndDate}
              onChangeText={setCustomEndDate}
            />
            
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: theme.surfaceLight, borderWidth: 1, borderColor: theme.border }]} onPress={() => setCustomDateModalVisible(false)}>
                <Text style={[s.modalBtnText, { color: theme.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalBtn} onPress={() => { 
                if (customStartDate && customEndDate) {
                  setPreset('custom'); 
                  setStartDate(customStartDate); 
                  setEndDate(customEndDate); 
                  setCustomDateModalVisible(false); 
                } else {
                  Alert.alert('Error', 'Please enter valid start and end dates.');
                }
              }}>
                <Text style={s.modalBtnText}>Apply Filter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const getStyles = (theme, insets) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingTop: (insets?.top || 0) + 12, paddingBottom: 16,
    backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  headerTitle: { ...typography.h2, color: theme.textPrimary },
  headerSub: { ...typography.bodySmall, color: theme.gold, marginTop: 2 },
  backBtn: { padding: 4 },
  shareBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.surfaceLight, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: theme.border },
  scrollContent: { padding: 16, paddingBottom: 100 },

  // Toggle
  toggleContainer: { flexDirection: 'row', backgroundColor: theme.surfaceLight, borderRadius: borderRadius.lg, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: theme.border },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: borderRadius.md, gap: 6 },
  toggleBtnActive: { backgroundColor: theme.gold, ...shadows.subtle },
  toggleText: { ...typography.bodySmall, color: theme.textSecondary, fontWeight: '700' },
  toggleTextActive: { color: theme.backgroundDeep },

  // Presets
  presetsRow: { gap: 8, paddingBottom: 12 },
  presetPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.surfaceLight, borderWidth: 1, borderColor: theme.border },
  presetPillActive: { backgroundColor: theme.gold, borderColor: theme.gold },
  presetText: { ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '700' },
  presetTextActive: { color: theme.backgroundDeep },

  // Date bar
  dateBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: theme.surfaceLight, borderRadius: borderRadius.md, marginBottom: 12, borderWidth: 1, borderColor: theme.border },
  dateText: { ...typography.bodySmall, color: theme.textSecondary, fontWeight: '600' },

  // Search
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surface, paddingHorizontal: 14, paddingVertical: 12, borderRadius: borderRadius.lg, marginBottom: 16, borderWidth: 1, borderColor: theme.border },
  searchInput: { flex: 1, ...typography.body, color: theme.textPrimary },

  // KPIs
  kpiGrid: { gap: 10, marginBottom: 20 },
  kpiCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: borderRadius.xl, padding: 16, borderWidth: 1, borderColor: theme.border, gap: 14 },
  kpiIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  kpiLabel: { ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  kpiValue: { ...typography.h3, color: theme.textPrimary },

  // Section
  section: { marginBottom: 20 },
  sectionTitle: { ...typography.h4, color: theme.textPrimary, marginBottom: 10 },

  // Table
  tableCard: { backgroundColor: theme.surface, borderRadius: borderRadius.xl, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
  tableHeaderRow: { backgroundColor: theme.surfaceLight },
  tableCell: { flex: 1, ...typography.bodySmall, color: theme.textPrimary },
  tableHeaderCell: { fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 },
  emptyRow: { padding: 24, alignItems: 'center' },
  emptyText: { ...typography.bodySmall, color: theme.textTertiary, fontStyle: 'italic' },

  // Footer
  footer: { alignItems: 'center', paddingVertical: 24, gap: 4 },
  footerText: { ...typography.bodyXSmall, color: theme.textTertiary },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: theme.surface, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: theme.border },
  modalTitle: { ...typography.h3, color: theme.textPrimary, marginBottom: 8 },
  modalText: { ...typography.body, color: theme.textSecondary, marginBottom: 20 },
  inputLabel: { ...typography.bodySmall, color: theme.textSecondary, fontWeight: '600', marginBottom: 6 },
  dateInput: { backgroundColor: theme.surfaceLight, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, ...typography.body, color: theme.textPrimary, marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, backgroundColor: theme.gold, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalBtnText: { ...typography.button, color: '#fff' },
});
