import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAdminAnalytics } from '../src/utils/api';
import { BarChart, PieChart } from 'react-native-chart-kit';

export const AdminAnalytics = ({ navigation }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      const res = await getAdminAnalytics();
      if (res.success && res.data) {
        setData(res.data);
      }
      setLoading(false);
    };
    fetchStats();
  }, []);

  const screenWidth = Dimensions.get('window').width - 40;

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  // Fallback for empty data
  const revValue = data?.revenue?.total || 0;
  
  const apptCompleted = parseInt(data?.appointments?.completed || 0);
  const apptScheduled = parseInt(data?.appointments?.scheduled || 0);
  const apptCancelled = parseInt(data?.appointments?.cancelled || 0);
  
  const pieData = [
    { name: 'Completed', count: apptCompleted, color: '#10b981', legendFontColor: '#9ca3af', legendFontSize: 12 },
    { name: 'Scheduled', count: apptScheduled, color: '#3b82f6', legendFontColor: '#9ca3af', legendFontSize: 12 },
    { name: 'Cancelled', count: apptCancelled, color: '#ef4444', legendFontColor: '#9ca3af', legendFontSize: 12 },
  ].filter(d => d.count > 0);

  const artistNames = (data?.artists || []).slice(0, 4).map(a => a.name.split(' ')[0]);
  const artistRevs = (data?.artists || []).slice(0, 4).map(a => a.revenue || 0);

  const barData = {
    labels: artistNames.length ? artistNames : ['None'],
    datasets: [{ data: artistRevs.length ? artistRevs : [0] }]
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Ionicons name="bar-chart" size={24} color="#0ea5e9" style={{ marginRight: 10 }} />
          <Text style={styles.headerTitle}>Analytics</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>

        <View style={styles.cardRow}>
           <View style={[styles.statCard, { borderLeftColor: '#0ea5e9', borderLeftWidth: 4 }]}>
             <Text style={styles.statLabel}>Total Revenue</Text>
             <Text style={styles.statValue}>₱{revValue}</Text>
           </View>
           <View style={[styles.statCard, { borderLeftColor: '#f59e0b', borderLeftWidth: 4 }]}>
             <Text style={styles.statLabel}>Total Appts</Text>
             <Text style={styles.statValue}>{data?.appointments?.total || 0}</Text>
           </View>
        </View>

        <View style={styles.chartTitleContainer}>
          <Text style={styles.chartTitle}>Appointments Status</Text>
        </View>
        {pieData.length > 0 ? (
          <View style={styles.chartCard}>
            <PieChart
              data={pieData}
              width={screenWidth}
              height={180}
              chartConfig={{ color: () => '#fff' }}
              accessor="count"
              backgroundColor="transparent"
              paddingLeft="15"
              absolute
            />
          </View>
        ) : (
          <View style={styles.emptyCard}><Text style={{color:'#9ca3af'}}>No appointment data</Text></View>
        )}

        <View style={styles.chartTitleContainer}>
          <Text style={styles.chartTitle}>Top Artists Revenue</Text>
        </View>
        <View style={styles.chartCard}>
          <BarChart
            data={barData}
            width={screenWidth}
            height={220}
            yAxisLabel="₱"
            chartConfig={{
              backgroundColor: '#1f2937',
              backgroundGradientFrom: '#1f2937',
              backgroundGradientTo: '#1f2937',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(14, 165, 233, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(156, 163, 175, ${opacity})`,
              barPercentage: 0.5,
            }}
            style={{ borderRadius: 12 }}
          />
        </View>

        <View style={styles.chartTitleContainer}>
          <Text style={styles.chartTitle}>Top Consumed Inventory</Text>
        </View>
        <View style={styles.chartCard}>
          {(data?.inventory || []).length === 0 ? (
             <Text style={{color:'#9ca3af', textAlign:'center', padding: 20}}>No inventory transactions yet</Text>
          ) : (
            (data?.inventory || []).slice(0, 5).map((item, idx) => (
              <View key={idx} style={styles.listRow}>
                <Text style={styles.listName}>{item.name}</Text>
                <Text style={styles.listValue}>{item.used} {item.unit}</Text>
              </View>
            ))
          )}
        </View>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 50, backgroundColor: '#1f2937', borderBottomWidth: 1, borderBottomColor: '#374151' },
  backButton: { padding: 8, marginRight: 8 },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  content: { padding: 20, paddingBottom: 50 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  statCard: { backgroundColor: '#1f2937', padding: 20, borderRadius: 12, width: '48%' },
  statLabel: { color: '#9ca3af', fontSize: 13, marginBottom: 8 },
  statValue: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  chartTitleContainer: { marginBottom: 10, marginTop: 10 },
  chartTitle: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  chartCard: { backgroundColor: '#1f2937', borderRadius: 12, paddingVertical: 15, marginBottom: 20, alignItems: 'center' },
  emptyCard: { backgroundColor: '#1f2937', borderRadius: 12, paddingVertical: 30, marginBottom: 20, alignItems: 'center' },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#374151', width: '100%' },
  listName: { color: '#d1d5db', fontSize: 14, flex: 1 },
  listValue: { color: '#10b981', fontSize: 14, fontWeight: 'bold' },
});
