// screens/CustomerArtistProfile.jsx
import { useState, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, 
  ScrollView, SafeAreaView, Image, ActivityIndicator, Dimensions 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { fetchAPI, getArtistPortfolio } from '../src/utils/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function CustomerArtistProfile({ route, onBack, onNavigate }) {
  const { artistId } = route.params || {};
  const [artist, setArtist] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (artistId) {
      loadArtistData();
    }
  }, [artistId]);

  const loadArtistData = async () => {
    try {
      setLoading(true);
      // Fetch artist profile
      const result = await fetchAPI(`/artist/profile/${artistId}`);
      if (result.success) {
        setArtist(result.profile);
      }

      // Fetch portfolio
      const portfolioResult = await getArtistPortfolio(artistId);
      if (portfolioResult.success) {
        // Filter only public works
        setPortfolio(portfolioResult.works?.filter(w => w.is_public !== false) || []);
      }
    } catch (error) {
      console.error('Error loading artist profile:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#daa520" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Cover Image & Header */}
        <View style={styles.headerImageContainer}>
          <Image 
            source={{ uri: artist?.profile_image || 'https://images.unsplash.com/photo-1598371839696-5c5bb00bdc28?auto=format&fit=crop&q=80&w=1200' }} 
            style={styles.headerImage} 
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.8)']}
            style={styles.headerGradient}
          />
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.artistName}>{artist?.name || 'Artist Name'}</Text>
            <Text style={styles.artistSpecialty}>{artist?.specialization || 'Master Artist'}</Text>
          </View>
        </View>

        <View style={styles.content}>
          {/* Stats Bar */}
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{portfolio.length}</Text>
              <Text style={styles.statLabel}>Works</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{artist?.rating || '4.9'}</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{artist?.experience || '5'}+ yrs</Text>
              <Text style={styles.statLabel}>Exp</Text>
            </View>
          </View>

          {/* About Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About Artist</Text>
            <Text style={styles.bioText}>
              {artist?.bio || 'Professional tattoo artist specializing in creating unique, custom designs that tell a story. Committed to the highest standards of hygiene and artistic excellence.'}
            </Text>
          </View>

          {/* Portfolio Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Portfolio</Text>
            <View style={styles.portfolioGrid}>
              {portfolio.length > 0 ? portfolio.map((work) => (
                <TouchableOpacity key={work.id} style={styles.portfolioItem}>
                  <Image source={{ uri: work.image_url }} style={styles.portfolioImage} />
                  {work.price_estimate && (
                    <View style={{position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 4, paddingHorizontal: 6, borderBottomLeftRadius: 12, borderBottomRightRadius: 12}}>
                      <Text style={{color: '#daa520', fontSize: 11, fontWeight: '700', textAlign: 'center'}}>₱{Number(work.price_estimate).toLocaleString()}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )) : (
                <Text style={styles.emptyText}>No portfolio items available.</Text>
              )}
            </View>
          </View>

          {/* Book Now Button */}
          <TouchableOpacity 
            style={styles.bookButton}
            onPress={() => onNavigate('booking-create', { artistId: artistId })}
          >
            <LinearGradient
              colors={['#000000', '#daa520']}
              style={styles.bookButtonGradient}
            >
              <Ionicons name="calendar" size={20} color="#ffffff" />
              <Text style={styles.bookButtonText}>Book an Appointment</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerImageContainer: {
    height: 350,
    width: '100%',
    position: 'relative',
  },
  headerImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  headerInfo: {
    position: 'absolute',
    bottom: 24,
    left: 24,
  },
  artistName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  artistSpecialty: {
    fontSize: 16,
    color: '#daa520',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  content: {
    padding: 24,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -32,
    backgroundColor: '#ffffff',
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#fafafa',
    borderRadius: 20,
    padding: 20,
    marginBottom: 32,
    justifyContent: 'space-around',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#e5e7eb',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  bioText: {
    fontSize: 15,
    color: '#4b5563',
    lineHeight: 24,
  },
  portfolioGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  portfolioItem: {
    width: (SCREEN_WIDTH - 60) / 3,
    height: (SCREEN_WIDTH - 60) / 3,
    borderRadius: 12,
    overflow: 'hidden',
  },
  portfolioImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  emptyText: {
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  bookButton: {
    marginTop: 8,
    marginBottom: 40,
  },
  bookButtonGradient: {
    flexDirection: 'row',
    height: 60,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#daa520',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  bookButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
});
